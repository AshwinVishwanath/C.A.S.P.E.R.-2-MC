/**
 * Tests for the dual-mode message parser.
 *
 * Tests FC_MSG_FAST (21B), FC_MSG_GPS (18B), FC_MSG_EVENT (11B),
 * GS_MSG_TELEM (39B), GS_MSG_STATUS (24B) with computed CRC fixtures.
 * Also tests edge cases: negative values, saturated GPS, unknown msg IDs.
 *
 * CRCs are never hand-written — computed via crc32_compute at test runtime.
 */

import { describe, it, expect } from 'vitest';
import { parse_packet } from '../parser';
import { crc32_compute } from '../crc32';
import {
  MSG_ID_FAST,
  MSG_ID_GPS,
  MSG_ID_EVENT,
  MSG_ID_GS_TELEM,
  MSG_ID_GS_STATUS,
  MSG_ID_ACK_ARM,
  MSG_ID_NACK,
  MSG_ID_CONFIRM,
  SIZE_FC_MSG_FAST,
  SIZE_FC_MSG_GPS,
  SIZE_FC_MSG_EVENT,
  SIZE_GS_MSG_TELEM,
  SIZE_GS_MSG_STATUS
} from '../constants';
import { FsmState, NackError } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write u16 LE into buf at offset. */
function write_u16(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xFF;
  buf[offset + 1] = (val >> 8) & 0xFF;
}

/** Write u24 LE into buf at offset. */
function write_u24(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xFF;
  buf[offset + 1] = (val >> 8) & 0xFF;
  buf[offset + 2] = (val >> 16) & 0xFF;
}

/** Write i16 LE into buf at offset. */
function write_i16(buf: Uint8Array, offset: number, val: number): void {
  const unsigned = val < 0 ? val + 0x10000 : val;
  buf[offset] = unsigned & 0xFF;
  buf[offset + 1] = (unsigned >> 8) & 0xFF;
}

/** Write u32 LE into buf at offset. */
function write_u32(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xFF;
  buf[offset + 1] = (val >> 8) & 0xFF;
  buf[offset + 2] = (val >> 16) & 0xFF;
  buf[offset + 3] = (val >> 24) & 0xFF;
}

/** Write i32 LE into buf at offset. */
function write_i32(buf: Uint8Array, offset: number, val: number): void {
  write_u32(buf, offset, val >>> 0);
}

/** Append correct CRC-32 to last 4 bytes of a packet. */
function append_crc(pkt: Uint8Array): void {
  const data = pkt.subarray(0, pkt.length - 4);
  const crc = crc32_compute(data);
  write_u32(pkt, pkt.length - 4, crc);
}

// ---------------------------------------------------------------------------
// FC_MSG_FAST tests (21-byte layout, u24 altitude at [3..5])
// ---------------------------------------------------------------------------

