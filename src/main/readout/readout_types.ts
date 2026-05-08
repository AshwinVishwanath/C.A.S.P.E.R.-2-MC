/**
 * Flight log readout protocol types and constants.
 * Ported from tools/decode_flight_log.py.
 * @module readout/readout_types
 */

// ---------------------------------------------------------------------------
// Readout command bytes
// ---------------------------------------------------------------------------
export const READOUT_CMD_HR = 0x01;
export const READOUT_CMD_LR = 0x02;
export const READOUT_CMD_SUMMARY = 0x03;
export const READOUT_CMD_METADATA = 0x04;
export const READOUT_CMD_ERASE = 0x05;

// ---------------------------------------------------------------------------
// Entry sizes (bytes)
// ---------------------------------------------------------------------------
export const HR_ENTRY_SIZE = 64;
export const LR_ENTRY_SIZE = 64;

// ---------------------------------------------------------------------------
// Stream header sizes
// ---------------------------------------------------------------------------
export const HR_LR_HEADER_SIZE = 16;
export const SUMMARY_HEADER_SIZE = 12;
export const METADATA_SIZE = 28;
export const CRC_SIZE = 4;

// ---------------------------------------------------------------------------
// Magic bytes
// ---------------------------------------------------------------------------
export const MAGIC_CASP = new Uint8Array([0x43, 0x41, 0x53, 0x50]); // "CASP"
export const MAGIC_SUMM = new Uint8Array([0x53, 0x55, 0x4D, 0x4D]); // "SUMM"
export const MAGIC_META = new Uint8Array([0x4D, 0x45, 0x54, 0x41]); // "META"

// ---------------------------------------------------------------------------
// FSM state names
// ---------------------------------------------------------------------------
export const FSM_STATE_NAMES: Record<number, string> = {
  0x0: 'PAD',
  0x1: 'BOOST',
  0x2: 'COAST',
  0x3: 'COAST_1',
  0x4: 'SUSTAIN',
  0x5: 'COAST_2',
  0x6: 'APOGEE',
  0x7: 'DROGUE',
  0x8: 'MAIN',
  0x9: 'RECOVERY',
  0xA: 'TUMBLE',
  0xB: 'LANDED'
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface HrEntry {
  timestamp_us: number;
  timestamp_s: number;
  fresh: number;
  fresh_imu: boolean;
  fresh_highg: boolean;
  fresh_baro: boolean;
  fsm_state: number;
  fsm_name: string;
  accel_x_mg: number;
  accel_y_mg: number;
  accel_z_mg: number;
  accel_x_g: number;
  accel_y_g: number;
  accel_z_g: number;
  gyro_x_raw: number;
  gyro_y_raw: number;
  gyro_z_raw: number;
  gyro_x_dps: number;
  gyro_y_dps: number;
  gyro_z_dps: number;
  imu_temp_c: number;
  highg_x_10mg: number;
  highg_y_10mg: number;
  highg_z_10mg: number;
  highg_x_g: number;
  highg_y_g: number;
  highg_z_g: number;
  baro_pa: number;
  baro_hpa: number;
  baro_temp_c: number;
  ekf_alt_cm: number;
  ekf_alt_m: number;
  ekf_vel_cmps: number;
  ekf_vel_mps: number;
  ekf_abias_mmps2: number;
  ekf_abias_mps2: number;
  ekf_bbias_cm: number;
  ekf_bbias_m: number;
  quat_w: number;
  quat_x: number;
  quat_y: number;
  quat_z: number;
  tilt_cdeg: number;
  tilt_deg: number;
  flags: number;
  flag_baro_gated: boolean;
  flag_launched: boolean;
  flag_mag_valid: boolean;
}

export interface LrEntry {
  timestamp_us: number;
  timestamp_s: number;
  fsm_state: number;
  fsm_name: string;
  flags: number;
  flag_firing: boolean;
  flag_test_mode: boolean;
  flag_sim_active: boolean;
  mag_x_raw: number;
  mag_y_raw: number;
  mag_z_raw: number;
  mag_temp_c: number | null;
  batt_mv: number;
  batt_v: number;
  batt_ma: number;
  cont_scaled: number[];
  gps_lat_deg7: number;
  gps_lon_deg7: number;
  gps_lat_deg: number;
  gps_lon_deg: number;
  gps_alt_dm: number;
  gps_alt_m: number;
  gps_vel_d_cmps: number;
  gps_vel_d_mps: number;
  gps_sats: number;
  gps_fix: number;
  gps_pdop: number;
  gps_fresh: boolean;
  radio_tx_seq: number;
  radio_rx_good: number;
  radio_rx_bad: number;
  radio_rssi: number;
  radio_snr: number;
  pyro_arm_bitmap: number;
  pyro_cont_bitmap: number;
}

export interface SummaryEntry {
  timestamp_ms: number;
  timestamp_s: number;
  msg: string;
}

export interface Metadata {
  hr_count: number;
  lr_count: number;
  summary_bytes: number;
  hr_addr: number;
  lr_addr: number;
}

export interface ReadoutProgress {
  phase: 'metadata' | 'hr' | 'lr' | 'summary' | 'erase' | 'done' | 'error';
  pct: number;
  detail: string;
  error?: string;
}

export interface ReadoutResult {
  metadata: Metadata | null;
  hr_entries: HrEntry[];
  lr_entries: LrEntry[];
  summary_entries: SummaryEntry[];
}

// ---- CSV column definitions (matching Python decoder) ----

export const HR_CSV_COLUMNS = [
  'timestamp_us', 'timestamp_s', 'fsm_name',
  'accel_x_g', 'accel_y_g', 'accel_z_g',
  'gyro_x_dps', 'gyro_y_dps', 'gyro_z_dps', 'imu_temp_c',
  'highg_x_g', 'highg_y_g', 'highg_z_g',
  'baro_hpa', 'baro_temp_c',
  'ekf_alt_m', 'ekf_vel_mps', 'ekf_abias_mps2', 'ekf_bbias_m',
  'quat_w', 'quat_x', 'quat_y', 'quat_z', 'tilt_deg',
  'flag_baro_gated', 'flag_launched',
  'fresh_imu', 'fresh_highg', 'fresh_baro'
] as const;

export const LR_CSV_COLUMNS = [
  'timestamp_us', 'timestamp_s', 'fsm_name',
  'mag_x_raw', 'mag_y_raw', 'mag_z_raw', 'mag_temp_c',
  'batt_v', 'batt_ma',
  'cont_scaled',
  'gps_lat_deg', 'gps_lon_deg', 'gps_alt_m', 'gps_vel_d_mps',
  'gps_sats', 'gps_fix', 'gps_fresh',
  'radio_tx_seq', 'radio_rssi', 'radio_snr',
  'pyro_arm_bitmap', 'pyro_cont_bitmap',
  'flag_firing', 'flag_test_mode', 'flag_sim_active'
] as const;

export const SUMMARY_CSV_COLUMNS = [
  'timestamp_ms', 'timestamp_s', 'msg'
] as const;
