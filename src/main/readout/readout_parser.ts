/**
 * Binary readout parser for C.A.S.P.E.R.-2 flight log data.
 *
 * Decodes high-rate, low-rate, and summary flight log entries from the
 * binary format stored on the flight computer's QSPI flash.  This is
 * the TypeScript port of the Python reference implementation in
 * `tools/decode_flight_log.py`.
 *
 * All multi-byte fields are little-endian as produced by the STM32H750.
 *
 * @module readout/readout_parser
 */

import { crc32_compute } from '../protocol/crc32';
import {
  HR_ENTRY_SIZE, LR_ENTRY_SIZE,
  HR_LR_HEADER_SIZE, SUMMARY_HEADER_SIZE, METADATA_SIZE, CRC_SIZE,
  MAGIC_CASP, MAGIC_SUMM, MAGIC_META,
  FSM_STATE_NAMES,
  type HrEntry, type LrEntry, type SummaryEntry, type Metadata
} from './readout_types';

// ---------------------------------------------------------------------------
// Little-endian read helpers
// ---------------------------------------------------------------------------

function read_u8(buf: Uint8Array, offset: number): number {
  return buf[offset];
}

function read_i8(buf: Uint8Array, offset: number): number {
  const v = buf[offset];
  return v > 127 ? v - 256 : v;
}