describe('parse FC_MSG_FAST', () => {
  /**
   * Build a 21-byte FC_MSG_FAST fixture.
   *
   * Layout:
   *   [0]     0x01
   *   [1-2]   status u16 LE
   *   [3-5]   alt_raw u24 LE — alt_m = raw * 0.01
   *   [6-7]   vel_raw i16 LE — vel_mps = raw * 0.1
   *   [8-12]  quat 5 bytes
   *   [13-14] time_raw u16 LE — flight_time_s = raw * 0.1
   *   [15]    batt_raw u8   — batt_v = 6.0 + raw * 0.012
   *   [16]    seq u8
   *   [17-20] CRC-32 LE (computed)
   */
  function build_fast_packet(opts: {
    status_lsb?: number;
    status_msb?: number;
    alt_raw?: number;
    vel_raw?: number;
    quat_bytes?: Uint8Array;
    time_raw?: number;
    batt_raw?: number;
    seq?: number;
    bad_crc?: boolean;
  } = {}): Uint8Array {
    const pkt = new Uint8Array(SIZE_FC_MSG_FAST); // 21 bytes
    pkt[0] = MSG_ID_FAST;
    pkt[1] = opts.status_lsb ?? 0x00;
    pkt[2] = opts.status_msb ?? 0x00;
    write_u24(pkt, 3, opts.alt_raw ?? 0);          // u24 at [3..5]
    write_i16(pkt, 6, opts.vel_raw ?? 0);           // i16 at [6..7]
    // Quaternion bytes [8..12]
    const qb = opts.quat_bytes ?? new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]);
    for (let i = 0; i < 5; i++) pkt[8 + i] = qb[i];
    write_u16(pkt, 13, opts.time_raw ?? 0);         // u16 at [13..14]
    pkt[15] = opts.batt_raw ?? 0;
    pkt[16] = opts.seq ?? 0;
    if (!opts.bad_crc) {
      append_crc(pkt);
    }
    return pkt;
  }

  it('should parse a valid FC_MSG_FAST packet', () => {
    // alt_raw=10000 -> 10000 * 0.01 = 100.0 m (altitude encoded in cm)
    // vel_raw=500   -> 500 * 0.1   = 50.0 m/s
    // time_raw=300  -> 300 * 0.1   = 30.0 s
    // batt_raw=100  -> 6.0 + 100 * 0.012 = 7.2 V
    const pkt = build_fast_packet({
      alt_raw: 10000,
      vel_raw: 500,
      time_raw: 300,
      batt_raw: 100
    });

    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('fc_fast');
    if (result.message.type !== 'fc_fast') return;

    const data = result.message.data;
    expect(data.msg_id).toBe(MSG_ID_FAST);
    expect(data.alt_m).toBeCloseTo(100.0, 2);
    expect(data.vel_mps).toBeCloseTo(50.0, 1);
    expect(data.flight_time_s).toBeCloseTo(30.0, 1);
    expect(data.batt_v).toBeCloseTo(7.2, 2);
    expect(data.crc_ok).toBe(true);
    expect(data.corrected).toBe(false);
  });

  it('should decode altitude at centimetre resolution', () => {
    // alt_raw=15075 -> 150.75 m (0.01 m resolution)
    const pkt = build_fast_packet({ alt_raw: 15075 });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_fast') return;
    expect(result.message.data.alt_m).toBeCloseTo(150.75, 2);
  });

  it('should handle negative velocity', () => {
    const pkt = build_fast_packet({ vel_raw: -200 }); // -200 * 0.1 = -20.0 m/s
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.message.type !== 'fc_fast') return;
    expect(result.message.data.vel_mps).toBeCloseTo(-20.0, 1);
  });

  it('should decode status bits correctly', () => {
    // ARM1 + CNT1 + CNT2, Boost state, fired
    const pkt = build_fast_packet({
      status_lsb: 0x13,  // ARM1(0x10) | CNT2(0x02) | CNT1(0x01)
      status_msb: 0x18   // Boost(0x1 << 4) | FIRED(0x08)
    });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_fast') return;

    const st = result.message.data.status;
    expect(st.continuity[0]).toBe(true);
    expect(st.continuity[1]).toBe(true);
    expect(st.continuity[2]).toBe(false);
    expect(st.armed[0]).toBe(true);
    expect(st.armed[1]).toBe(false);
    expect(st.fsm_state).toBe(FsmState.Boost);
    expect(st.fired).toBe(true);
  });

  it('should detect bad CRC', () => {
    const pkt = build_fast_packet({ bad_crc: true });
    // Manually set wrong CRC at [17..20]
    write_u32(pkt, pkt.length - 4, 0xDEADBEEF);
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_fast') return;
    expect(result.message.data.crc_ok).toBe(false);
  });

  it('should handle max u24 altitude (0xFFFFFF)', () => {
    // 0xFFFFFF = 16777215 -> 16777215 * 0.01 = 167772.15 m
    const pkt = build_fast_packet({ alt_raw: 0xFFFFFF });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_fast') return;
    expect(result.message.data.alt_m).toBeCloseTo(167772.15, 1);
  });

  it('should handle zero values', () => {
    const pkt = build_fast_packet();
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_fast') return;
    expect(result.message.data.alt_m).toBe(0);
    expect(result.message.data.vel_mps).toBe(0);
    expect(result.message.data.flight_time_s).toBe(0);
    expect(result.message.data.batt_v).toBeCloseTo(6.0, 2);
  });

  it('should parse seq byte from offset 16', () => {
    const pkt = build_fast_packet({ seq: 0xEA });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_fast') return;
    expect(result.message.data.seq).toBe(0xEA);
  });

  it('should reject packet that is too short', () => {
    const short_pkt = new Uint8Array([MSG_ID_FAST, 0x00]);
    const result = parse_packet(short_pkt);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.msg_id).toBe(MSG_ID_FAST);
    expect(result.error).toContain('too short');
  });
});

