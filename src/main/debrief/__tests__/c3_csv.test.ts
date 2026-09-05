/**
 * Tests for Casper-3 CSV export.
 *
 * The contract worth pinning is not "it produces commas" — it is that the
 * export stays analysable: raw LSBs survive alongside scaled units, the BMI
 * is rotated into the body frame, and time is rebased the same way the charts
 * rebase it so a CSV lines up with what was on screen.
 */
import { describe, it, expect } from 'vitest';
import { hr_to_csv, lr_to_csv, bmi_to_csv, HR_COLUMNS, LR_COLUMNS, BMI_COLUMNS } from '../c3_csv';
import { crc16_ccitt, parse_hr_record, parse_lr_record, parse_bmi_record } from '../c3_decode';
import { HR_REC_SIZE, LR_REC_SIZE, BMI_REC_SIZE, LSM6_ACCEL_SCALE } from '../c3_log_format';

function hr(t: number, accel: [number, number, number], adxl: [number, number, number] = [0, 0, 0]) {
  const r = new Uint8Array(HR_REC_SIZE);
  const dv = new DataView(r.buffer);
  dv.setUint32(0, t, true);
  dv.setUint16(4, 50650, true);
  for (let i = 0; i < 3; i++) dv.setInt16(6 + i * 2, accel[i], true);
  for (let i = 0; i < 3; i++) dv.setInt16(12 + i * 2, 0, true);
  for (let i = 0; i < 3; i++) dv.setInt16(18 + i * 2, adxl[i], true);
  dv.setFloat32(30, 123.5, true);
  dv.setFloat32(34, -4.25, true);
  r[43] = 1; // BOOST
  dv.setInt16(49, 2500, true);
  dv.setInt16(51, 2400, true);
  dv.setUint16(53, 42, true);
  dv.setUint16(62, crc16_ccitt(r.subarray(0, 62)), true);
  return parse_hr_record(r);
}

function lr(t: number) {
  const r = new Uint8Array(LR_REC_SIZE);
  const dv = new DataView(r.buffer);
  dv.setUint32(0, t, true);
  for (let i = 0; i < 4; i++) dv.setUint16(5 + i * 2, 3000 + i, true);
  dv.setInt8(13, -92);
  dv.setInt8(14, 7);
  dv.setInt32(21, 100, true);
  dv.setInt32(25, -200, true);
  dv.setInt16(29, 321, true);
  r[31] = (3 << 4) | 9;
  return parse_lr_record(r);
}

function bmi(t: number, accel: [number, number, number]) {
  const r = new Uint8Array(BMI_REC_SIZE);
  const dv = new DataView(r.buffer);
  dv.setUint32(0, t, true);
  for (let i = 0; i < 3; i++) dv.setInt16(4 + i * 2, accel[i], true);
  for (let i = 0; i < 3; i++) dv.setInt16(10 + i * 2, 0, true);
  dv.setInt16(16, 2600, true);
  dv.setUint16(18, 5, true);
  dv.setUint16(30, crc16_ccitt(r.subarray(0, 30)), true);
  return parse_bmi_record(r);
}

const parse = (csv: string) => {
  const lines = csv.trim().split('\r\n');
  return { header: lines[0].split(','), rows: lines.slice(1).map((l) => l.split(',')) };
};

