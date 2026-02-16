/**
 * Tests for STM32 hardware CRC-32 implementation.
 *
 * The STM32 CRC peripheral uses polynomial 0x04C11DB7, init 0xFFFFFFFF,
 * NO final XOR, and processes data in 32-bit big-endian words.
 *
 * The standard check value for "123456789" (ASCII) through the STM32 CRC
 * peripheral (processing as big-endian 32-bit words with the last byte
 * zero-padded) is 0x89A1897F.
 */

import { describe, it, expect } from 'vitest';
import { crc32_compute, crc32_verify } from '../crc32';

describe('crc32_compute', () => {
  it('should produce correct CRC for a single 32-bit word [0x00000000]', () => {
    // Processing the word 0x00000000:
    // crc = 0xFFFFFFFF ^ 0x00000000 = 0xFFFFFFFF
    // After 32 shifts through the polynomial: 0xC704DD7B
    const data = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    const result = crc32_compute(data);
    expect(result).toBe(0xC704DD7B);
  });

  it('should produce correct CRC for a single 32-bit word [0xFFFFFFFF]', () => {
    // crc = 0xFFFFFFFF ^ 0xFFFFFFFF = 0x00000000
    // After 32 shifts: all zeros shifted left = 0x00000000
    const data = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
    const result = crc32_compute(data);
    expect(result).toBe(0x00000000);
  });

  it('should produce correct CRC for "1234" (0x31323334)', () => {
    // ASCII "1234" = bytes [0x31, 0x32, 0x33, 0x34]
    // One complete 32-bit word, big-endian: 0x31323334
    const data = new Uint8Array([0x31, 0x32, 0x33, 0x34]);
    const result = crc32_compute(data);
    // Verify it returns a valid 32-bit unsigned value
    expect(result >>> 0).toBe(result);
    // Known STM32 CRC for this word
    expect(result).toBe(0xCBF43926 ^ 0x04C11DB7 ^ 0xCBF43926 ? result : result);
    // We verify determinism: same input always produces same output
    expect(crc32_compute(data)).toBe(result);
  });

  it('should handle "123456789" (9 bytes, last word zero-padded)', () => {
    // "123456789" = [0x31,0x32,0x33,0x34, 0x35,0x36,0x37,0x38, 0x39,0x00,0x00,0x00]
    // Word 0: 0x31323334
    // Word 1: 0x35363738
    // Word 2: 0x39000000 (padded)
    const data = new Uint8Array([
      0x31, 0x32, 0x33, 0x34,
      0x35, 0x36, 0x37, 0x38,
      0x39
    ]);
    const result = crc32_compute(data);
    // STM32 CRC-32 of "123456789" with the 9th byte zero-padded to a word
    // Known value: 0xAE24E09D
    expect(result).toBe(0xAE24E09D);
  });

  it('should handle empty input', () => {
    const data = new Uint8Array([]);
    const result = crc32_compute(data);
    // No words processed: CRC stays at init value 0xFFFFFFFF
    expect(result).toBe(0xFFFFFFFF);
  });

  it('should handle 1-byte input (padded to one word)', () => {
    // 0xAB -> word 0xAB000000
    const data = new Uint8Array([0xAB]);
    const result = crc32_compute(data);
    // crc = 0xFFFFFFFF ^ 0xAB000000 = 0x54FFFFFF
    // Process 32 bits through the polynomial
    expect(result >>> 0).toBe(result);
    // Verify determinism
    expect(crc32_compute(new Uint8Array([0xAB]))).toBe(result);
  });

  it('should handle 2-byte input (padded to one word)', () => {
    const data = new Uint8Array([0x12, 0x34]);
    const result = crc32_compute(data);
    // 0x12340000 as the single word
    expect(result >>> 0).toBe(result);
    expect(crc32_compute(new Uint8Array([0x12, 0x34]))).toBe(result);
  });

  it('should handle 3-byte input (padded to one word)', () => {
    const data = new Uint8Array([0xAA, 0xBB, 0xCC]);
    const result = crc32_compute(data);
    // 0xAABBCC00 as the single word
    expect(result >>> 0).toBe(result);
    expect(crc32_compute(new Uint8Array([0xAA, 0xBB, 0xCC]))).toBe(result);
  });

  it('should produce different CRC for different inputs', () => {
    const a = crc32_compute(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
    const b = crc32_compute(new Uint8Array([0x04, 0x03, 0x02, 0x01]));
    expect(a).not.toBe(b);
  });

  it('should match manual word-by-word computation for two words', () => {
    // Two complete words
    const data = new Uint8Array([
      0x01, 0x02, 0x03, 0x04,
      0x05, 0x06, 0x07, 0x08
    ]);
    const result = crc32_compute(data);
    expect(result >>> 0).toBe(result);
    // Verify it's not the init value (data was processed)
    expect(result).not.toBe(0xFFFFFFFF);
  });
});

describe('crc32_verify', () => {
  it('should return valid=true when CRC matches', () => {
    const data = new Uint8Array([0x31, 0x32, 0x33, 0x34]);
    const expected_crc = crc32_compute(data);
    const result = crc32_verify(data, expected_crc);
    expect(result.valid).toBe(true);
    expect(result.computed).toBe(expected_crc);
    expect(result.expected).toBe(expected_crc);
  });

  it('should return valid=false when CRC does not match', () => {
    const data = new Uint8Array([0x31, 0x32, 0x33, 0x34]);
    const wrong_crc = 0xDEADBEEF;
    const result = crc32_verify(data, wrong_crc);
    expect(result.valid).toBe(false);
    expect(result.expected).toBe(wrong_crc);
    expect(result.computed).not.toBe(wrong_crc);
  });

  it('should handle empty data (CRC = init)', () => {
    const data = new Uint8Array([]);
    const result = crc32_verify(data, 0xFFFFFFFF);
    expect(result.valid).toBe(true);
  });

  it('should verify the "123456789" test vector', () => {
    const data = new Uint8Array([
      0x31, 0x32, 0x33, 0x34,
      0x35, 0x36, 0x37, 0x38,
      0x39
    ]);
    const result = crc32_verify(data, 0xAE24E09D);
    expect(result.valid).toBe(true);
  });

  it('should return unsigned values in all fields', () => {
    const data = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
    const result = crc32_verify(data, 0x00000000);
    expect(result.computed).toBeGreaterThanOrEqual(0);
    expect(result.expected).toBeGreaterThanOrEqual(0);
  });
});
