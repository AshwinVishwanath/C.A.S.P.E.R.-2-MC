/**
 * Tests for the Casper-3 flash decoder.
 *
 * These build synthetic flash images rather than fixture files: the point is
 * to pin the byte offsets and the page-walking rules against log_types.h, and
 * a fixture would let an offset error travel from the encoder into the
 * expectation unchallenged. Every record here is laid out by hand from the
 * struct comments.
 */
import { describe, it, expect } from 'vitest';
import {
  crc16_ccitt,
  crc32,
  parse_hr_record,
  parse_lr_record,
  parse_bmi_record,
  parse_index_entry,
  read_prologue,
  read_index,
  extract_records,
  blank_flash,
  decode_flight,
} from '../c3_decode';
import {
  PAGE_SIZE,
  HR_REC_SIZE,
  LR_REC_SIZE,
  BMI_REC_SIZE,
  HR_RECS_PER_PAGE,
  LR_RECS_PER_PAGE,
  PROLOGUE_SLOT_A,
  PROLOGUE_SLOT_B,
  PROLOGUE_MAGIC,
  FLASH_HR_BASE,
  FLASH_HR_END,
  FLASH_LR_BASE,
  FLASH_LR_END,
  FLASH_BMI_BASE,
  FLASH_INDEX_BASE,
  LOG_REC_TYPE_BMI,
  type IndexEntry,
} from '../c3_log_format';
import { decimate, to_body, build_series } from '../c3_series';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function make_hr(opts: Partial<{
  t: number;
  alt: number;
  vel: number;
  accel: [number, number, number];
  gyro: [number, number, number];
  fsm: number;
  seq: number;
  break_crc: boolean;
}> = {}): Uint8Array {
  const r = new Uint8Array(HR_REC_SIZE);
  const dv = new DataView(r.buffer);
  dv.setUint32(0, opts.t ?? 1000, true);
  dv.setUint16(4, 1013 * 50, true); // ~1013 hPa at 2 Pa/LSB
  const a = opts.accel ?? [0, 1024, 0];
  for (let i = 0; i < 3; i++) dv.setInt16(6 + i * 2, a[i], true);
  const g = opts.gyro ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) dv.setInt16(12 + i * 2, g[i], true);
  for (let i = 0; i < 3; i++) dv.setInt16(18 + i * 2, 0, true);
  for (let i = 0; i < 3; i++) dv.setUint16(24 + i * 2, 0, true);
  dv.setFloat32(30, opts.alt ?? 0, true);
  dv.setFloat32(34, opts.vel ?? 0, true);
  r[43] = opts.fsm ?? 0;
  dv.setInt16(49, 2500, true); // imu temp 25.00 C
  dv.setInt16(51, 2400, true); // baro temp 24.00 C
  dv.setUint16(53, opts.seq ?? 1, true);
  dv.setUint16(62, opts.break_crc ? 0x0000 : crc16_ccitt(r.subarray(0, 62)), true);
  if (opts.break_crc) dv.setUint16(62, (crc16_ccitt(r.subarray(0, 62)) ^ 0xffff) & 0xffff, true);
  return r;
}

function make_lr(t: number, sats = 7, rssi = -80): Uint8Array {
  const r = new Uint8Array(LR_REC_SIZE);
  const dv = new DataView(r.buffer);
  dv.setUint32(0, t, true);
  r[4] = 0;
  for (let i = 0; i < 4; i++) dv.setUint16(5 + i * 2, 2000 + i, true);
  dv.setInt8(13, rssi);
  dv.setInt8(14, 9);
  dv.setUint16(15, 10, true);
  dv.setUint16(17, 11, true);
  dv.setUint16(19, 0, true);
  dv.setInt32(21, 1234, true);
  dv.setInt32(25, -5678, true);
  dv.setInt16(29, 150, true);
  r[31] = (3 << 4) | (sats & 0x0f);
  return r;
}

