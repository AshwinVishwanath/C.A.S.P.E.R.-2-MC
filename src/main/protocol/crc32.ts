/**
 * Standard CRC-32 (CRC-32/ISO-HDLC) implementation.
 *
 * Parameters:
 *   - Polynomial: 0x04C11DB7 (reflected: 0xEDB88320)
 *   - Initial value: 0xFFFFFFFF
 *   - Reflect input: YES
 *   - Reflect output: YES
 *   - Final XOR: 0xFFFFFFFF
 *   - Process: byte-by-byte with 256-entry lookup table
 *
 * Known test vector: CRC-32 of ASCII "123456789" = 0xCBF43926
 *
 * @module protocol/crc32
 */

import { CRC32_POLY, CRC32_INIT, CRC32_XOR_OUT } from './constants';

/**
 * Precomputed 256-entry lookup table for reflected CRC-32.
 *
 * Generated using the reflected polynomial 0xEDB88320.
 * Each entry represents the CRC contribution of a single byte value (0-255).
 */
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ CRC32_POLY;
      } else {
        crc = crc >>> 1;
      }
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/**
 * Compute standard CRC-32 (CRC-32/ISO-HDLC).
 *
 * Processes data byte-by-byte using a 256-entry lookup table.
 *
 * @param data - Raw payload bytes.
 * @returns 32-bit CRC value (unsigned).
 */
export function crc32_compute(data: Uint8Array): number {
  let crc = CRC32_INIT;

  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }

  return (crc ^ CRC32_XOR_OUT) >>> 0;
}

/**
 * Verify CRC-32: compute CRC over payload and compare with expected value.
 *
 * @param payload - Raw payload bytes (excluding the CRC field).
 * @param expected_crc - Expected CRC-32 value to compare against.
 * @returns Object with valid flag, computed CRC, and expected CRC.
 */
export function crc32_verify(
  payload: Uint8Array,
  expected_crc: number
): { valid: boolean; computed: number; expected: number } {
  const computed = crc32_compute(payload);
  return {
    valid: (computed >>> 0) === (expected_crc >>> 0),
    computed: computed >>> 0,
    expected: expected_crc >>> 0
  };
}
