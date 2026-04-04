/**
 * Dual-mode message parser for C.A.S.P.E.R. 2 protocol.
 *
 * Dispatches on the message ID byte (first byte of payload after COBS decode)
 * and returns a typed ParseResult. Handles both direct FC packets (0x01-0x03)
 * and GS-wrapped packets (0x10-0x14).
 *
 * All multi-byte fields are little-endian as per the protocol specification.
 * This module never throws — all errors are returned as typed results.
 *
 * @module protocol/parser
 */

import {
  ParseResult,
  FcMsgFast,
  FcMsgGps,
  FcMsgEvent,
  GsMsgTelem,
  AckArm,
  AckFire,
  AckConfig,
  Nack,
  NackError,
  HandshakeResponse
} from './types';
import {
  MSG_ID_FAST,
  MSG_ID_GPS,
  MSG_ID_EVENT,
  MSG_ID_GS_TELEM,
  MSG_ID_GS_GPS,
  MSG_ID_GS_EVENT,
  MSG_ID_GS_STATUS,
  MSG_ID_GS_CORRUPT,
  MSG_ID_ACK_ARM,
  MSG_ID_ACK_FIRE,
  MSG_ID_ACK_CONFIG,
  MSG_ID_NACK,
  MSG_ID_CONFIRM,
  MSG_ID_HANDSHAKE,
  SIZE_FC_MSG_FAST,
  SIZE_FC_MSG_GPS,
  SIZE_FC_MSG_EVENT,
  SIZE_GS_MSG_TELEM,
  SIZE_ACK_ARM,
  SIZE_ACK_FIRE,
  SIZE_ACK_CONFIG,
  SIZE_NACK,
  SIZE_CONFIRM,
  ALT_SCALE,
  VEL_SCALE,
  TIME_SCALE,
  BATT_SCALE,
  BATT_OFFSET,
  GPS_ALT_SCALE,
  STALE_THRESHOLD_MS
} from './constants';
import { crc32_compute } from './crc32';
import { unpack_quaternion } from './quaternion';
import { decode_status } from './status_decode';
import { compute_mach, compute_qbar, quat_to_euler_deg } from './derived';

// ---------------------------------------------------------------------------
// Helper: read little-endian values from Uint8Array
// ---------------------------------------------------------------------------

/** Read unsigned 16-bit little-endian at offset. */
function read_u16_le(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

/** Read signed 16-bit little-endian at offset. */
function read_i16_le(data: Uint8Array, offset: number): number {
  const val = data[offset] | (data[offset + 1] << 8);
  return val >= 0x8000 ? val - 0x10000 : val;
}

/** Read unsigned 32-bit little-endian at offset. */
function read_u32_le(data: Uint8Array, offset: number): number {
  return (
    (data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)) >>> 0
  );
}

/** Read signed 32-bit little-endian at offset. */
function read_i32_le(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    (data[offset + 3] << 24)
  );
}

/** Read signed 8-bit value. */
function read_i8(data: Uint8Array, offset: number): number {
  const val = data[offset];
  return val >= 0x80 ? val - 0x100 : val;
}

// ---------------------------------------------------------------------------
// CRC verification helper
// ---------------------------------------------------------------------------

/**
 * Verify the CRC-32 at the end of a packet.
 * The CRC covers all bytes from the start up to (but not including) the last 4 bytes.
 * The last 4 bytes are the CRC itself (little-endian).
 */
