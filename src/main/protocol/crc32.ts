/**
 * CRC-32 matching the STM32 hardware CRC peripheral.
 *
 * The STM32 CRC peripheral uses:
 *   - Polynomial: 0x04C11DB7
 *   - Initial value: 0xFFFFFFFF
 *   - NO final XOR
 *   - Input/output NOT reflected (this is NOT standard CRC-32)
 *
 * CRITICAL: The STM32 hardware CRC processes data in 32-bit words.
 * Each word is loaded big-endian (MSB first). For payloads whose
 * length is not a multiple of 4, the last partial word is padded
 * with zero bytes on the right (least-significant positions).
 *
 * @module protocol/crc32
 */

import { CRC32_POLY, CRC32_INIT } from './constants';

/**
 * Compute CRC-32 matching the STM32 hardware CRC peripheral.
 *
 * Processes data in 32-bit words (big-endian byte order within each word).
 * For payloads not a multiple of 4 bytes, the last partial word is
 * zero-padded on the right.
 *
 * @param data - Raw payload bytes.
 * @returns 32-bit CRC value (unsigned).
 */
export function crc32_compute(data: Uint8Array): number {
  let crc = CRC32_INIT;
  const len = data.length;

  // Number of complete 32-bit words
  const full_words = Math.floor(len / 4);

  for (let w = 0; w < full_words; w++) {
    const offset = w * 4;
    // Load 32-bit word in big-endian order (MSB at lowest address)
    const word =
      ((data[offset] << 24) |
        (data[offset + 1] << 16) |
        (data[offset + 2] << 8) |
        data[offset + 3]) >>> 0;

    crc = crc32_process_word(crc, word);
  }

  // Handle the last partial word (if any) by zero-padding on the right
  const remaining = len % 4;
  if (remaining > 0) {
    const offset = full_words * 4;
    let word = 0;
    for (let i = 0; i < remaining; i++) {
      word |= data[offset + i] << (24 - i * 8);
    }
    // Remaining positions are already 0 (zero-padded on the right)
    word = word >>> 0;
    crc = crc32_process_word(crc, word);
  }

  return crc >>> 0;
}

/**
 * Process a single 32-bit word through the CRC state machine.
 *
 * @param crc - Current CRC accumulator.
 * @param word - 32-bit data word to process.
 * @returns Updated CRC accumulator.
 */
function crc32_process_word(crc: number, word: number): number {
  crc = (crc ^ word) >>> 0;

  for (let bit = 0; bit < 32; bit++) {
    if (crc & 0x80000000) {
      crc = ((crc << 1) ^ CRC32_POLY) >>> 0;
    } else {
      crc = (crc << 1) >>> 0;
    }
  }

  return crc >>> 0;
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