function make_bmi(t: number, accel: [number, number, number] = [0, 1365, 0]): Uint8Array {
  const r = new Uint8Array(BMI_REC_SIZE);
  const dv = new DataView(r.buffer);
  dv.setUint32(0, t, true);
  for (let i = 0; i < 3; i++) dv.setInt16(4 + i * 2, accel[i], true);
  for (let i = 0; i < 3; i++) dv.setInt16(10 + i * 2, 0, true);
  dv.setInt16(16, 2600, true);
  dv.setUint16(18, 1, true);
  dv.setUint16(30, crc16_ccitt(r.subarray(0, 30)), true);
  return r;
}

function make_prologue(launch_tick: number, quat_scale = 2896.309): Uint8Array {
  const p = new Uint8Array(256);
  const dv = new DataView(p.buffer);
  dv.setUint32(0, PROLOGUE_MAGIC, true);
  p[4] = 1;
  p[5] = 0;
  // stream[2] declares the BMI088 record type
  p[8 + 2 * 8] = 2;
  p[8 + 2 * 8 + 1] = LOG_REC_TYPE_BMI;
  dv.setFloat32(32, quat_scale, true);
  dv.setFloat32(36, 0.01, true);
  dv.setFloat32(40, 0.1, true);
  dv.setFloat32(44, 0.1, true);
  dv.setFloat32(48, 6.0, true);
  dv.setFloat32(52, 0.012, true);
  dv.setUint32(64, launch_tick, true);
  dv.setUint16(68, 7, true);
  for (let i = 0; i < 8; i++) p[76 + i] = 'abcdef01'.charCodeAt(i);
  for (let i = 0; i < 8; i++) p[96 + i] = '5698118a'.charCodeAt(i);
  dv.setUint32(252, crc32(p.subarray(0, 252)), true);
  return p;
}

function write_index_entry(flash: Uint8Array, slot: number, e: IndexEntry): void {
  const off = FLASH_INDEX_BASE + slot * 32;
  const dv = new DataView(flash.buffer, flash.byteOffset + off, 32);
  dv.setUint16(0, e.flight_id, true);
  dv.setUint32(2, e.start_tick_ms, true);
  dv.setUint32(6, e.end_tick_ms, true);
  dv.setUint32(10, e.hr_start_addr, true);
  dv.setUint32(14, e.hr_end_addr, true);
  dv.setUint32(18, e.lr_start_addr, true);
  dv.setUint32(22, e.lr_end_addr, true);
  dv.setUint32(26, e.bmi_start_addr, true);
  dv.setUint16(30, e.flags, true);
}

// ---------------------------------------------------------------------------

describe('checksums', () => {
  it('CRC16-CCITT matches the known "123456789" vector', () => {
    const data = new Uint8Array([...'123456789'].map((c) => c.charCodeAt(0)));
    expect(crc16_ccitt(data)).toBe(0x29b1);
  });

  it('CRC32 matches the known "123456789" vector', () => {
    const data = new Uint8Array([...'123456789'].map((c) => c.charCodeAt(0)));
    expect(crc32(data)).toBe(0xcbf43926);
  });
});

