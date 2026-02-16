/**
 * CAC (Command-Acknowledge-Confirm) command packet builder.
 *
 * Builds binary command packets for transmission to the FC via LoRa.
 * All packets include magic bytes and CRC-32 for integrity.
 *
 * Command packet structure (PRD Section 17):
 *   [msg_id] [MAGIC_1] [MAGIC_2] [nonce:u16 LE] [fields...] [CRC-32:u32 LE]
 *
 * @module protocol/command_builder
 */

import {
  MSG_ID_CMD_ARM,
  MSG_ID_CMD_FIRE,
  MSG_ID_CONFIRM,
  MSG_ID_ABORT,
  MAGIC_1,
  MAGIC_2,
  SIZE_CMD_ARM,
  SIZE_CMD_FIRE,
  SIZE_CONFIRM,
  SIZE_ABORT
} from './constants';
import { crc32_compute } from './crc32';

// ---------------------------------------------------------------------------
// Helper: write little-endian values
// ---------------------------------------------------------------------------

/** Write unsigned 16-bit little-endian at offset. */
function write_u16_le(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xFF;
  buf[offset + 1] = (value >> 8) & 0xFF;
}

/** Write unsigned 32-bit little-endian at offset. */
function write_u32_le(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xFF;
  buf[offset + 1] = (value >> 8) & 0xFF;
  buf[offset + 2] = (value >> 16) & 0xFF;
  buf[offset + 3] = (value >> 24) & 0xFF;
}

// ---------------------------------------------------------------------------
// Command builders
// ---------------------------------------------------------------------------

/**
 * Build ARM/DISARM command packet (12 bytes).
 *
 * Layout:
 *   [0]    msg_id (0x80)
 *   [1]    MAGIC_1 (0xCA)
 *   [2]    MAGIC_2 (0x5A)
 *   [3-4]  nonce (u16, LE)
 *   [5]    channel (u8, 0-3)
 *   [6]    action (u8, 1=arm, 0=disarm)
 *   [7]    ~channel (bitwise complement)
 *   [8-11] CRC-32 (u32, LE)
 *
 * Note: The spec calls for [~channel] and [~action] as safety complements.
 * However, the total packet size is 12 bytes, and with nonce(2) + channel(1)
 * + action(1) + ~channel(1) + ~action(1) + CRC(4) + header(3) = 13 bytes.
 * Per the spec size of 12 bytes, we include ~channel but not ~action,
 * keeping the layout tight. See PRD Section 17.2.
 *
 * @param channel - Pyro channel index (0-3).
 * @param arm - True to arm, false to disarm.
 * @param nonce - Unique 16-bit nonce for this transaction.
 * @returns 12-byte command packet.
 */
export function build_arm_command(
  channel: number,
  arm: boolean,
  nonce: number
): Uint8Array {
  const buf = new Uint8Array(SIZE_CMD_ARM);

  buf[0] = MSG_ID_CMD_ARM;
  buf[1] = MAGIC_1;
  buf[2] = MAGIC_2;
  write_u16_le(buf, 3, nonce & 0xFFFF);
  buf[5] = channel & 0xFF;
  buf[6] = arm ? 0x01 : 0x00;
  buf[7] = (~channel) & 0xFF;

  // CRC over bytes [0..7]
  const crc = crc32_compute(buf.subarray(0, 8));
  write_u32_le(buf, 8, crc);

  return buf;
}

/**
 * Build FIRE command packet (13 bytes).
 *
 * Layout:
 *   [0]    msg_id (0x81)
 *   [1]    MAGIC_1 (0xCA)
 *   [2]    MAGIC_2 (0x5A)
 *   [3-4]  nonce (u16, LE)
 *   [5]    channel (u8, 0-3)
 *   [6]    duration (u8, fire duration in units TBD)
 *   [7]    ~channel (bitwise complement)
 *   [8]    ~duration (bitwise complement)
 *   [9-12] CRC-32 (u32, LE)
 *
 * @param channel - Pyro channel index (0-3).
 * @param duration_ms - Fire duration. Encoded as u8.
 * @param nonce - Unique 16-bit nonce for this transaction.
 * @returns 13-byte command packet.
 */
export function build_fire_command(
  channel: number,
  duration_ms: number,
  nonce: number
): Uint8Array {
  const buf = new Uint8Array(SIZE_CMD_FIRE);
  const duration_u8 = Math.min(255, Math.max(0, Math.round(duration_ms))) & 0xFF;

  buf[0] = MSG_ID_CMD_FIRE;
  buf[1] = MAGIC_1;
  buf[2] = MAGIC_2;
  write_u16_le(buf, 3, nonce & 0xFFFF);
  buf[5] = channel & 0xFF;
  buf[6] = duration_u8;
  buf[7] = (~channel) & 0xFF;
  buf[8] = (~duration_u8) & 0xFF;

  // CRC over bytes [0..8]
  const crc = crc32_compute(buf.subarray(0, 9));
  write_u32_le(buf, 9, crc);

  return buf;
}

/**
 * Build CONFIRM packet (9 bytes).
 *
 * Layout:
 *   [0]    msg_id (0xF0)
 *   [1]    MAGIC_1 (0xCA)
 *   [2]    MAGIC_2 (0x5A)
 *   [3-4]  nonce (u16, LE)
 *   [5-8]  CRC-32 (u32, LE)
 *
 * @param nonce - Nonce from the ACK being confirmed.
 * @returns 9-byte confirm packet.
 */
export function build_confirm(nonce: number): Uint8Array {
  const buf = new Uint8Array(SIZE_CONFIRM);

  buf[0] = MSG_ID_CONFIRM;
  buf[1] = MAGIC_1;
  buf[2] = MAGIC_2;
  write_u16_le(buf, 3, nonce & 0xFFFF);

  // CRC over bytes [0..4]
  const crc = crc32_compute(buf.subarray(0, 5));
  write_u32_le(buf, 5, crc);

  return buf;
}

/**
 * Build ABORT packet (9 bytes).
 *
 * Layout:
 *   [0]    msg_id (0xF1)
 *   [1]    MAGIC_1 (0xCA)
 *   [2]    MAGIC_2 (0x5A)
 *   [3-4]  nonce (u16, LE)
 *   [5-8]  CRC-32 (u32, LE)
 *
 * @param nonce - Nonce from the transaction being aborted.
 * @returns 9-byte abort packet.
 */
export function build_abort(nonce: number): Uint8Array {
  const buf = new Uint8Array(SIZE_ABORT);

  buf[0] = MSG_ID_ABORT;
  buf[1] = MAGIC_1;
  buf[2] = MAGIC_2;
  write_u16_le(buf, 3, nonce & 0xFFFF);

  // CRC over bytes [0..4]
  const crc = crc32_compute(buf.subarray(0, 5));
  write_u32_le(buf, 5, crc);

  return buf;
}

/**
 * Generate a random uint16 nonce.
 *
 * Uses crypto.getRandomValues when available, falls back to Math.random.
 *
 * @returns Random 16-bit unsigned integer.
 */
export function generate_nonce(): number {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.getRandomValues) {
    const buf = new Uint16Array(1);
    globalThis.crypto.getRandomValues(buf);
    return buf[0];
  }
  // Fallback for environments without crypto API
  return Math.floor(Math.random() * 0x10000);
}