function read_u16_le(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function read_i16_le(buf: Uint8Array, offset: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return view.getInt16(offset, true);
}

function read_u32_le(buf: Uint8Array, offset: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return view.getUint32(offset, true);
}

function read_i32_le(buf: Uint8Array, offset: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return view.getInt32(offset, true);
}

// ---------------------------------------------------------------------------
// Magic validation helper
// ---------------------------------------------------------------------------

function check_magic(buf: Uint8Array, expected: Uint8Array): boolean {
  for (let i = 0; i < expected.length; i++) {
    if (buf[i] !== expected[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Quaternion unpacking
// ---------------------------------------------------------------------------

/**
 * Unpack quaternion from the simplified "smallest three" packing.
 *
 * w is always the dropped component (forced positive).
 * packed[0..2] are Q14-scaled x, y, z.
 */
function unpack_quaternion(packed: [number, number, number]): { w: number; x: number; y: number; z: number } {
  const x = packed[0] / 16384.0;
  const y = packed[1] / 16384.0;
  const z = packed[2] / 16384.0;
  const w_sq = 1.0 - x * x - y * y - z * z;
  const w = Math.sqrt(Math.max(0.0, w_sq));
  return { w, x, y, z };
}

// ---------------------------------------------------------------------------
// Header parsers
// ---------------------------------------------------------------------------

/**
 * Parse a 16-byte HR/LR stream header.
 *
 * Layout: [CASP:4][stream_id:1][entry_size:1][rsvd:2][count:4][CRC:4]
 *
 * @throws On bad magic or CRC mismatch.
 */
export function parse_hr_lr_header(header: Uint8Array): { stream_id: number; entry_size: number; count: number } {
  if (header.length < HR_LR_HEADER_SIZE) {
    throw new Error(`HR/LR header too short: expected ${HR_LR_HEADER_SIZE} bytes, got ${header.length}`);
  }

  if (!check_magic(header, MAGIC_CASP)) {
    throw new Error(`Bad magic: expected CASP, got [${header[0]}, ${header[1]}, ${header[2]}, ${header[3]}]`);
  }

  const stream_id = header[4];
  const entry_size = header[5];
  const count = read_u32_le(header, 8);
  const hdr_crc_rx = read_u32_le(header, 12);

  const hdr_crc_calc = crc32_compute(header.subarray(0, 12));
  if ((hdr_crc_rx >>> 0) !== (hdr_crc_calc >>> 0)) {
    throw new Error(
      `Header CRC mismatch: received 0x${(hdr_crc_rx >>> 0).toString(16).padStart(8, '0').toUpperCase()}, ` +
      `computed 0x${(hdr_crc_calc >>> 0).toString(16).padStart(8, '0').toUpperCase()}`
    );
  }

  return { stream_id, entry_size, count };
}

/**
 * Parse a 12-byte summary stream header.
 *
 * Layout: [SUMM:4][payload_size:4][CRC:4]
 *
 * @throws On bad magic or CRC mismatch.
 */
export function parse_summary_header(header: Uint8Array): { payload_size: number } {
  if (header.length < SUMMARY_HEADER_SIZE) {
    throw new Error(`Summary header too short: expected ${SUMMARY_HEADER_SIZE} bytes, got ${header.length}`);
  }

  if (!check_magic(header, MAGIC_SUMM)) {
    throw new Error(`Bad magic: expected SUMM, got [${header[0]}, ${header[1]}, ${header[2]}, ${header[3]}]`);
  }

  const payload_size = read_u32_le(header, 4);
  const hdr_crc_rx = read_u32_le(header, 8);

  const hdr_crc_calc = crc32_compute(header.subarray(0, 8));
  if ((hdr_crc_rx >>> 0) !== (hdr_crc_calc >>> 0)) {
    throw new Error(
      `Summary header CRC mismatch: received 0x${(hdr_crc_rx >>> 0).toString(16).padStart(8, '0').toUpperCase()}, ` +
      `computed 0x${(hdr_crc_calc >>> 0).toString(16).padStart(8, '0').toUpperCase()}`
    );
  }

  return { payload_size };
}

/**
 * Parse a 28-byte metadata response.
 *
 * Layout: [META:4][hr_count:4][lr_count:4][sum_bytes:4][hr_addr:4][lr_addr:4][CRC:4]
 *
 * @throws On bad magic or CRC mismatch.
 */
export function parse_metadata(data: Uint8Array): Metadata {
  if (data.length < METADATA_SIZE) {
    throw new Error(`Metadata too short: expected ${METADATA_SIZE} bytes, got ${data.length}`);
  }

  if (!check_magic(data, MAGIC_META)) {
    throw new Error(`Bad magic: expected META, got [${data[0]}, ${data[1]}, ${data[2]}, ${data[3]}]`);
  }

  const hr_count = read_u32_le(data, 4);
  const lr_count = read_u32_le(data, 8);
  const summary_bytes = read_u32_le(data, 12);
  const hr_addr = read_u32_le(data, 16);
  const lr_addr = read_u32_le(data, 20);
  const crc_rx = read_u32_le(data, 24);

  const crc_calc = crc32_compute(data.subarray(0, 24));
  if ((crc_rx >>> 0) !== (crc_calc >>> 0)) {
    throw new Error(
      `Metadata CRC mismatch: received 0x${(crc_rx >>> 0).toString(16).padStart(8, '0').toUpperCase()}, ` +
      `computed 0x${(crc_calc >>> 0).toString(16).padStart(8, '0').toUpperCase()}`
    );
  }

  return { hr_count, lr_count, summary_bytes, hr_addr, lr_addr };
}

// ---------------------------------------------------------------------------
// Entry decoders
// ---------------------------------------------------------------------------

/**
 * Decode a 64-byte high-rate entry into a structured HrEntry.
 *
 * Struct layout (little-endian, packed):
 *   <IBBhhhhhhhhhhIhiihhhhhhB11s> = 64 bytes
 *
 * See `tools/decode_flight_log.py` decode_hr_entry() for the Python reference.
 */
export function decode_hr_entry(raw: Uint8Array): HrEntry {
  if (raw.length !== HR_ENTRY_SIZE) {
    throw new Error(`HR entry must be ${HR_ENTRY_SIZE} bytes, got ${raw.length}`);
  }

  // Raw field extraction
  const timestamp_us     = read_u32_le(raw, 0);
  const fresh            = read_u8(raw, 4);
  const fsm_state        = read_u8(raw, 5);
  const accel_x_mg       = read_i16_le(raw, 6);
  const accel_y_mg       = read_i16_le(raw, 8);
  const accel_z_mg       = read_i16_le(raw, 10);
  const gyro_x_raw       = read_i16_le(raw, 12);
  const gyro_y_raw       = read_i16_le(raw, 14);
  const gyro_z_raw       = read_i16_le(raw, 16);
  const imu_temp_c100    = read_i16_le(raw, 18);
  const highg_x_10mg     = read_i16_le(raw, 20);
  const highg_y_10mg     = read_i16_le(raw, 22);
  const highg_z_10mg     = read_i16_le(raw, 24);
  const baro_pa          = read_u32_le(raw, 26);
  const baro_temp_c100   = read_i16_le(raw, 30);
  const ekf_alt_cm       = read_i32_le(raw, 32);
  const ekf_vel_cmps     = read_i32_le(raw, 36);
  const ekf_abias_mmps2  = read_i16_le(raw, 40);
  const ekf_bbias_cm     = read_i16_le(raw, 42);
  const quat_packed_0    = read_i16_le(raw, 44);
  const quat_packed_1    = read_i16_le(raw, 46);
  const quat_packed_2    = read_i16_le(raw, 48);
  const tilt_cdeg        = read_i16_le(raw, 50);
  const flags            = read_u8(raw, 52);
  // bytes 53..63 = reserved (ignored)

  // Quaternion unpacking
  const quat = unpack_quaternion([quat_packed_0, quat_packed_1, quat_packed_2]);

  // FSM state name
  const fsm_name = FSM_STATE_NAMES[fsm_state] ?? `UNKNOWN(${fsm_state})`;

  return {
    timestamp_us,
    timestamp_s:        timestamp_us / 1e6,
    fresh,
    fresh_imu:          !!(fresh & 0x01),
    fresh_highg:        !!(fresh & 0x02),
    fresh_baro:         !!(fresh & 0x04),
    fsm_state,
    fsm_name,
    accel_x_mg,
    accel_y_mg,
    accel_z_mg,
    accel_x_g:          accel_x_mg / 1000.0,
    accel_y_g:          accel_y_mg / 1000.0,
    accel_z_g:          accel_z_mg / 1000.0,
    gyro_x_raw,
    gyro_y_raw,
    gyro_z_raw,
    gyro_x_dps:         gyro_x_raw * 0.070,
    gyro_y_dps:         gyro_y_raw * 0.070,
    gyro_z_dps:         gyro_z_raw * 0.070,
    imu_temp_c:         imu_temp_c100 / 100.0,
    highg_x_10mg,
    highg_y_10mg,
    highg_z_10mg,
    highg_x_g:          highg_x_10mg / 100.0,
    highg_y_g:          highg_y_10mg / 100.0,
    highg_z_g:          highg_z_10mg / 100.0,
    baro_pa,
    baro_hpa:           baro_pa / 100.0,
    baro_temp_c:        baro_temp_c100 / 100.0,
    ekf_alt_cm,
    ekf_alt_m:          ekf_alt_cm / 100.0,
    ekf_vel_cmps,
    ekf_vel_mps:        ekf_vel_cmps / 100.0,
    ekf_abias_mmps2,
    ekf_abias_mps2:     ekf_abias_mmps2 / 1000.0,
    ekf_bbias_cm,
    ekf_bbias_m:        ekf_bbias_cm / 100.0,
    quat_w:             quat.w,
    quat_x:             quat.x,
    quat_y:             quat.y,
    quat_z:             quat.z,
    tilt_cdeg,
    tilt_deg:           tilt_cdeg / 100.0,
    flags,
    flag_baro_gated:    !!(flags & 0x01),
    flag_launched:      !!(flags & 0x02),
    flag_mag_valid:     !!(flags & 0x04),
  };
}

/**
 * Decode a 64-byte low-rate entry into a structured LrEntry.
 *
 * Struct layout (little-endian, packed):
 *   <IBBhhhhHhBBBBiihhBBBBBBBbbB20s> = 64 bytes
 *
 * See `tools/decode_flight_log.py` decode_lr_entry() for the Python reference.
 */
export function decode_lr_entry(raw: Uint8Array): LrEntry {
  if (raw.length !== LR_ENTRY_SIZE) {
    throw new Error(`LR entry must be ${LR_ENTRY_SIZE} bytes, got ${raw.length}`);
  }

  // Raw field extraction
  const timestamp_us     = read_u32_le(raw, 0);
  const fsm_state        = read_u8(raw, 4);
  const flags            = read_u8(raw, 5);
  const mag_x_raw        = read_i16_le(raw, 6);
  const mag_y_raw        = read_i16_le(raw, 8);
  const mag_z_raw        = read_i16_le(raw, 10);
  const mag_temp_c100    = read_i16_le(raw, 12);
  const batt_mv          = read_u16_le(raw, 14);
  const batt_ma          = read_i16_le(raw, 16);
  const cont_scaled_0    = read_u8(raw, 18);
  const cont_scaled_1    = read_u8(raw, 19);
  const cont_scaled_2    = read_u8(raw, 20);
  const cont_scaled_3    = read_u8(raw, 21);
  const gps_lat_deg7     = read_i32_le(raw, 22);
  const gps_lon_deg7     = read_i32_le(raw, 26);
  const gps_alt_dm       = read_i16_le(raw, 30);
  const gps_vel_d_cmps   = read_i16_le(raw, 32);
  const gps_sats         = read_u8(raw, 34);
  const gps_fix          = read_u8(raw, 35);
  const gps_pdop         = read_u8(raw, 36);
  const gps_fresh        = read_u8(raw, 37);
  const radio_tx_seq     = read_u8(raw, 38);
  const radio_rx_good    = read_u8(raw, 39);
  const radio_rx_bad     = read_u8(raw, 40);
  const radio_rssi       = read_i8(raw, 41);
  const radio_snr        = read_i8(raw, 42);
  const pyro_arm_cont    = read_u8(raw, 43);
  // bytes 44..63 = reserved (ignored)

  // FSM state name
  const fsm_name = FSM_STATE_NAMES[fsm_state] ?? `UNKNOWN(${fsm_state})`;

  return {
    timestamp_us,
    timestamp_s:        timestamp_us / 1e6,
    fsm_state,
    fsm_name,
    flags,
    flag_firing:        !!(flags & 0x01),
    flag_test_mode:     !!(flags & 0x02),
    flag_sim_active:    !!(flags & 0x04),
    mag_x_raw,
    mag_y_raw,
    mag_z_raw,
    mag_temp_c:         mag_temp_c100 !== 0x7FFF ? mag_temp_c100 / 100.0 : null,
    batt_mv,
    batt_v:             batt_mv / 1000.0,
    batt_ma,
    cont_scaled:        [cont_scaled_0, cont_scaled_1, cont_scaled_2, cont_scaled_3],
    gps_lat_deg7,
    gps_lon_deg7,
    gps_lat_deg:        gps_lat_deg7 / 1e7,
    gps_lon_deg:        gps_lon_deg7 / 1e7,
    gps_alt_dm,
    gps_alt_m:          gps_alt_dm / 10.0,
    gps_vel_d_cmps,
    gps_vel_d_mps:      gps_vel_d_cmps / 100.0,
    gps_sats,
    gps_fix,
    gps_pdop,
    gps_fresh:          !!gps_fresh,
    radio_tx_seq,
    radio_rx_good,
    radio_rx_bad,
    radio_rssi,
    radio_snr,
    pyro_arm_bitmap:    (pyro_arm_cont >> 4) & 0x0F,
    pyro_cont_bitmap:   pyro_arm_cont & 0x0F,
  };
}

// ---------------------------------------------------------------------------
// Summary entries
// ---------------------------------------------------------------------------

/**
 * Decode variable-length summary entries from a payload buffer.
 *
 * Each entry: [timestamp_ms:4][len:1][msg:N]
 * Stops at end of buffer, short read, or 0xFFFFFFFF sentinel (erased flash).
 */
export function decode_summary_entries(data: Uint8Array): SummaryEntry[] {
  const entries: SummaryEntry[] = [];
  let offset = 0;
  while (offset < data.length) {
    if (offset + 5 > data.length) break;
    const ts_ms = read_u32_le(data, offset);
    const msg_len = data[offset + 4];
    if (ts_ms === 0xFFFFFFFF) break; // erased region sentinel
    if (offset + 5 + msg_len > data.length) break;
    const msg_bytes = data.slice(offset + 5, offset + 5 + msg_len);
    const msg = new TextDecoder('utf-8', { fatal: false }).decode(msg_bytes);
    entries.push({ timestamp_ms: ts_ms, timestamp_s: ts_ms / 1000.0, msg });
    offset += 5 + msg_len;
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Data CRC verification
// ---------------------------------------------------------------------------

/**
 * Verify CRC-32 of a data payload against an expected value.
 *
 * @throws If the computed CRC does not match expected_crc.
 */
export function verify_data_crc(data: Uint8Array, expected_crc: number): void {
  const computed = crc32_compute(data);
  if ((computed >>> 0) !== (expected_crc >>> 0)) {
    throw new Error(
      `Data CRC mismatch: received 0x${(expected_crc >>> 0).toString(16).padStart(8, '0').toUpperCase()}, ` +
      `computed 0x${(computed >>> 0).toString(16).padStart(8, '0').toUpperCase()}`
    );
  }
}