describe('record parsers', () => {
  it('decodes every hr_record_t field at its documented offset', () => {
    const r = parse_hr_record(
      make_hr({ t: 123456, alt: 1234.5, vel: -67.25, accel: [1, -2, 3], fsm: 6, seq: 9 }),
    );
    expect(r.timestamp_ms).toBe(123456);
    expect(r.ekf_alt_m).toBeCloseTo(1234.5, 3);
    expect(r.ekf_vel_mps).toBeCloseTo(-67.25, 3);
    expect(r.lsm6_accel).toEqual([1, -2, 3]);
    expect(r.fsm_state).toBe(6);
    expect(r.seq_num).toBe(9);
    expect(r.imu_temp).toBe(2500);
    expect(r.crc_ok).toBe(true);
  });

  it('flags a corrupt HR record rather than dropping it', () => {
    expect(parse_hr_record(make_hr({ break_crc: true })).crc_ok).toBe(false);
  });

  it('splits gps_fix_sats into the fix nibble and the sat count', () => {
    const r = parse_lr_record(make_lr(500, 11));
    expect(r.gps_fix).toBe(3);
    expect(r.gps_sats).toBe(11);
    expect(r.radio_rssi).toBe(-80);
    expect(r.gps_dlon_mm).toBe(-5678);
  });

  it('decodes bmi_record_t and verifies its CRC', () => {
    const r = parse_bmi_record(make_bmi(777));
    expect(r.timestamp_ms).toBe(777);
    expect(r.accel).toEqual([0, 1365, 0]);
    expect(r.crc_ok).toBe(true);
  });

  it('decodes a 32-byte index entry', () => {
    const flash = blank_flash(4096);
    write_index_entry(flash, 0, {
      flight_id: 3,
      start_tick_ms: 100,
      end_tick_ms: 200,
      hr_start_addr: 0x1000,
      hr_end_addr: 0x2000,
      lr_start_addr: 0x3000,
      lr_end_addr: 0x4000,
      bmi_start_addr: 0x5000,
      flags: 0,
    });
    const e = parse_index_entry(flash.subarray(0, 32));
    expect(e.flight_id).toBe(3);
    expect(e.hr_end_addr).toBe(0x2000);
    expect(e.bmi_start_addr).toBe(0x5000);
  });
});

describe('extract_records', () => {
  it('reads every record in a full page', () => {
    const flash = blank_flash(PAGE_SIZE * 4);
    for (let i = 0; i < HR_RECS_PER_PAGE; i++) {
      flash.set(make_hr({ t: 1000 + i, seq: i + 1 }), i * HR_REC_SIZE);
    }
    const out = extract_records(
      flash, 0, PAGE_SIZE, HR_REC_SIZE, HR_RECS_PER_PAGE, parse_hr_record, PAGE_SIZE, 'HR',
    );
    expect(out.records).toHaveLength(4);
    expect(out.records.map((r) => r.timestamp_ms)).toEqual([1000, 1001, 1002, 1003]);
    expect(out.warnings).toHaveLength(0);
  });

  it('skips the 0xFFFF seq_num padding sentinel in a partial HR page', () => {
    const flash = blank_flash(PAGE_SIZE * 2);
    flash.set(make_hr({ t: 10, seq: 1 }), 0);
    flash.set(make_hr({ t: 11, seq: 0xffff }), HR_REC_SIZE); // padded slot
    const out = extract_records(
      flash, 0, PAGE_SIZE, HR_REC_SIZE, HR_RECS_PER_PAGE, parse_hr_record, PAGE_SIZE, 'HR',
    );
    expect(out.records).toHaveLength(1);
    expect(out.records[0].timestamp_ms).toBe(10);
  });

  it('reports all-zero pages as dump corruption and skips them', () => {
    const flash = blank_flash(PAGE_SIZE * 3);
    flash.set(make_hr({ t: 1 }), 0);
    flash.fill(0x00, PAGE_SIZE, PAGE_SIZE * 2); // corrupt page
    flash.set(make_hr({ t: 3 }), PAGE_SIZE * 2);

    const out = extract_records(
      flash, 0, PAGE_SIZE * 3, HR_REC_SIZE, HR_RECS_PER_PAGE, parse_hr_record, PAGE_SIZE * 3, 'HR',
    );
    // Two real records, and NOT the four fabricated ones an all-zero page
    // would otherwise yield.
    expect(out.records).toHaveLength(2);
    const zero = out.warnings.find((w) => w.kind === 'zero-pages');
    expect(zero?.count).toBe(1);
    expect(zero?.detail).toMatch(/re-dump/i);
  });

  it('reports erased pages inside the written span, but not the trailing ones', () => {
    const flash = blank_flash(PAGE_SIZE * 4);
    flash.set(make_hr({ t: 1 }), 0);
    // page 1 left erased -> interior
    flash.set(make_hr({ t: 3 }), PAGE_SIZE * 2);
    // page 3 left erased -> trailing, must NOT be reported

    const out = extract_records(
      flash, 0, PAGE_SIZE * 4, HR_REC_SIZE, HR_RECS_PER_PAGE, parse_hr_record, PAGE_SIZE * 4, 'HR',
    );
    expect(out.warnings.find((w) => w.kind === 'interior-blank')?.count).toBe(1);
  });

  it('detects a wrapped pool and decodes only the surviving tail', () => {
    const flash = blank_flash(PAGE_SIZE * 4);
    flash.set(make_lr(50), PAGE_SIZE * 2);
    // end < start is how the index records a pool that wrapped to its base.
    const out = extract_records(
      flash, PAGE_SIZE * 2, PAGE_SIZE, LR_REC_SIZE, LR_RECS_PER_PAGE, parse_lr_record,
      PAGE_SIZE * 4, 'LR',
    );
    const w = out.warnings.find((x) => x.kind === 'pool-wrapped');
    expect(w).toBeDefined();
    expect(w?.detail).toMatch(/NOT recoverable/i);
    expect(out.records.length).toBeGreaterThan(0);
  });

  it('counts CRC failures without discarding the records', () => {
    const flash = blank_flash(PAGE_SIZE);
    flash.set(make_hr({ t: 1 }), 0);
    flash.set(make_hr({ t: 2, break_crc: true }), HR_REC_SIZE);
    const out = extract_records(
      flash, 0, PAGE_SIZE, HR_REC_SIZE, HR_RECS_PER_PAGE, parse_hr_record, PAGE_SIZE, 'HR',
    );
    expect(out.records).toHaveLength(2);
    expect(out.warnings.find((w) => w.kind === 'crc-failures')?.count).toBe(1);
  });
});