describe('hr_to_csv', () => {
  it('emits the declared header and one row per record', () => {
    const out = parse(hr_to_csv([hr(1000, [0, 1024, 0]), hr(1010, [0, 2048, 0])], 1000));
    expect(out.header).toEqual([...HR_COLUMNS]);
    expect(out.rows).toHaveLength(2);
  });

  it('rebases t_s on the flight start while keeping the raw tick', () => {
    const out = parse(hr_to_csv([hr(600000, [0, 1024, 0]), hr(600500, [0, 1024, 0])], 600000));
    const t_s = out.header.indexOf('t_s');
    const ms = out.header.indexOf('timestamp_ms');
    expect(out.rows[0][t_s]).toBe('0');
    expect(out.rows[1][t_s]).toBe('0.5');
    // A 10-minute pad dwell must still be recoverable from the file.
    expect(out.rows[1][ms]).toBe('600500');
  });

  it('keeps raw LSBs next to the scaled values', () => {
    const out = parse(hr_to_csv([hr(0, [0, 1024, 0])], 0));
    const g = out.header.indexOf('lsm6_ay_g');
    const raw = out.header.indexOf('lsm6_ay_raw');
    expect(out.rows[0][raw]).toBe('1024');
    expect(Number(out.rows[0][g])).toBeCloseTo(1024 * LSM6_ACCEL_SCALE, 6);
  });

  it('writes the ADXL in the body frame, and its raw values in chip frame', () => {
    // body = [-n[1], n[0], n[2]]; ADXL is 100 mg/LSB.
    const out = parse(hr_to_csv([hr(0, [0, 0, 0], [10, 20, 30])], 0));
    const bx = out.header.indexOf('adxl_x_g');
    const by = out.header.indexOf('adxl_y_g');
    const rawx = out.header.indexOf('adxl_x_raw');
    expect(Number(out.rows[0][bx])).toBeCloseTo(-20 * 0.1, 6);
    expect(Number(out.rows[0][by])).toBeCloseTo(10 * 0.1, 6);
    expect(out.rows[0][rawx]).toBe('10');
  });

  it('names the FSM state as well as numbering it', () => {
    const out = parse(hr_to_csv([hr(0, [0, 0, 0])], 0));
    expect(out.rows[0][out.header.indexOf('fsm_name')]).toBe('BOOST');
    expect(out.rows[0][out.header.indexOf('fsm_state')]).toBe('1');
  });

  it('marks CRC status per row so damaged samples stay identifiable', () => {
    const out = parse(hr_to_csv([hr(0, [0, 0, 0])], 0));
    expect(out.rows[0][out.header.indexOf('crc_ok')]).toBe('1');
  });

  it('never emits a stray comma that would shift columns', () => {
    const out = parse(hr_to_csv([hr(0, [-1, 2, -3], [4, -5, 6])], 0));
    expect(out.rows[0]).toHaveLength(HR_COLUMNS.length);
  });

  it('produces a header-only file for no records', () => {
    const csv = hr_to_csv([], 0);
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });
});

describe('lr_to_csv', () => {
  it('splits the GPS fix and sat nibbles into their own columns', () => {
    const out = parse(lr_to_csv([lr(2000)], 1000));
    expect(out.header).toEqual([...LR_COLUMNS]);
    expect(out.rows[0][out.header.indexOf('gps_fix')]).toBe('3');
    expect(out.rows[0][out.header.indexOf('gps_sats')]).toBe('9');
    expect(out.rows[0][out.header.indexOf('radio_rssi_dbm')]).toBe('-92');
    expect(out.rows[0][out.header.indexOf('t_s')]).toBe('1');
  });

  it('emits all four continuity channels', () => {
    const out = parse(lr_to_csv([lr(0)], 0));
    expect(out.rows[0][out.header.indexOf('cont_adc_1')]).toBe('3000');
    expect(out.rows[0][out.header.indexOf('cont_adc_4')]).toBe('3003');
  });
});

describe('bmi_to_csv', () => {
  it('scales into the body frame while raw stays chip frame', () => {
    const out = parse(bmi_to_csv([bmi(0, [0, 1365, 0])], 0));
    expect(out.header).toEqual([...BMI_COLUMNS]);
    // chip [0,1365,0] -> body [-1365, 0, 0] -> -1 g on X
    expect(Number(out.rows[0][out.header.indexOf('bmi_ax_g')])).toBeCloseTo(-1, 3);
    expect(Number(out.rows[0][out.header.indexOf('bmi_ay_g')])).toBeCloseTo(0, 6);
    expect(out.rows[0][out.header.indexOf('bmi_ay_raw')]).toBe('1365');
  });

  it('carries the accel die temperature in degrees', () => {
    const out = parse(bmi_to_csv([bmi(0, [0, 0, 0])], 0));
    expect(out.rows[0][out.header.indexOf('temp_c')]).toBe('26');
  });
});