function verify_packet_crc(payload: Uint8Array): boolean {
  if (payload.length < 5) {
    return false;
  }
  const crc_offset = payload.length - 4;
  const data_portion = payload.subarray(0, crc_offset);
  const expected_crc = read_u32_le(payload, crc_offset);
  const computed_crc = crc32_compute(data_portion);
  return (computed_crc >>> 0) === (expected_crc >>> 0);
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a raw packet payload (after COBS decode, message ID is first byte).
 *
 * Handles both direct FC packets (0x01-0x03) and GS-wrapped packets (0x10-0x14),
 * as well as command acknowledgement/response messages.
 *
 * @param payload - Raw bytes. First byte is the message ID.
 * @param compute_derived - If true, compute Mach/qbar/Euler for FC direct mode.
 *                          Defaults to false.
 * @returns Typed parse result (ok + message, or error description).
 */
export function parse_packet(
  payload: Uint8Array,
  compute_derived: boolean = false
): ParseResult {
  if (!payload || payload.length === 0) {
    return { ok: false, error: 'Empty payload' };
  }

  const msg_id = payload[0];

  switch (msg_id) {
    case MSG_ID_FAST:
      return parse_fc_fast(payload, compute_derived);

    case MSG_ID_GPS:
      return parse_fc_gps(payload);

    case MSG_ID_EVENT:
      return parse_fc_event(payload);

    case MSG_ID_GS_TELEM:
      return parse_gs_telem(payload);

    case MSG_ID_GS_GPS:
      return {
        ok: true,
        message: { type: 'gs_gps', data: { msg_id, raw: payload } }
      };

    case MSG_ID_GS_EVENT:
      return {
        ok: true,
        message: { type: 'gs_event', data: { msg_id, raw: payload } }
      };

    case MSG_ID_GS_STATUS:
      return {
        ok: true,
        message: { type: 'gs_status', data: { msg_id, raw: payload } }
      };

    case MSG_ID_GS_CORRUPT:
      return {
        ok: true,
        message: { type: 'gs_corrupt', data: { msg_id, raw: payload } }
      };

    case MSG_ID_ACK_ARM:
      return parse_ack_arm(payload);

    case MSG_ID_ACK_FIRE:
      return parse_ack_fire(payload);

    case MSG_ID_ACK_CONFIG:
      return parse_ack_config(payload);

    case MSG_ID_NACK:
      return parse_nack(payload);

    case MSG_ID_CONFIRM:
      return parse_confirm(payload);

    case MSG_ID_HANDSHAKE:
      return parse_handshake(payload);

    default:
      // Unknown message ID — return typed unknown, never crash
      return {
        ok: true,
        message: { type: 'unknown', msg_id, raw: payload }
      };
  }
}

// ---------------------------------------------------------------------------
// FC_MSG_FAST parser (msg_id 0x01, 20 bytes)
// ---------------------------------------------------------------------------

/**
 * Parse FC_MSG_FAST packet.
 *
 * Layout (20 bytes total):
 *   [0]    msg_id (0x01)
 *   [1-2]  FC_TLM_STATUS (u16, little-endian)
 *   [3-4]  FC_TLM_ALT (u16, LE) — altitude = raw * 1.0 (metres)
 *   [5-6]  FC_TLM_VEL (i16, LE) — velocity = raw * 0.1 (m/s)
 *   [7-11] FC_ATT_QPACKED (5 bytes) — smallest-three quaternion
 *   [12-13] FC_FSM_TIME (u16, LE) — flight_time = raw * 0.1
 *   [14]   FC_PWR_BATT (u8) — batt_v = 6.0 + raw * 0.012
 *   [15]   SEQ (u8) — rolling sequence number
 *   [16-19] CRC-32 (u32, LE)
 */
function parse_fc_fast(payload: Uint8Array, compute_derived_vals: boolean): ParseResult {
  if (payload.length < SIZE_FC_MSG_FAST) {
    return {
      ok: false,
      error: `FC_MSG_FAST too short: ${payload.length} < ${SIZE_FC_MSG_FAST}`,
      msg_id: MSG_ID_FAST
    };
  }

  const crc_ok = verify_packet_crc(payload);
  const status = decode_status(payload.subarray(1, 3));
  const alt_raw = read_u16_le(payload, 3);
  const vel_raw = read_i16_le(payload, 5);
  const quat_bytes = payload.subarray(7, 12);
  const time_raw = read_u16_le(payload, 12);
  const batt_raw = payload[14];
  const seq = payload[15];

  const alt_m = alt_raw * ALT_SCALE;
  const vel_mps = vel_raw * VEL_SCALE;
  const quat = unpack_quaternion(quat_bytes);
  const flight_time_s = time_raw * TIME_SCALE;
  const batt_v = BATT_OFFSET + batt_raw * BATT_SCALE;

  const data: FcMsgFast = {
    msg_id: MSG_ID_FAST,
    status,
    alt_m,
    vel_mps,
    quat,
    flight_time_s,
    batt_v,
    seq,
    crc_ok,
    corrected: false
  };

  return { ok: true, message: { type: 'fc_fast', data } };
}

// ---------------------------------------------------------------------------
// FC_MSG_GPS parser (msg_id 0x02, 17 bytes)
// ---------------------------------------------------------------------------

/**
 * Parse FC_MSG_GPS packet.
 *
 * Layout (17 bytes total):
 *   [0]    msg_id (0x02)
 *   [1-4]  dlat (i32, LE) — delta latitude in mm
 *   [5-8]  dlon (i32, LE) — delta longitude in mm
 *   [9-10] alt_msl (u16, LE) — altitude MSL = raw * 10.0
 *   [11]   fix_type (u8)
 *   [12]   sat_count (u8)
 *   [13-16] CRC-32 (u32, LE)
 *
 * Note: pdop and range_saturated are derived from the fix/sat fields.
 */
function parse_fc_gps(payload: Uint8Array): ParseResult {
  if (payload.length < SIZE_FC_MSG_GPS) {
    return {
      ok: false,
      error: `FC_MSG_GPS too short: ${payload.length} < ${SIZE_FC_MSG_GPS}`,
      msg_id: MSG_ID_GPS
    };
  }

  const crc_ok = verify_packet_crc(payload);

  const dlat_mm = read_i32_le(payload, 1);
  const dlon_mm = read_i32_le(payload, 5);
  const alt_raw = read_u16_le(payload, 9);
  const fix_type = payload[11];
  const sat_count = payload[12];

  // Check for range saturation: i32 max/min values indicate saturation
  const I32_MAX = 0x7FFFFFFF;
  const I32_MIN = -0x80000000;
  const range_saturated =
    dlat_mm === I32_MAX || dlat_mm === I32_MIN ||
    dlon_mm === I32_MAX || dlon_mm === I32_MIN;

  const data: FcMsgGps = {
    msg_id: MSG_ID_GPS,
    dlat_m: dlat_mm / 1000.0,
    dlon_m: dlon_mm / 1000.0,
    alt_msl_m: alt_raw * GPS_ALT_SCALE,
    fix_type,
    sat_count,
    pdop: 0, // Not present in direct FC GPS packet
    range_saturated,
    crc_ok
  };

  return { ok: true, message: { type: 'fc_gps', data } };
}

// ---------------------------------------------------------------------------
// FC_MSG_EVENT parser (msg_id 0x03, 11 bytes)
// ---------------------------------------------------------------------------

/**
 * Parse FC_MSG_EVENT packet.
 *
 * Layout (11 bytes total):
 *   [0]    msg_id (0x03)
 *   [1]    event_type (u8)
 *   [2-3]  event_data (u16, LE)
 *   [4-5]  flight_time (u16, LE) — flight_time_s = raw * 0.1
 *   [6]    reserved
 *   [7-10] CRC-32 (u32, LE)
 */
function parse_fc_event(payload: Uint8Array): ParseResult {
  if (payload.length < SIZE_FC_MSG_EVENT) {
    return {
      ok: false,
      error: `FC_MSG_EVENT too short: ${payload.length} < ${SIZE_FC_MSG_EVENT}`,
      msg_id: MSG_ID_EVENT
    };
  }

  const crc_ok = verify_packet_crc(payload);

  const data: FcMsgEvent = {
    msg_id: MSG_ID_EVENT,
    event_type: payload[1],
    event_data: read_u16_le(payload, 2),
    flight_time_s: read_u16_le(payload, 4) * TIME_SCALE,
    crc_ok
  };

  return { ok: true, message: { type: 'fc_event', data } };
}

// ---------------------------------------------------------------------------
// GS_MSG_TELEM parser (msg_id 0x10, 38 bytes)
// ---------------------------------------------------------------------------

/**
 * Parse GS_MSG_TELEM packet.
 *
 * Layout (38 bytes total):
 *   [0]     msg_id (0x10)
 *   [1-2]   FC_TLM_STATUS (u16, LE)
 *   [3-4]   FC_TLM_ALT (u16, LE)
 *   [5-6]   FC_TLM_VEL (i16, LE)
 *   [7-11]  FC_ATT_QPACKED (5 bytes)
 *   [12-13] FC_FSM_TIME (u16, LE)
 *   [14]    FC_PWR_BATT (u8)
 *   [15]    seq (u8)
 *   [16-17] rssi_raw (i16, LE) — rssi_dbm = raw * 0.1
 *   [18]    snr_raw (i8) — snr_db = raw * 0.25
 *   [19-20] freq_err_raw (i16, LE) — freq_err_hz = raw
 *   [21-22] data_age_ms (u16, LE)
 *   [23]    recovery byte: recovered(bit7) | method(bits6:4) | confidence(bits3:0)
 *   [24-25] mach_raw (u16, LE) — mach = raw * 0.001
 *   [26-27] qbar_raw (u16, LE) — qbar_pa = raw
 *   [28-29] roll_raw (i16, LE) — roll_deg = raw * 0.1
 *   [30-31] pitch_raw (i16, LE) — pitch_deg = raw * 0.1
 *   [32-33] yaw_raw (i16, LE) — yaw_deg = raw * 0.1
 *   [34-37] CRC-32 (u32, LE)
 */
function parse_gs_telem(payload: Uint8Array): ParseResult {
  if (payload.length < SIZE_GS_MSG_TELEM) {
    return {
      ok: false,
      error: `GS_MSG_TELEM too short: ${payload.length} < ${SIZE_GS_MSG_TELEM}`,
      msg_id: MSG_ID_GS_TELEM
    };
  }

  const crc_ok = verify_packet_crc(payload);

  // FC fields
  const status = decode_status(payload.subarray(1, 3));
  const alt_m = read_u16_le(payload, 3) * ALT_SCALE;
  const vel_mps = read_i16_le(payload, 5) * VEL_SCALE;
  const quat = unpack_quaternion(payload.subarray(7, 12));
  const flight_time_s = read_u16_le(payload, 12) * TIME_SCALE;
  const batt_v = BATT_OFFSET + payload[14] * BATT_SCALE;
  const seq = payload[15];

  // GS derived fields
  const rssi_dbm = read_i16_le(payload, 16) * 0.1;
  const snr_db = read_i8(payload, 18) * 0.25;
  const freq_err_hz = read_i16_le(payload, 19);
  const data_age_ms = read_u16_le(payload, 21);
  const stale = data_age_ms > STALE_THRESHOLD_MS;

  // Recovery byte
  const recovery_byte = payload[23];
  const recovered = (recovery_byte & 0x80) !== 0;
  const method = (recovery_byte >> 4) & 0x07;
  const confidence = recovery_byte & 0x0F;

  const mach = read_u16_le(payload, 24) * 0.001;
  const qbar_pa = read_u16_le(payload, 26);
  const roll_deg = read_i16_le(payload, 28) * 0.1;
  const pitch_deg = read_i16_le(payload, 30) * 0.1;
  const yaw_deg = read_i16_le(payload, 32) * 0.1;

  const data: GsMsgTelem = {
    msg_id: MSG_ID_GS_TELEM,
    status,
    alt_m,
    vel_mps,
    quat,
    flight_time_s,
    batt_v,
    seq,
    rssi_dbm,
    snr_db,
    freq_err_hz,
    data_age_ms,
    stale,
    recovery: { recovered, method, confidence },
    mach,
    qbar_pa,
    roll_deg,
    pitch_deg,
    yaw_deg,
    crc_ok
  };

  return { ok: true, message: { type: 'gs_telem', data } };
}

// ---------------------------------------------------------------------------
// ACK_ARM parser (msg_id 0xA0, 12 bytes)
// ---------------------------------------------------------------------------

/**
 * Parse ACK_ARM packet.
 *
 * Layout (12 bytes total):
 *   [0]    msg_id (0xA0)
 *   [1-2]  nonce (u16, LE)
 *   [3]    echo_channel (u8)
 *   [4]    echo_action (u8)
 *   [5]    arm_state (u8)
 *   [6]    cont_state (u8)
 *   [7]    reserved
 *   [8-11] CRC-32 (u32, LE)
 */
function parse_ack_arm(payload: Uint8Array): ParseResult {
  if (payload.length < SIZE_ACK_ARM) {
    return {
      ok: false,
      error: `ACK_ARM too short: ${payload.length} < ${SIZE_ACK_ARM}`,
      msg_id: MSG_ID_ACK_ARM
    };
  }

  const crc_ok = verify_packet_crc(payload);

  const data: AckArm = {
    msg_id: MSG_ID_ACK_ARM,
    nonce: read_u16_le(payload, 1),
    echo_channel: payload[3],
    echo_action: payload[4],
    arm_state: payload[5],
    cont_state: payload[6],
    crc_ok
  };

  return { ok: true, message: { type: 'ack_arm', data } };
}

// ---------------------------------------------------------------------------
// ACK_FIRE parser (msg_id 0xA1, 13 bytes)
// ---------------------------------------------------------------------------

/**
 * Parse ACK_FIRE packet.
 *
 * Layout (13 bytes total):
 *   [0]    msg_id (0xA1)
 *   [1-2]  nonce (u16, LE)
 *   [3]    echo_channel (u8)
 *   [4]    echo_duration (u8)
 *   [5]    flags: test_mode(bit0), channel_armed(bit1)
 *   [6]    cont_state (u8)
 *   [7-8]  reserved
 *   [9-12] CRC-32 (u32, LE)
 */
function parse_ack_fire(payload: Uint8Array): ParseResult {
  if (payload.length < SIZE_ACK_FIRE) {
    return {
      ok: false,
      error: `ACK_FIRE too short: ${payload.length} < ${SIZE_ACK_FIRE}`,
      msg_id: MSG_ID_ACK_FIRE
    };
  }

  const crc_ok = verify_packet_crc(payload);
  const flags = payload[5];

  const data: AckFire = {
    msg_id: MSG_ID_ACK_FIRE,
    nonce: read_u16_le(payload, 1),
    echo_channel: payload[3],
    echo_duration: payload[4],
    test_mode: (flags & 0x01) !== 0,
    channel_armed: (flags & 0x02) !== 0,
    cont_state: payload[6],
    crc_ok
  };

  return { ok: true, message: { type: 'ack_fire', data } };
}

// ---------------------------------------------------------------------------
// ACK_CONFIG parser (msg_id 0xA3, 13 bytes)
// ---------------------------------------------------------------------------

/**
 * Parse ACK_CONFIG packet.
 *
 * Layout (13 bytes total):
 *   [0]    msg_id (0xA3)
 *   [1-2]  nonce (u16, LE)
 *   [3-6]  config_hash (u32, LE)
 *   [7]    protocol_version (u8)
 *   [8]    reserved
 *   [9-12] CRC-32 (u32, LE)
 */
function parse_ack_config(payload: Uint8Array): ParseResult {
  if (payload.length < SIZE_ACK_CONFIG) {
    return {
      ok: false,
      error: `ACK_CONFIG too short: ${payload.length} < ${SIZE_ACK_CONFIG}`,
      msg_id: MSG_ID_ACK_CONFIG
    };
  }

  const crc_ok = verify_packet_crc(payload);

  const data: AckConfig = {
    msg_id: MSG_ID_ACK_CONFIG,
    nonce: read_u16_le(payload, 1),
    config_hash: read_u32_le(payload, 3),
    protocol_version: payload[7],
    crc_ok
  };

  return { ok: true, message: { type: 'ack_config', data } };
}

// ---------------------------------------------------------------------------
// NACK parser (msg_id 0xE0, 10 bytes)
// ---------------------------------------------------------------------------

/**
 * Parse NACK packet.
 *
 * Layout (10 bytes total):
 *   [0]    msg_id (0xE0)
 *   [1-2]  nonce (u16, LE)
 *   [3]    error_code (u8)
 *   [4-5]  reserved
 *   [6-9]  CRC-32 (u32, LE)
 */
function parse_nack(payload: Uint8Array): ParseResult {
  if (payload.length < SIZE_NACK) {
    return {
      ok: false,
      error: `NACK too short: ${payload.length} < ${SIZE_NACK}`,
      msg_id: MSG_ID_NACK
    };
  }

  const crc_ok = verify_packet_crc(payload);

  const data: Nack = {
    msg_id: MSG_ID_NACK,
    nonce: read_u16_le(payload, 1),
    error_code: payload[3] as NackError,
    crc_ok
  };

  return { ok: true, message: { type: 'nack', data } };
}

// ---------------------------------------------------------------------------
// CONFIRM parser (msg_id 0xF0, 9 bytes)
// ---------------------------------------------------------------------------

/**
 * Parse CONFIRM packet.
 *
 * Layout (9 bytes total):
 *   [0]    msg_id (0xF0)
 *   [1-2]  nonce (u16, LE)
 *   [3-4]  reserved
 *   [5-8]  CRC-32 (u32, LE)
 */
function parse_confirm(payload: Uint8Array): ParseResult {
  if (payload.length < SIZE_CONFIRM) {
    return {
      ok: false,
      error: `CONFIRM too short: ${payload.length} < ${SIZE_CONFIRM}`,
      msg_id: MSG_ID_CONFIRM
    };
  }

  const crc_ok = verify_packet_crc(payload);

  return {
    ok: true,
    message: {
      type: 'confirm',
      data: {
        nonce: read_u16_le(payload, 1),
        crc_ok
      }
    }
  };
}

// ---------------------------------------------------------------------------
// HANDSHAKE response parser (msg_id 0xC0, min 6 bytes)
// ---------------------------------------------------------------------------

/**
 * Parse HANDSHAKE response packet from the FC.
 *
 * Layout (variable length, minimum 6 bytes):
 *   [0]       msg_id (0xC0)
 *   [1]       protocol_version (u8)
 *   [2..N-5]  fw_version (ASCII string, variable length)
 *   [N-4..N-1] CRC-32 (u32, LE)
 *
 * Minimum size: 6 bytes (msg_id + version + 0 chars fw_version + CRC32).
 */
function parse_handshake(payload: Uint8Array): ParseResult {
  const MIN_HANDSHAKE_SIZE = 6;
  if (payload.length < MIN_HANDSHAKE_SIZE) {
    return {
      ok: false,
      error: `HANDSHAKE too short: ${payload.length} < ${MIN_HANDSHAKE_SIZE}`,
      msg_id: MSG_ID_HANDSHAKE
    };
  }

  const crc_ok = verify_packet_crc(payload);
  const protocol_version = payload[1];

  // Firmware version string: bytes between protocol_version and CRC
  const fw_start = 2;
  const fw_end = payload.length - 4;
  let fw_version = '';
  if (fw_end > fw_start) {
    const fw_bytes = payload.subarray(fw_start, fw_end);
    fw_version = String.fromCharCode(...fw_bytes);
  }

  const data: HandshakeResponse = {
    msg_id: MSG_ID_HANDSHAKE,
    protocol_version,
    fw_version,
    crc_ok
  };

  return { ok: true, message: { type: 'handshake', data } };
}