describe('read_prologue', () => {
  it('returns null when neither slot is valid', () => {
    expect(read_prologue(blank_flash())).toBeNull();
  });

  it('rejects a slot whose CRC32 does not match', () => {
    const flash = blank_flash();
    const p = make_prologue(500);
    p[100] ^= 0xff; // corrupt after the magic, before the CRC field
    flash.set(p, PROLOGUE_SLOT_A);
    expect(read_prologue(flash)).toBeNull();
  });

  it('prefers the slot with the greater launch_tick', () => {
    const flash = blank_flash();
    flash.set(make_prologue(100), PROLOGUE_SLOT_A);
    flash.set(make_prologue(900), PROLOGUE_SLOT_B);
    const p = read_prologue(flash);
    expect(p?.slot).toBe('B');
    expect(p?.launch_tick).toBe(900);
    expect(p?.build_sig).toBe('5698118a');
  });

  it('reads the quantisation scales the decode depends on', () => {
    const flash = blank_flash();
    flash.set(make_prologue(1, 1234.5), PROLOGUE_SLOT_A);
    expect(read_prologue(flash)?.quat_scale).toBeCloseTo(1234.5, 2);
  });
});

describe('read_index', () => {
  it('returns written entries and skips erased slots', () => {
    const flash = blank_flash();
    write_index_entry(flash, 0, {
      flight_id: 1, start_tick_ms: 0, end_tick_ms: 10,
      hr_start_addr: FLASH_HR_BASE, hr_end_addr: FLASH_HR_BASE + PAGE_SIZE,
      lr_start_addr: FLASH_LR_BASE, lr_end_addr: FLASH_LR_BASE + PAGE_SIZE,
      bmi_start_addr: FLASH_BMI_BASE, flags: 0,
    });
    write_index_entry(flash, 5, {
      flight_id: 2, start_tick_ms: 20, end_tick_ms: 30,
      hr_start_addr: FLASH_HR_BASE, hr_end_addr: FLASH_HR_BASE,
      lr_start_addr: FLASH_LR_BASE, lr_end_addr: FLASH_LR_BASE,
      bmi_start_addr: FLASH_BMI_BASE, flags: 0,
    });
    const idx = read_index(flash);
    expect(idx.map((e) => e.flight_id)).toEqual([1, 2]);
  });
});

