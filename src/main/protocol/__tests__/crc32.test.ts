/**
 * Tests for standard CRC-32 (CRC-32/ISO-HDLC) implementation.
 *
 * Parameters:
 *   - Polynomial: 0x04C11DB7 (reflected: 0xEDB88320)
 *   - Init: 0xFFFFFFFF
 *   - Reflect in/out: YES
 *   - Final XOR: 0xFFFFFFFF
 *   - Byte-by-byte processing
 *
 * The canonical check value for ASCII "123456789" is 0xCBF43926.
 */

import { describe, it, expect } from 'vitest';
import { crc32_compute, crc32_verify } from '../crc32';

describe('crc32_compute', () => {
  it('should produce the standard check value for "123456789"', () => {
    const data = new Uint8Array([
      0x31, 0x32, 0x33, 0x34,
      0x35, 0x36, 0x37, 0x38,
      0x39
    ]);
    const result = crc32_compute(data);
    expect(result).toBe(0xCBF43926);
  });

  it('should handle empty input', () => {
    const data = new Uint8Array([]);
    const result = crc32_compute(data);
    // CRC-32 of empty data: init 0xFFFFFFFF XOR final 0xFFFFFFFF = 0x00000000
    expect(result).toBe(0x00000000);
  });

  it('should produce correct CRC for a single byte (0x00)', () => {
    const data = new Uint8Array([0x00]);
    const result = crc32_compute(data);
    // Known: CRC-32 of single zero byte = 0xD202EF8D
    expect(result).toBe(0xD202EF8D);
  });

  it('should produce correct CRC for a single byte (0xFF)', () => {
    const data = new Uint8Array([0xFF]);
    const result = crc32_compute(data);
    // Known: CRC-32 of single 0xFF byte = 0xFF000000
    expect(result).toBe(0xFF000000);
  });

  it('should produce different CRC for different inputs', () => {
    const a = crc32_compute(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
    const b = crc32_compute(new Uint8Array([0x04, 0x03, 0x02, 0x01]));
    expect(a).not.toBe(b);
  });

  it('should detect a single byte flip', () => {
    const original = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"
    const flipped = new Uint8Array([0x48, 0x65, 0x6C, 0x6D, 0x6F]);  // "Helmo"
    expect(crc32_compute(original)).not.toBe(crc32_compute(flipped));
  });

  it('should be deterministic (same input always produces same output)', () => {
    const data = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]);
    const crc1 = crc32_compute(data);
    const crc2 = crc32_compute(data);
    expect(crc1).toBe(crc2);
  });

  it('should return unsigned 32-bit values', () => {
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const result = crc32_compute(data);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xFFFFFFFF);
    expect(result >>> 0).toBe(result);
  });

  it('should handle multi-byte input correctly', () => {
    const data = new Uint8Array([
      0x01, 0x02, 0x03, 0x04,
      0x05, 0x06, 0x07, 0x08
    ]);
    const result = crc32_compute(data);
    expect(result >>> 0).toBe(result);
    // Verify it's not the empty-input value
    expect(result).not.toBe(0x00000000);
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

  it('should handle empty data', () => {
    const data = new Uint8Array([]);
    const result = crc32_verify(data, 0x00000000);
    expect(result.valid).toBe(true);
  });

  it('should verify the "123456789" test vector', () => {
    const data = new Uint8Array([
      0x31, 0x32, 0x33, 0x34,
      0x35, 0x36, 0x37, 0x38,
      0x39
    ]);
    const result = crc32_verify(data, 0xCBF43926);
    expect(result.valid).toBe(true);
  });

  it('should return unsigned values in all fields', () => {
    const data = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
    const result = crc32_verify(data, 0x00000000);
    expect(result.computed).toBeGreaterThanOrEqual(0);
    expect(result.expected).toBeGreaterThanOrEqual(0);
  });
});