// ---------------------------------------------------------------------------
// FC_MSG_GPS tests (18-byte layout, u24 alt_msl at [9..11])
// ---------------------------------------------------------------------------

describe('parse FC_MSG_GPS', () => {
  /**
   * Build an 18-byte FC_MSG_GPS fixture.
   *
   * Layout:
   *   [0]     0x02
   *   [1-4]   dlat_mm i32 LE
   *   [5-8]   dlon_mm i32 LE
   *   [9-11]  alt_raw u24 LE — alt_msl_m = raw * 0.01
   *   [12]    fix_type u8
   *   [13]    sat_count u8
   *   [14-17] CRC-32 LE (computed)
   */
  function build_gps_packet(opts: {
    dlat_mm?: number;
    dlon_mm?: number;
    alt_raw?: number;
    fix_type?: number;
    sat_count?: number;
  } = {}): Uint8Array {
    const pkt = new Uint8Array(SIZE_FC_MSG_GPS); // 18 bytes
    pkt[0] = MSG_ID_GPS;
    write_i32(pkt, 1, opts.dlat_mm ?? 0);
    write_i32(pkt, 5, opts.dlon_mm ?? 0);
    write_u24(pkt, 9, opts.alt_raw ?? 0);    // u24 at [9..11]
    pkt[12] = opts.fix_type ?? 3;
    pkt[13] = opts.sat_count ?? 10;
    append_crc(pkt);
    return pkt;
  }

  it('should parse valid GPS packet', () => {
    // dlat_mm=50000  -> 50.0 m north
    // dlon_mm=-30000 -> -30.0 m west
    // alt_raw=150000 -> 150000 * 0.01 = 1500.0 m MSL (altitude encoded in cm)
    const pkt = build_gps_packet({
      dlat_mm: 50000,
      dlon_mm: -30000,
      alt_raw: 150000,
      fix_type: 3,
      sat_count: 12
    });

    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_gps') return;

    const data = result.message.data;
    expect(data.dlat_m).toBeCloseTo(50.0, 1);
    expect(data.dlon_m).toBeCloseTo(-30.0, 1);
    expect(data.alt_msl_m).toBeCloseTo(1500.0, 1);
    expect(data.fix_type).toBe(3);
    expect(data.sat_count).toBe(12);
    expect(data.range_saturated).toBe(false);
    expect(data.crc_ok).toBe(true);
  });

  it('should decode GPS altitude at centimetre resolution', () => {
    // alt_raw=120050 -> 120050 * 0.01 = 1200.50 m
    const pkt = build_gps_packet({ alt_raw: 120050 });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_gps') return;
    expect(result.message.data.alt_msl_m).toBeCloseTo(1200.50, 2);
  });

  it('should detect saturated GPS range (i32 max)', () => {
    const pkt = build_gps_packet({ dlat_mm: 0x7FFFFFFF });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_gps') return;
    expect(result.message.data.range_saturated).toBe(true);
  });

  it('should detect saturated GPS range (i32 min)', () => {
    // Write i32 min = 0x80000000 for dlat directly as LE bytes
    const pkt = new Uint8Array(SIZE_FC_MSG_GPS); // 18 bytes
    pkt[0] = MSG_ID_GPS;
    // i32 min: 0x80000000 in little-endian is [0x00, 0x00, 0x00, 0x80]
    pkt[1] = 0x00; pkt[2] = 0x00; pkt[3] = 0x00; pkt[4] = 0x80;
    write_i32(pkt, 5, 0);
    write_u24(pkt, 9, 0);
    pkt[12] = 3;
    pkt[13] = 5;
    append_crc(pkt);

    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_gps') return;
    expect(result.message.data.range_saturated).toBe(true);
  });

  it('should handle zero GPS position', () => {
    const pkt = build_gps_packet();
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_gps') return;
    expect(result.message.data.dlat_m).toBe(0);
    expect(result.message.data.dlon_m).toBe(0);
  });

  it('should reject short GPS packet', () => {
    const short_pkt = new Uint8Array([MSG_ID_GPS, 0x00, 0x00]);
    const result = parse_packet(short_pkt);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FC_MSG_EVENT tests
// ---------------------------------------------------------------------------

describe('parse FC_MSG_EVENT', () => {
  function build_event_packet(opts: {
    event_type?: number;
    event_data?: number;
    time_raw?: number;
  } = {}): Uint8Array {
    const pkt = new Uint8Array(SIZE_FC_MSG_EVENT);
    pkt[0] = MSG_ID_EVENT;
    pkt[1] = opts.event_type ?? 0x01;
    write_u16(pkt, 2, opts.event_data ?? 0);
    write_u16(pkt, 4, opts.time_raw ?? 0);
    pkt[6] = 0x00; // reserved
    append_crc(pkt);
    return pkt;
  }

  it('should parse valid event packet', () => {
    const pkt = build_event_packet({
      event_type: 0x03,  // Apogee
      event_data: 5000,
      time_raw: 450      // 45.0 s
    });

    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_event') return;

    const data = result.message.data;
    expect(data.event_type).toBe(0x03);
    expect(data.event_data).toBe(5000);
    expect(data.flight_time_s).toBeCloseTo(45.0, 1);
    expect(data.crc_ok).toBe(true);
  });

  it('should reject short event packet', () => {
    const result = parse_packet(new Uint8Array([MSG_ID_EVENT]));
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// GS_MSG_TELEM tests (39-byte layout, u24 altitude at [3..5])
// ---------------------------------------------------------------------------

describe('parse GS_MSG_TELEM', () => {
  /**
   * Build a 39-byte GS_MSG_TELEM fixture.
   *
   * Layout:
   *   [0]     0x10
   *   [1-2]   status u16 LE
   *   [3-5]   alt_raw u24 LE — alt_m = raw * 0.01
   *   [6-7]   vel_raw i16 LE — vel_mps = raw * 0.1
   *   [8-12]  quat 5 bytes
   *   [13-14] time_raw u16 LE
   *   [15]    batt_raw u8
   *   [16]    seq u8
   *   [17-18] rssi_raw i16 LE — rssi_dbm = raw * 0.1
   *   [19]    snr_raw i8     — snr_db = raw * 0.25
   *   [20-21] freq_err i16 LE (Hz)
   *   [22-23] data_age u16 LE (ms)
   *   [24]    recovery bitmap
   *   [25-26] mach_raw u16 LE (x0.001)
   *   [27-28] qbar_raw u16 LE (Pa)
   *   [29-30] roll_raw i16 LE (x0.1)
   *   [31-32] pitch_raw i16 LE (x0.1)
   *   [33-34] yaw_raw i16 LE (x0.1)
   *   [35-38] CRC-32 LE (computed)
   */
  function build_gs_telem_packet(opts: {
    alt_raw?: number;
    vel_raw?: number;
    rssi_raw?: number;
    snr_raw?: number;
    freq_err?: number;
    data_age_ms?: number;
    recovery_byte?: number;
  } = {}): Uint8Array {
    const pkt = new Uint8Array(SIZE_GS_MSG_TELEM); // 39 bytes
    pkt[0] = MSG_ID_GS_TELEM;
    // status at [1-2] = 0 (Pad state, no armed channels)
    write_u24(pkt, 3, opts.alt_raw ?? 0);
    write_i16(pkt, 6, opts.vel_raw ?? 0);
    // quat bytes [8-12] = 0 (null quaternion — will unpack to something)
    // time, batt, seq = 0
    const rssi = opts.rssi_raw ?? 0;
    write_i16(pkt, 17, rssi);
    const snr = opts.snr_raw ?? 0;
    pkt[19] = snr < 0 ? (snr + 0x100) & 0xFF : snr & 0xFF;
    write_i16(pkt, 20, opts.freq_err ?? 0);
    write_u16(pkt, 22, opts.data_age_ms ?? 0);
    pkt[24] = opts.recovery_byte ?? 0;
    append_crc(pkt);
    return pkt;
  }

  it('should parse a valid GS_MSG_TELEM packet and verify CRC', () => {
    // alt_raw=25000 -> 25000 * 0.01 = 250.0 m
    // vel_raw=1200  -> 1200 * 0.1   = 120.0 m/s
    // rssi_raw=-800 -> -800 * 0.1   = -80.0 dBm
    // snr_raw=20    -> 20 * 0.25    = 5.0 dB
    // data_age=100  -> 100 ms
    const pkt = build_gs_telem_packet({
      alt_raw: 25000,
      vel_raw: 1200,
      rssi_raw: -800,
      snr_raw: 20,
      data_age_ms: 100
    });

    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('gs_telem');
    if (result.message.type !== 'gs_telem') return;

    const data = result.message.data;
    expect(data.msg_id).toBe(MSG_ID_GS_TELEM);
    expect(data.alt_m).toBeCloseTo(250.0, 2);
    expect(data.vel_mps).toBeCloseTo(120.0, 1);
    expect(data.rssi_dbm).toBeCloseTo(-80.0, 1);
    expect(data.snr_db).toBeCloseTo(5.0, 2);
    expect(data.data_age_ms).toBe(100);
    expect(data.stale).toBe(false);
    expect(data.crc_ok).toBe(true);
  });

  it('should decode altitude at centimetre resolution', () => {
    // alt_raw=300075 -> 300075 * 0.01 = 3000.75 m
    const pkt = build_gs_telem_packet({ alt_raw: 300075 });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'gs_telem') return;
    expect(result.message.data.alt_m).toBeCloseTo(3000.75, 2);
  });

  it('should flag stale when data_age_ms exceeds threshold', () => {
    // STALE_THRESHOLD_MS = 500, so data_age=600 should set stale=true
    const pkt = build_gs_telem_packet({ data_age_ms: 600 });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'gs_telem') return;
    expect(result.message.data.stale).toBe(true);
  });

  it('should decode recovery bitmap', () => {
    // bit7=1(recovered), bits6:4=5(method=5), bits3:0=0xA(confidence=10)
    // 0b10101010 = 0xAA -> recovered=true, method=(0xAA>>4)&0x7=0xA&0x7=2, confidence=0xA
    const pkt = build_gs_telem_packet({ recovery_byte: 0xAA });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'gs_telem') return;
    expect(result.message.data.recovery.recovered).toBe(true);
    expect(result.message.data.recovery.method).toBe(2);
    expect(result.message.data.recovery.confidence).toBe(10);
  });

  it('should reject GS_MSG_TELEM shorter than 39 bytes', () => {
    const short_pkt = new Uint8Array([MSG_ID_GS_TELEM, 0x00, 0x01]);
    const result = parse_packet(short_pkt);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.msg_id).toBe(MSG_ID_GS_TELEM);
    expect(result.error).toContain('too short');
  });
});

// ---------------------------------------------------------------------------
// Edge cases and unknown message tests
// ---------------------------------------------------------------------------

describe('parse edge cases', () => {
  it('should return error for empty payload', () => {
    const result = parse_packet(new Uint8Array([]));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Empty');
  });

  it('should return unknown for unrecognised message ID', () => {
    const pkt = new Uint8Array([0xFF, 0x01, 0x02, 0x03]);
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.type).toBe('unknown');
    if (result.message.type === 'unknown') {
      expect(result.message.msg_id).toBe(0xFF);
    }
  });

  it('should return gs_gps stub for MSG_ID_GS_GPS', () => {
    const pkt = new Uint8Array([0x11, 0x01, 0x02]);
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.type).toBe('gs_gps');
  });

  it('should return gs_event stub for MSG_ID_GS_EVENT', () => {
    const pkt = new Uint8Array([0x12, 0x01, 0x02]);
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.type).toBe('gs_event');
  });

  it('should reject MSG_ID_GS_STATUS packet that is too short', () => {
    // 0x13 requires 24 bytes minimum; a 3-byte packet must fail.
    const pkt = new Uint8Array([MSG_ID_GS_STATUS, 0x01, 0x02]);
    const result = parse_packet(pkt);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.msg_id).toBe(MSG_ID_GS_STATUS);
    expect(result.error).toContain('too short');
  });

  it('should return gs_corrupt stub for MSG_ID_GS_CORRUPT', () => {
    const pkt = new Uint8Array([0x14, 0x01, 0x02]);
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.type).toBe('gs_corrupt');
  });

  it('should handle command echo IDs as unknown', () => {
    // 0x80 is MSG_ID_CMD_ARM (not MSG_ID_ACK_ARM=0xA0) — should be unknown
    const arm_echo = new Uint8Array(12);
    arm_echo[0] = 0x80;
    const result = parse_packet(arm_echo);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.type).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// GS_MSG_STATUS tests (24-byte authoritative v5 layout)
// ---------------------------------------------------------------------------

describe('parse GS_MSG_STATUS', () => {
  /**
   * Build a 24-byte GS_MSG_STATUS fixture.
   *
   * Layout:
   *   [0]     0x13
   *   [1]     radio_profile u8
   *   [2]     last_rssi i8 (dBm)
   *   [3]     last_snr i8 (dB)
   *   [4-5]   rx_pkt_count u16 LE
   *   [6-7]   rx_crc_fail u16 LE
   *   [8-11]  ground_pressure_pa u32 LE
   *   [12-15] ground_lat i32 LE (deg * 1e7)
   *   [16-19] ground_lon i32 LE (deg * 1e7)
   *   [20-23] CRC-32 LE (computed)
   */
  function build_gs_status_packet(opts: {
    radio_profile?: number;
    last_rssi?: number;
    last_snr?: number;
    rx_pkt_count?: number;
    rx_crc_fail?: number;
    ground_pressure_pa?: number;
    ground_lat_raw?: number;
    ground_lon_raw?: number;
    bad_crc?: boolean;
  } = {}): Uint8Array {
    const pkt = new Uint8Array(SIZE_GS_MSG_STATUS); // 24 bytes
    pkt[0] = MSG_ID_GS_STATUS;
    pkt[1] = opts.radio_profile ?? 0;
    // i8 last_rssi: encode as two's complement
    const rssi = opts.last_rssi ?? 0;
    pkt[2] = rssi < 0 ? (rssi + 0x100) & 0xFF : rssi & 0xFF;
    // i8 last_snr
    const snr = opts.last_snr ?? 0;
    pkt[3] = snr < 0 ? (snr + 0x100) & 0xFF : snr & 0xFF;
    write_u16(pkt, 4, opts.rx_pkt_count ?? 0);
    write_u16(pkt, 6, opts.rx_crc_fail ?? 0);
    write_u32(pkt, 8, opts.ground_pressure_pa ?? 0);
    write_i32(pkt, 12, opts.ground_lat_raw ?? 0);
    write_i32(pkt, 16, opts.ground_lon_raw ?? 0);
    if (!opts.bad_crc) {
      append_crc(pkt);
    }
    return pkt;
  }

  it('should parse a valid 24-byte GS_MSG_STATUS packet with correct CRC', () => {
    // radio_profile=1 (Profile B SF8)
    // last_rssi=-90   (dBm)
    // last_snr=8      (dB)
    // rx_pkt_count=1000
    // rx_crc_fail=5
    // ground_pressure_pa=101325 (standard atmosphere in Pa)
    // ground_lat_raw=378543000  -> 378543000 * 1e-7 = 37.8543 deg
    // ground_lon_raw=-1223090000 -> -1223090000 * 1e-7 = -122.309 deg
    const pkt = build_gs_status_packet({
      radio_profile: 1,
      last_rssi: -90,
      last_snr: 8,
      rx_pkt_count: 1000,
      rx_crc_fail: 5,
      ground_pressure_pa: 101325,
      ground_lat_raw: 378543000,
      ground_lon_raw: -1223090000
    });

    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('gs_status');
    if (result.message.type !== 'gs_status') return;

    const data = result.message.data;
    expect(data.msg_id).toBe(MSG_ID_GS_STATUS);
    expect(data.radio_profile).toBe(1);
    expect(data.last_rssi_dbm).toBe(-90);
    expect(data.last_snr_db).toBe(8);
    expect(data.rx_pkt_count).toBe(1000);
    expect(data.rx_crc_fail).toBe(5);
    expect(data.ground_pressure_pa).toBe(101325);
    expect(data.ground_lat_deg).toBeCloseTo(37.8543, 4);
    expect(data.ground_lon_deg).toBeCloseTo(-122.309, 3);
    expect(data.crc_ok).toBe(true);
  });

  it('should detect bad CRC and set crc_ok=false while still decoding fields', () => {
    const pkt = build_gs_status_packet({ radio_profile: 0, last_rssi: -75, bad_crc: true });
    write_u32(pkt, 20, 0xDEADBEEF); // corrupt CRC at [20..23]
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'gs_status') return;
    expect(result.message.data.crc_ok).toBe(false);
    // Fields are still decoded even when CRC fails
    expect(result.message.data.last_rssi_dbm).toBe(-75);
  });

  it('should reject GS_MSG_STATUS shorter than 24 bytes', () => {
    const short_pkt = new Uint8Array([MSG_ID_GS_STATUS, 0x00, 0x00]);
    const result = parse_packet(short_pkt);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.msg_id).toBe(MSG_ID_GS_STATUS);
    expect(result.error).toContain('too short');
  });

  it('should decode zero values correctly', () => {
    const pkt = build_gs_status_packet();
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'gs_status') return;
    const data = result.message.data;
    expect(data.radio_profile).toBe(0);
    expect(data.last_rssi_dbm).toBe(0);
    expect(data.last_snr_db).toBe(0);
    expect(data.rx_pkt_count).toBe(0);
    expect(data.rx_crc_fail).toBe(0);
    expect(data.ground_pressure_pa).toBe(0);
    expect(data.ground_lat_deg).toBe(0);
    expect(data.ground_lon_deg).toBe(0);
    expect(data.crc_ok).toBe(true);
  });

  it('should decode negative RSSI and SNR', () => {
    const pkt = build_gs_status_packet({ last_rssi: -120, last_snr: -5 });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'gs_status') return;
    expect(result.message.data.last_rssi_dbm).toBe(-120);
    expect(result.message.data.last_snr_db).toBe(-5);
  });

  it('should decode maximum rx_pkt_count (0xFFFF)', () => {
    const pkt = build_gs_status_packet({ rx_pkt_count: 0xFFFF, rx_crc_fail: 0x1234 });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'gs_status') return;
    expect(result.message.data.rx_pkt_count).toBe(65535);
    expect(result.message.data.rx_crc_fail).toBe(0x1234);
  });

  it('should decode ground_pressure_pa at standard atmosphere', () => {
    const pkt = build_gs_status_packet({ ground_pressure_pa: 101325 });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'gs_status') return;
    expect(result.message.data.ground_pressure_pa).toBe(101325);
  });
});

// ---------------------------------------------------------------------------
// NACK parser test
// ---------------------------------------------------------------------------

describe('parse NACK', () => {
  it('should parse a valid NACK packet', () => {
    const pkt = new Uint8Array(10);
    pkt[0] = MSG_ID_NACK;
    write_u16(pkt, 1, 0x1234);
    pkt[3] = NackError.NotArmed;
    pkt[4] = 0x00; // reserved
    pkt[5] = 0x00; // reserved
    append_crc(pkt);

    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'nack') return;

    expect(result.message.data.nonce).toBe(0x1234);
    expect(result.message.data.error_code).toBe(NackError.NotArmed);
    expect(result.message.data.crc_ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CONFIRM parser test
// ---------------------------------------------------------------------------

describe('parse CONFIRM', () => {
  it('should parse a valid CONFIRM packet', () => {
    const pkt = new Uint8Array(9);
    pkt[0] = MSG_ID_CONFIRM;
    write_u16(pkt, 1, 0xABCD);
    pkt[3] = 0x00; // reserved
    pkt[4] = 0x00; // reserved
    append_crc(pkt);

    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'confirm') return;

    expect(result.message.data.nonce).toBe(0xABCD);
    expect(result.message.data.crc_ok).toBe(true);
  });
});