describe('decode_flight', () => {
  it('decodes HR, LR and BMI for one flight and falls back to default scales', () => {
    const flash = blank_flash();
    for (let i = 0; i < HR_RECS_PER_PAGE; i++) {
      flash.set(make_hr({ t: 1000 + i * 10, alt: i * 100, seq: i + 1 }), FLASH_HR_BASE + i * HR_REC_SIZE);
    }
    for (let i = 0; i < 3; i++) flash.set(make_lr(1000 + i * 100), FLASH_LR_BASE + i * LR_REC_SIZE);
    for (let i = 0; i < 3; i++) flash.set(make_bmi(1000 + i * 5), FLASH_BMI_BASE + i * BMI_REC_SIZE);

    const entry: IndexEntry = {
      flight_id: 1, start_tick_ms: 1000, end_tick_ms: 2000,
      hr_start_addr: FLASH_HR_BASE, hr_end_addr: FLASH_HR_BASE + PAGE_SIZE,
      lr_start_addr: FLASH_LR_BASE, lr_end_addr: FLASH_LR_BASE + PAGE_SIZE,
      bmi_start_addr: FLASH_BMI_BASE, flags: 0,
    };

    const d = decode_flight(flash, entry, null, null);
    expect(d.hr).toHaveLength(4);
    expect(d.lr).toHaveLength(3);
    expect(d.bmi).toHaveLength(3);
    expect(d.scales.quat_scale).toBeCloseTo(2896.309, 3);
    expect(d.slot2_is_legacy_adxl).toBe(false);
  });

  it('skips the BMI stream when the prologue says slot 2 is legacy ADXL', () => {
    const flash = blank_flash();
    const p = make_prologue(10);
    p[8 + 2 * 8 + 1] = 2; // LOG_REC_TYPE_ADXL
    const dv = new DataView(p.buffer);
    dv.setUint32(252, crc32(p.subarray(0, 252)), true);
    flash.set(p, PROLOGUE_SLOT_A);

    flash.set(make_hr({ t: 1 }), FLASH_HR_BASE);
    const prologue = read_prologue(flash);
    const entry: IndexEntry = {
      flight_id: 1, start_tick_ms: 0, end_tick_ms: 1,
      hr_start_addr: FLASH_HR_BASE, hr_end_addr: FLASH_HR_BASE + PAGE_SIZE,
      lr_start_addr: FLASH_LR_BASE, lr_end_addr: FLASH_LR_BASE,
      bmi_start_addr: FLASH_BMI_BASE, flags: 0,
    };
    const d = decode_flight(flash, entry, null, prologue);
    expect(d.slot2_is_legacy_adxl).toBe(true);
    expect(d.bmi).toHaveLength(0);
  });
});

