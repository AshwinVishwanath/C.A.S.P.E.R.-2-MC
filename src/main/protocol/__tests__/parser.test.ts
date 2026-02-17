/**
 * Tests for the dual-mode message parser.
 *
 * Tests FC_MSG_FAST, FC_MSG_GPS, FC_MSG_EVENT with hand-crafted byte arrays.
 * Also tests edge cases: max-range values, zero, saturated GPS, unknown msg IDs.
 */

import { describe, it, expect } from 'vitest';
import { parse_packet } from '../parser';
import { crc32_compute } from '../crc32';
import {
  MSG_ID_FAST,
  MSG_ID_GPS,
  MSG_ID_EVENT,
  MSG_ID_GS_TELEM,
  MSG_ID_ACK_ARM,
  MSG_ID_NACK,
  MSG_ID_CONFIRM,
  SIZE_FC_MSG_FAST,
  SIZE_FC_MSG_GPS,
  SIZE_FC_MSG_EVENT
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
// FC_MSG_FAST tests
// ---------------------------------------------------------------------------

describe('parse FC_MSG_FAST', () => {
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
    const pkt = new Uint8Array(SIZE_FC_MSG_FAST);
    pkt[0] = MSG_ID_FAST;
    pkt[1] = opts.status_lsb ?? 0x00;
    pkt[2] = opts.status_msb ?? 0x00;
    write_u16(pkt, 3, opts.alt_raw ?? 0);
    write_i16(pkt, 5, opts.vel_raw ?? 0);
    // Quaternion bytes [7-11]
    const qb = opts.quat_bytes ?? new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00]);
    for (let i = 0; i < 5; i++) pkt[7 + i] = qb[i];
    write_u16(pkt, 12, opts.time_raw ?? 0);
    pkt[14] = opts.batt_raw ?? 0;
    pkt[15] = opts.seq ?? 0;
    if (!opts.bad_crc) {
      append_crc(pkt);
    }
    return pkt;
  }

  it('should parse a valid FC_MSG_FAST packet', () => {
    const pkt = build_fast_packet({
      alt_raw: 100,    // 100 * 1.0 = 100.0 m
      vel_raw: 500,    // 500 * 0.1 = 50.0 m/s
      time_raw: 300,   // 300 * 0.1 = 30.0 s
      batt_raw: 100    // 6.0 + 100 * 0.012 = 7.2 V
    });

    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('fc_fast');
    if (result.message.type !== 'fc_fast') return;

    const data = result.message.data;
    expect(data.msg_id).toBe(MSG_ID_FAST);
    expect(data.alt_m).toBeCloseTo(100.0, 1);
    expect(data.vel_mps).toBeCloseTo(50.0, 1);
    expect(data.flight_time_s).toBeCloseTo(30.0, 1);
    expect(data.batt_v).toBeCloseTo(7.2, 2);
    expect(data.crc_ok).toBe(true);
    expect(data.corrected).toBe(false);
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
    // Manually set wrong CRC
    write_u32(pkt, pkt.length - 4, 0xDEADBEEF);
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_fast') return;
    expect(result.message.data.crc_ok).toBe(false);
  });

  it('should handle max-range altitude (0xFFFF)', () => {
    const pkt = build_fast_packet({ alt_raw: 0xFFFF });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_fast') return;
    expect(result.message.data.alt_m).toBeCloseTo(65535 * 1.0, 0);
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

  it('should parse seq byte from offset 15', () => {
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
// FC_MSG_GPS tests
// ---------------------------------------------------------------------------

describe('parse FC_MSG_GPS', () => {
  function build_gps_packet(opts: {
    dlat_mm?: number;
    dlon_mm?: number;
    alt_raw?: number;
    fix_type?: number;
    sat_count?: number;
  } = {}): Uint8Array {
    const pkt = new Uint8Array(SIZE_FC_MSG_GPS);
    pkt[0] = MSG_ID_GPS;
    write_i32(pkt, 1, opts.dlat_mm ?? 0);
    write_i32(pkt, 5, opts.dlon_mm ?? 0);
    write_u16(pkt, 9, opts.alt_raw ?? 0);
    pkt[11] = opts.fix_type ?? 3;
    pkt[12] = opts.sat_count ?? 10;
    append_crc(pkt);
    return pkt;
  }

  it('should parse valid GPS packet', () => {
    const pkt = build_gps_packet({
      dlat_mm: 50000,    // 50.0 m north
      dlon_mm: -30000,   // -30.0 m (west)
      alt_raw: 150,      // 150 * 10.0 = 1500.0 m
      fix_type: 3,
      sat_count: 12
    });

    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_gps') return;

    const data = result.message.data;
    expect(data.dlat_m).toBeCloseTo(50.0, 1);
    expect(data.dlon_m).toBeCloseTo(-30.0, 1);
    expect(data.alt_msl_m).toBeCloseTo(1500.0, 0);
    expect(data.fix_type).toBe(3);
    expect(data.sat_count).toBe(12);
    expect(data.range_saturated).toBe(false);
    expect(data.crc_ok).toBe(true);
  });

  it('should detect saturated GPS range (i32 max)', () => {
    const pkt = build_gps_packet({ dlat_mm: 0x7FFFFFFF });
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok || result.message.type !== 'fc_gps') return;
    expect(result.message.data.range_saturated).toBe(true);
  });

  it('should detect saturated GPS range (i32 min)', () => {
    // -2147483648 = 0x80000000 as signed
    const pkt = new Uint8Array(SIZE_FC_MSG_GPS);
    pkt[0] = MSG_ID_GPS;
    // Write i32 min = 0x80000000 for dlat
    pkt[1] = 0x00; pkt[2] = 0x00; pkt[3] = 0x00; pkt[4] = 0x80;
    write_i32(pkt, 5, 0);
    write_u16(pkt, 9, 0);
    pkt[11] = 3;
    pkt[12] = 5;
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

  it('should return gs_status stub for MSG_ID_GS_STATUS', () => {
    const pkt = new Uint8Array([0x13, 0x01, 0x02]);
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.type).toBe('gs_status');
  });

  it('should return gs_corrupt stub for MSG_ID_GS_CORRUPT', () => {
    const pkt = new Uint8Array([0x14, 0x01, 0x02]);
    const result = parse_packet(pkt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.type).toBe('gs_corrupt');
  });

  it('should handle command echo IDs as unknown', () => {
    // 0x80 and 0x81 are command IDs, not normally received from FC
    // but parser should handle them gracefully
    const arm_echo = new Uint8Array(12);
    arm_echo[0] = 0x80;
    const result = parse_packet(arm_echo);
    // Should parse as ack_arm (since 0x80 is not MSG_ID_ACK_ARM=0xA0)
    // 0x80 is MSG_ID_CMD_ARM which maps to unknown
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.type).toBe('unknown');
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
