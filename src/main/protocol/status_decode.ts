/**
 * FC_TLM_STATUS bitmap decoder.
 *
 * Decodes the 2-byte FC_TLM_STATUS field from telemetry packets
 * into a structured FcTlmStatus object.
 *
 * Bitmap layout (PRD Section 4.2):
 *   Byte 0 (LSB): ARM4 | ARM3 | ARM2 | ARM1 | CNT4 | CNT3 | CNT2 | CNT1
 *                  bit7   bit6   bit5   bit4   bit3   bit2   bit1   bit0
 *   Byte 1 (MSB): ST3 | ST2 | ST1 | ST0 | FIRED | ERROR | RSVD | RSVD
 *                  bit7  bit6  bit5  bit4   bit3    bit2   bit1   bit0
 *
 * @module protocol/status_decode
 */

import { FcTlmStatus, FsmState } from './types';

/**
 * Decode FC_TLM_STATUS uint16 bitmap.
 *
 * @param raw - 2-byte Uint8Array containing the status bitmap (little-endian).
 * @returns Decoded status structure.
 */
export function decode_status(raw: Uint8Array): FcTlmStatus {
  const byte0 = raw.length > 0 ? raw[0] : 0; // LSB
  const byte1 = raw.length > 1 ? raw[1] : 0; // MSB

  // Byte 0 bits 0-3: continuity for channels 1-4
  const continuity: [boolean, boolean, boolean, boolean] = [
    (byte0 & 0x01) !== 0, // CNT1 — bit 0
    (byte0 & 0x02) !== 0, // CNT2 — bit 1
    (byte0 & 0x04) !== 0, // CNT3 — bit 2
    (byte0 & 0x08) !== 0  // CNT4 — bit 3
  ];

  // Byte 0 bits 4-7: arm state for channels 1-4
  const armed: [boolean, boolean, boolean, boolean] = [
    (byte0 & 0x10) !== 0, // ARM1 — bit 4
    (byte0 & 0x20) !== 0, // ARM2 — bit 5
    (byte0 & 0x40) !== 0, // ARM3 — bit 6
    (byte0 & 0x80) !== 0  // ARM4 — bit 7
  ];

  // Byte 1 bits 4-7: FSM state (4-bit, ST0 is bit 4, ST3 is bit 7)
  const fsm_raw = (byte1 >> 4) & 0x0F;
  const fsm_state: FsmState = fsm_raw as FsmState;

  // Byte 1 bit 3: fired flag
  const fired = (byte1 & 0x08) !== 0;

  // Byte 1 bit 2: error flag
  const error = (byte1 & 0x04) !== 0;

  // Byte 1 bits 0-1: reserved

  return {
    continuity,
    armed,
    fsm_state,
    fired,
    error
  };
}