describe('c3_series', () => {
  it('rotates a chip-frame triple into the LSM6 body frame with no Z flip', () => {
    // CASPER3_FACTS.md: body = [-n[1], n[0], n[2]]
    expect(to_body([1, 2, 3])).toEqual([-2, 1, 3]);
  });

  it('decimation keeps true extremes rather than averaging a spike away', () => {
    const t: number[] = [];
    const v: number[] = [];
    for (let i = 0; i < 10000; i++) {
      t.push(i / 400);
      v.push(i === 5000 ? 12 : 1); // one-sample 12 g spike
    }
    const s = decimate(t, v, 'a', 'A', 'g', 200);
    expect(s.t.length).toBeLessThanOrEqual(200);
    expect(Math.max(...s.hi)).toBe(12);
    // The mean line must NOT claim 12 g — that is what the band is for.
    expect(Math.max(...s.v)).toBeLessThan(12);
  });

  it('re-bases time on the first record and finds apogee', () => {
    const hr = [
      parse_hr_record(make_hr({ t: 600000, alt: 0, vel: 0, fsm: 0 })),
      parse_hr_record(make_hr({ t: 601000, alt: 500, vel: 90, fsm: 1 })),
      parse_hr_record(make_hr({ t: 602000, alt: 900, vel: 0, fsm: 6 })),
      parse_hr_record(make_hr({ t: 603000, alt: 400, vel: -20, fsm: 7 })),
    ];
    const out = build_series({
      index: {
        flight_id: 4, start_tick_ms: 600000, end_tick_ms: 603000,
        hr_start_addr: 0, hr_end_addr: 0, lr_start_addr: 0, lr_end_addr: 0,
        bmi_start_addr: 0, flags: 0,
      },
      prologue: null,
      scales: { quat_scale: 1, alt_scale_m: 0.01, vel_scale_dms: 0.1,
        time_scale_100ms: 0.1, batt_offset_v: 6, batt_step_v: 0.012 },
      hr, lr: [], bmi: [], slot2_is_legacy_adxl: false, warnings: [],
    });

    // A 10-minute pad dwell must not put launch at t = 600 s.
    expect(out.stats.apogee_m).toBeCloseTo(900, 3);
    expect(out.stats.apogee_t_s).toBeCloseTo(2, 3);
    expect(out.stats.max_vel_mps).toBeCloseTo(90, 3);
    expect(out.states.map((s) => s.name)).toEqual(['PAD', 'BOOST', 'APOGEE', 'DROGUE']);
    expect(out.stats.burnout_t_s).toBeCloseTo(2, 3);
  });

  it('drops panels that have no records instead of rendering empty axes', () => {
    const out = build_series({
      index: {
        flight_id: 1, start_tick_ms: 0, end_tick_ms: 1,
        hr_start_addr: 0, hr_end_addr: 0, lr_start_addr: 0, lr_end_addr: 0,
        bmi_start_addr: 0, flags: 0,
      },
      prologue: null,
      scales: { quat_scale: 1, alt_scale_m: 0.01, vel_scale_dms: 0.1,
        time_scale_100ms: 0.1, batt_offset_v: 6, batt_step_v: 0.012 },
      hr: [parse_hr_record(make_hr({ t: 0 }))],
      lr: [], bmi: [], slot2_is_legacy_adxl: true, warnings: [],
    });
    // No LR records -> no radio / GPS / pyro panels.
    const keys = out.groups.map((g) => g.key);
    expect(keys).not.toContain('radio');
    expect(keys).not.toContain('gps_sats');
    expect(keys).toContain('altitude');
  });
});

