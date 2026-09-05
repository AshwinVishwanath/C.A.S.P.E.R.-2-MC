/**
 * CSV serialisation for decoded Casper-3 flight records.
 *
 * Pure string-building, no Electron and no filesystem, so the column layouts
 * can be tested directly.
 *
 * Two rules the columns follow:
 *
 *  - FULL RESOLUTION. These are the decoded records, not the decimated chart
 *    series. A 400 Hz stream exports every sample; the charts' ~1400-point
 *    buckets exist for drawing, not for analysis.
 *  - RAW LSBs SURVIVE. Every scaled column is accompanied by the raw register
 *    value it came from. A scale factor that later turns out to be wrong (it
 *    has happened on this project) is recoverable from a CSV that kept the
 *    raw counts, and unrecoverable from one that did not.
 *
 * Both `t_s` (seconds from the flight's first record, matching the charts)
 * and the original `timestamp_ms` tick are emitted, so nothing about the
 * FC's own clock is lost in the rebasing.
 *
 * @module debrief/c3_csv
 */

import {
  LSM6_ACCEL_SCALE,
  LSM6_GYRO_SCALE,
  ADXL_SCALE,
  BMI_ACCEL_SCALE,
  BMI_GYRO_SCALE,
  BARO_SCALE,
  TEMP_SCALE,
  fsm_name,
  type HrRecord,
  type LrRecord,
  type BmiRecord,
} from './c3_log_format';
import { to_body } from './c3_series';

export type CsvStream = 'hr' | 'lr' | 'bmi';

