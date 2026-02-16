/**
 * Flight configuration binary serialiser.
 *
 * Serialises a FlightConfig object into the binary format expected by the FC
 * for configuration upload, and computes configuration hashes for verification.
 *
 * Binary format (PRD Section 18):
 *   [config_version:u8] [total_length:u16 LE] [payload...] [CRC-32:u32 LE]
 *
 * @module protocol/config_serialiser
 */

import { FlightConfig, PyroChannelConfig, PyroRole } from './types';
import { crc32_compute } from './crc32';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Current configuration format version. */
const CONFIG_VERSION = 0x01;

/** Number of pyro channels. */
const NUM_PYRO_CHANNELS = 4;

/** PyroRole to u8 mapping. */
const PYRO_ROLE_MAP: Record<PyroRole, number> = {
  'Apogee': 0x00,
  'Apogee Backup': 0x01,
  'Main': 0x02,
  'Main Backup': 0x03,
  'Ignition': 0x04,
  'Ignition Backup': 0x05,
  'Custom': 0x06
};

/** Altitude source to u8 mapping. */
const ALT_SOURCE_MAP: Record<string, number> = {
  'ekf': 0x00,
  'baro': 0x01
};

/** Backup mode to u8 mapping. */
const BACKUP_MODE_MAP: Record<string, number> = {
  'time': 0x00,
  'height': 0x01
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write unsigned 16-bit little-endian at offset. Returns new offset. */
function write_u16_le(buf: Uint8Array, offset: number, value: number): number {
  buf[offset] = value & 0xFF;
  buf[offset + 1] = (value >> 8) & 0xFF;
  return offset + 2;
}

/** Write unsigned 32-bit little-endian at offset. Returns new offset. */
function write_u32_le(buf: Uint8Array, offset: number, value: number): number {
  buf[offset] = value & 0xFF;
  buf[offset + 1] = (value >> 8) & 0xFF;
  buf[offset + 2] = (value >> 16) & 0xFF;
  buf[offset + 3] = (value >> 24) & 0xFF;
  return offset + 4;
}

/** Write float32 as IEEE 754 little-endian at offset. Returns new offset. */
function write_f32_le(buf: Uint8Array, offset: number, value: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setFloat32(offset, value, true); // true = little-endian
  return offset + 4;
}

/** Write signed 16-bit little-endian at offset. Returns new offset. */
function write_i16_le(buf: Uint8Array, offset: number, value: number): number {
  const clamped = Math.max(-32768, Math.min(32767, Math.round(value)));
  buf[offset] = clamped & 0xFF;
  buf[offset + 1] = (clamped >> 8) & 0xFF;
  return offset + 2;
}

// ---------------------------------------------------------------------------
// Pyro channel serialisation
// ---------------------------------------------------------------------------

/** Size of a single serialised pyro channel config in bytes. */
const PYRO_CHANNEL_SIZE = 32;

/**
 * Serialise a single PyroChannelConfig into the buffer at the given offset.
 *
 * Layout (32 bytes per channel):
 *   [0]    hw_channel (u8)
 *   [1]    role (u8)
 *   [2]    altitude_source (u8)
 *   [3]    flags: early_deploy_enabled(bit0), backup_mode_height(bit1)
 *   [4-7]  fire_duration_s (f32, LE)
 *   [8-11] deploy_alt_m (f32, LE)
 *   [12-15] time_after_apogee_s (f32, LE)
 *   [16-19] early_deploy_vel_mps (f32, LE)
 *   [20-23] backup_time_s or backup_height_m (f32, LE)
 *   [24]   motor_number (u8)
 *   [25]   max_ignition_angle_deg (u8, scaled *1)
 *   [26]   max_flight_angle_deg (u8, scaled *1)
 *   [27-28] min_velocity_mps (i16, LE, scaled *10)
 *   [29-30] min_altitude_m (i16, LE, scaled *1)
 *   [31]   fire_delay_s (u8, scaled *10)
 */
function serialise_pyro_channel(
  buf: Uint8Array,
  offset: number,
  config: PyroChannelConfig
): number {
  buf[offset] = config.hw_channel & 0xFF;
  buf[offset + 1] = PYRO_ROLE_MAP[config.role] ?? 0x06;
  buf[offset + 2] = ALT_SOURCE_MAP[config.altitude_source] ?? 0x00;

  // Flags byte
  let flags = 0;
  if (config.early_deploy_enabled) flags |= 0x01;
  if (config.backup_mode === 'height') flags |= 0x02;
  buf[offset + 3] = flags;

  let pos = offset + 4;
  pos = write_f32_le(buf, pos, config.fire_duration_s);
  pos = write_f32_le(buf, pos, config.deploy_alt_m ?? 0);
  pos = write_f32_le(buf, pos, config.time_after_apogee_s ?? 0);
  pos = write_f32_le(buf, pos, config.early_deploy_vel_mps ?? 0);

  // Backup value: time or height depending on mode
  const backup_val = config.backup_mode === 'height'
    ? (config.backup_height_m ?? 0)
    : (config.backup_time_s ?? 0);
  pos = write_f32_le(buf, pos, backup_val);

  buf[pos] = (config.motor_number ?? 0) & 0xFF;
  pos++;
  buf[pos] = Math.min(255, Math.max(0, Math.round(config.max_ignition_angle_deg ?? 0)));
  pos++;
  buf[pos] = Math.min(255, Math.max(0, Math.round(config.max_flight_angle_deg ?? 0)));
  pos++;

  pos = write_i16_le(buf, pos, (config.min_velocity_mps ?? 0) * 10);
  pos = write_i16_le(buf, pos, config.min_altitude_m ?? 0);

  buf[pos] = Math.min(255, Math.max(0, Math.round((config.fire_delay_s ?? 0) * 10)));
  pos++;

  return pos;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serialise a FlightConfig to binary format for FC upload.
 *
 * Format:
 *   [config_version:u8] [total_length:u16 LE] [payload...] [CRC-32:u32 LE]
 *
 * Payload layout:
 *   [pyro_channel_0: 32 bytes] ... [pyro_channel_3: 32 bytes]
 *   [pad_lat_deg: f32 LE] [pad_lon_deg: f32 LE] [pad_alt_msl_m: f32 LE]
 *   [alt_threshold_m: f32 LE] [vel_threshold_mps: f32 LE]
 *   [min_batt_v: f32 LE] [min_integrity_pct: f32 LE]
 *
 * @param config - Flight configuration to serialise.
 * @returns Binary packet ready for transmission.
 */
export function serialise_config(config: FlightConfig): Uint8Array {
  // Payload size: 4 channels * 32 + 7 floats * 4 = 128 + 28 = 156 bytes
  const payload_size = NUM_PYRO_CHANNELS * PYRO_CHANNEL_SIZE + 7 * 4;
  // Total: header(3) + payload + CRC(4)
  const total_size = 3 + payload_size + 4;

  const buf = new Uint8Array(total_size);

  // Header
  buf[0] = CONFIG_VERSION;
  write_u16_le(buf, 1, total_size);

  // Pyro channels
  let pos = 3;
  for (let i = 0; i < NUM_PYRO_CHANNELS; i++) {
    pos = serialise_pyro_channel(buf, pos, config.pyro_channels[i]);
  }

  // Pad location
  pos = write_f32_le(buf, pos, config.pad_lat_deg);
  pos = write_f32_le(buf, pos, config.pad_lon_deg);
  pos = write_f32_le(buf, pos, config.pad_alt_msl_m);

  // State-machine fallback
  pos = write_f32_le(buf, pos, config.sf_fallback.alt_threshold_m);
  pos = write_f32_le(buf, pos, config.sf_fallback.vel_threshold_mps);

  // Pre-flight checks
  pos = write_f32_le(buf, pos, config.checks.min_batt_v);
  pos = write_f32_le(buf, pos, config.checks.min_integrity_pct);

  // CRC-32 over everything except the last 4 bytes
  const crc = crc32_compute(buf.subarray(0, total_size - 4));
  write_u32_le(buf, total_size - 4, crc);

  return buf;
}

/**
 * Compute CRC-32 hash of a config for verification.
 *
 * Serialises the config and returns the CRC-32 of the payload
 * (excluding the CRC field itself).
 *
 * @param config - Flight configuration to hash.
 * @returns CRC-32 hash value.
 */
export function config_hash(config: FlightConfig): number {
  const serialised = serialise_config(config);
  // CRC is computed over everything except the trailing 4 CRC bytes
  return crc32_compute(serialised.subarray(0, serialised.length - 4));
}