describe('build_series windowing (chart drag-zoom)', () => {
  /** A cheap HR record; bypasses byte encoding so the test stays about the
   *  series logic and can afford thousands of samples. */
  const synth = (t_ms: number, alt: number, fsm = 1) => ({
    timestamp_ms: t_ms,
    baro_pressure: 50000,
    lsm6_accel: [0, 1024, 0] as [number, number, number],
    lsm6_gyro: [0, 0, 0] as [number, number, number],
    adxl372: [0, 0, 0] as [number, number, number],
    mmc: [0, 0, 0] as [number, number, number],
    ekf_alt_m: alt,
    ekf_vel_mps: 0,
    quat_packed: new Uint8Array(5),
    fsm_state: fsm,
    flags: 0,
    ekf_accel_bias: 0,
    ekf_baro_bias: 0,
    imu_temp: 2500,
    baro_temp: 2400,
    seq_num: 1,
    sustain_ms: 0,
    crc16: 0,
    crc_ok: true,
  });

  /** 6000 samples at 400 Hz = 15 s, apogee at t = 10 s. */
  const flight = () => {
    const hr = [];
    for (let i = 0; i < 6000; i++) {
      const t_s = i / 400;
      hr.push(synth(1000 + i * 2.5, t_s <= 10 ? t_s * 100 : (15 - t_s) * 100));
    }
    return {
      index: {
        flight_id: 1, start_tick_ms: 1000, end_tick_ms: 16000,
        hr_start_addr: 0, hr_end_addr: 0, lr_start_addr: 0, lr_end_addr: 0,
        bmi_start_addr: 0, flags: 0,
      },
      prologue: null,
      scales: { quat_scale: 1, alt_scale_m: 0.01, vel_scale_dms: 0.1,
        time_scale_100ms: 0.1, batt_offset_v: 6, batt_step_v: 0.012 },
      hr, lr: [], bmi: [], slot2_is_legacy_adxl: false, warnings: [],
    } as never;
  };

  it('echoes the window back so a stale response is identifiable', () => {
    expect(build_series(flight(), null).window).toBeNull();
    expect(build_series(flight(), { t0: 2, t1: 4 }).window).toEqual({ t0: 2, t1: 4 });
  });

  it('confines the series to the window', () => {
    const out = build_series(flight(), { t0: 5, t1: 6 });
    const alt = out.groups.find((g) => g.key === 'altitude').series[0];
    expect(alt.t[0]).toBeGreaterThanOrEqual(5);
    expect(alt.t[alt.t.length - 1]).toBeLessThanOrEqual(6);
  });

  it('gains resolution inside the window rather than stretching the same points', () => {
    const full = build_series(flight(), null);
    const full_alt = full.groups.find((g) => g.key === 'altitude').series[0];
    const in_window = full_alt.t.filter((t) => t >= 5 && t <= 6).length;

    const zoomed = build_series(flight(), { t0: 5, t1: 6 });
    const zoom_alt = zoomed.groups.find((g) => g.key === 'altitude').series[0];

    // 1 s of a 15 s flight is ~1/15th of the full series' points; windowing
    // before decimating must do substantially better than that.
    expect(zoom_alt.t.length).toBeGreaterThan(in_window * 2);
  });

  it('keeps statistics whole-flight even when the charts are zoomed', () => {
    const full = build_series(flight(), null);
    // Window excludes apogee entirely.
    const zoomed = build_series(flight(), { t0: 0, t1: 1 });
    expect(zoomed.stats.apogee_m).toBeCloseTo(full.stats.apogee_m, 6);
    expect(zoomed.stats.apogee_t_s).toBeCloseTo(full.stats.apogee_t_s, 6);
    expect(zoomed.stats.hr_count).toBe(full.stats.hr_count);
  });

  it('keeps the full state timeline so the bands stay correct when zoomed', () => {
    const full = build_series(flight(), null);
    const zoomed = build_series(flight(), { t0: 5, t1: 6 });
    expect(zoomed.states).toEqual(full.states);
  });

  it('yields an empty series for a window containing no records', () => {
    const out = build_series(flight(), { t0: 100, t1: 101 });
    // Empty panels are dropped rather than drawn as empty axes.
    expect(out.groups.find((g) => g.key === 'altitude')).toBeUndefined();
    expect(out.stats.apogee_m).not.toBeNull();
  });
});

describe('flash map', () => {
  it('pins the pool bounds the decoder relies on', () => {
    // Guards against a firmware re-carve landing here unnoticed: these are
    // _Static_assert-pinned in log_types.h.
    expect(FLASH_LR_END).toBe(FLASH_BMI_BASE);
    expect(FLASH_HR_END - FLASH_HR_BASE).toBe(0x1000000); // 16 MiB
    expect(PROLOGUE_SLOT_B - PROLOGUE_SLOT_A).toBe(0x1000);
  });
});