/** Trim float noise without throwing away resolution people need. */
function n(v: number, digits = 6): string {
  if (!Number.isFinite(v)) return '';
  const s = v.toFixed(digits);
  // Drop trailing zeros so a column of integers does not read as 0.000000.
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

function rows_to_csv(columns: readonly string[], rows: string[][]): string {
  const out: string[] = [columns.join(',')];
  for (const r of rows) out.push(r.join(','));
  return out.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// HR
// ---------------------------------------------------------------------------

export const HR_COLUMNS = [
  't_s',
  'timestamp_ms',
  'seq_num',
  'fsm_state',
  'fsm_name',
  'ekf_alt_m',
  'ekf_vel_mps',
  'baro_hpa',
  'baro_raw',
  'lsm6_ax_g',
  'lsm6_ay_g',
  'lsm6_az_g',
  'lsm6_gx_dps',
  'lsm6_gy_dps',
  'lsm6_gz_dps',
  'adxl_x_g',
  'adxl_y_g',
  'adxl_z_g',
  'lsm6_ax_raw',
  'lsm6_ay_raw',
  'lsm6_az_raw',
  'lsm6_gx_raw',
  'lsm6_gy_raw',
  'lsm6_gz_raw',
  'adxl_x_raw',
  'adxl_y_raw',
  'adxl_z_raw',
  'imu_temp_c',
  'baro_temp_c',
  'ekf_accel_bias',
  'ekf_baro_bias',
  'sustain_ms',
  'flags',
  'crc_ok',
] as const;

/**
 * @param t0_ms Tick of the flight's first record; `t_s` is measured from it.
 *   ADXL columns are rotated into the LSM6 body frame, matching the charts.
 */
export function hr_to_csv(records: HrRecord[], t0_ms: number): string {
  const rows = records.map((r) => {
    const a = r.lsm6_accel;
    const g = r.lsm6_gyro;
    const adxl_body = to_body(r.adxl372);
    return [
      n((r.timestamp_ms - t0_ms) / 1000, 4),
      String(r.timestamp_ms),
      String(r.seq_num),
      String(r.fsm_state),
      fsm_name(r.fsm_state),
      n(r.ekf_alt_m, 3),
      n(r.ekf_vel_mps, 3),
      n(r.baro_pressure * BARO_SCALE, 3),
      String(r.baro_pressure),
      n(a[0] * LSM6_ACCEL_SCALE),
      n(a[1] * LSM6_ACCEL_SCALE),
      n(a[2] * LSM6_ACCEL_SCALE),
      n(g[0] * LSM6_GYRO_SCALE, 4),
      n(g[1] * LSM6_GYRO_SCALE, 4),
      n(g[2] * LSM6_GYRO_SCALE, 4),
      n(adxl_body[0] * ADXL_SCALE, 3),
      n(adxl_body[1] * ADXL_SCALE, 3),
      n(adxl_body[2] * ADXL_SCALE, 3),
      String(a[0]),
      String(a[1]),
      String(a[2]),
      String(g[0]),
      String(g[1]),
      String(g[2]),
      String(r.adxl372[0]),
      String(r.adxl372[1]),
      String(r.adxl372[2]),
      n(r.imu_temp * TEMP_SCALE, 2),
      n(r.baro_temp * TEMP_SCALE, 2),
      String(r.ekf_accel_bias),
      String(r.ekf_baro_bias),
      String(r.sustain_ms),
      String(r.flags),
      r.crc_ok ? '1' : '0',
    ];
  });
  return rows_to_csv(HR_COLUMNS, rows);
}

// ---------------------------------------------------------------------------
// LR
// ---------------------------------------------------------------------------

export const LR_COLUMNS = [
  't_s',
  'timestamp_ms',
  'pyro_state',
  'cont_adc_1',
  'cont_adc_2',
  'cont_adc_3',
  'cont_adc_4',
  'radio_rssi_dbm',
  'radio_snr_db',
  'radio_tx_count',
  'radio_rx_count',
  'radio_fail_count',
  'gps_dlat_mm',
  'gps_dlon_mm',
  'gps_alt_msl_m',
  'gps_fix',
  'gps_sats',
] as const;

export function lr_to_csv(records: LrRecord[], t0_ms: number): string {
  const rows = records.map((r) => [
    n((r.timestamp_ms - t0_ms) / 1000, 4),
    String(r.timestamp_ms),
    String(r.pyro_state),
    String(r.pyro_cont_adc[0]),
    String(r.pyro_cont_adc[1]),
    String(r.pyro_cont_adc[2]),
    String(r.pyro_cont_adc[3]),
    String(r.radio_rssi),
    String(r.radio_snr),
    String(r.radio_tx_count),
    String(r.radio_rx_count),
    String(r.radio_fail_count),
    String(r.gps_dlat_mm),
    String(r.gps_dlon_mm),
    String(r.gps_alt_msl_m),
    String(r.gps_fix),
    String(r.gps_sats),
  ]);
  return rows_to_csv(LR_COLUMNS, rows);
}

// ---------------------------------------------------------------------------
// BMI
// ---------------------------------------------------------------------------

export const BMI_COLUMNS = [
  't_s',
  'timestamp_ms',
  'seq_num',
  'bmi_ax_g',
  'bmi_ay_g',
  'bmi_az_g',
  'bmi_gx_dps',
  'bmi_gy_dps',
  'bmi_gz_dps',
  'bmi_ax_raw',
  'bmi_ay_raw',
  'bmi_az_raw',
  'bmi_gx_raw',
  'bmi_gy_raw',
  'bmi_gz_raw',
  'temp_c',
  'flags',
  'crc_ok',
] as const;

/** Scaled columns are in the LSM6 BODY frame; `_raw` columns stay in the
 *  BMI088's own chip frame, which is +90 deg about Z from it. Mixing those
 *  silently is the mistake this note exists to prevent. */
export function bmi_to_csv(records: BmiRecord[], t0_ms: number): string {
  const rows = records.map((r) => {
    const a = to_body(r.accel);
    const g = to_body(r.gyro);
    return [
      n((r.timestamp_ms - t0_ms) / 1000, 4),
      String(r.timestamp_ms),
      String(r.seq_num),
      n(a[0] * BMI_ACCEL_SCALE),
      n(a[1] * BMI_ACCEL_SCALE),
      n(a[2] * BMI_ACCEL_SCALE),
      n(g[0] * BMI_GYRO_SCALE, 4),
      n(g[1] * BMI_GYRO_SCALE, 4),
      n(g[2] * BMI_GYRO_SCALE, 4),
      String(r.accel[0]),
      String(r.accel[1]),
      String(r.accel[2]),
      String(r.gyro[0]),
      String(r.gyro[1]),
      String(r.gyro[2]),
      n(r.temp * TEMP_SCALE, 2),
      String(r.flags),
      r.crc_ok ? '1' : '0',
    ];
  });
  return rows_to_csv(BMI_COLUMNS, rows);
}

/** Row count a given stream would export — used to disable an empty choice. */
export function stream_count(
  stream: CsvStream,
  counts: { hr: number; lr: number; bmi: number },
): number {
  return counts[stream];
}
