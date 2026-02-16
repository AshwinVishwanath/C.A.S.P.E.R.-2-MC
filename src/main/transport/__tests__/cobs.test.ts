import { describe, it, expect } from 'vitest';
import { cobs_encode, cobs_decode } from '../cobs';

describe('cobs_encode / cobs_decode', () => {
  /**
   * Helper: round-trip a payload through encode then decode,
   * verifying the decoded result matches the original.
   */
  function round_trip(payload: number[]): void {
    const input = new Uint8Array(payload);
    const encoded = cobs_encode(input);

    // Encoded output must never contain 0x00.
    for (let i = 0; i < encoded.length; i++) {
      expect(encoded[i]).not.toBe(0x00);
    }

    const decoded = cobs_decode(encoded);
    expect(decoded).not.toBeNull();
    expect(Array.from(decoded!)).toEqual(payload);
  }

  // --- Round-trip tests ---------------------------------------------------

  it('round-trips an empty payload', () => {
    round_trip([]);
  });

  it('round-trips a single non-zero byte', () => {
    round_trip([0x42]);
  });

  it('round-trips a single zero byte', () => {
    round_trip([0x00]);
  });

  it('round-trips all-zeros payload [0x00, 0x00, 0x00]', () => {
    round_trip([0x00, 0x00, 0x00]);
  });

  it('round-trips a mixed payload with embedded zeros', () => {
    round_trip([0x11, 0x22, 0x00, 0x33, 0x00, 0x44, 0x55]);
  });

  it('round-trips a payload with zero at the start', () => {
    round_trip([0x00, 0xaa, 0xbb]);
  });

  it('round-trips a payload with zero at the end', () => {
    round_trip([0xaa, 0xbb, 0x00]);
  });

  it('round-trips a payload of exactly 254 non-zero bytes (max block)', () => {
    const payload: number[] = [];
    for (let i = 0; i < 254; i++) {
      payload.push((i % 254) + 1); // 1..254 cycling
    }
    round_trip(payload);
  });

  it('round-trips a payload of 255 non-zero bytes (forces block split)', () => {
    const payload: number[] = [];
    for (let i = 0; i < 255; i++) {
      payload.push((i % 254) + 1);
    }
    round_trip(payload);
  });

  it('round-trips a payload of 508 non-zero bytes (two full blocks)', () => {
    const payload: number[] = [];
    for (let i = 0; i < 508; i++) {
      payload.push((i % 254) + 1);
    }
    round_trip(payload);
  });

  it('round-trips random payloads of various sizes', () => {
    // Deterministic pseudo-random for reproducibility.
    let seed = 12345;
    function next_byte(): number {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed & 0xff;
    }

    for (const size of [1, 2, 10, 50, 253, 254, 255, 256, 500, 1000]) {
      const payload: number[] = [];
      for (let i = 0; i < size; i++) {
        payload.push(next_byte());
      }
      round_trip(payload);
    }
  });

  // --- Known-value encoding tests -----------------------------------------

  it('encodes empty payload to [0x01]', () => {
    const encoded = cobs_encode(new Uint8Array([]));
    expect(Array.from(encoded)).toEqual([0x01]);
  });

  it('encodes [0x00] to [0x01, 0x01]', () => {
    const encoded = cobs_encode(new Uint8Array([0x00]));
    expect(Array.from(encoded)).toEqual([0x01, 0x01]);
  });

  it('encodes [0x11, 0x22, 0x00, 0x33] correctly', () => {
    const encoded = cobs_encode(new Uint8Array([0x11, 0x22, 0x00, 0x33]));
    // First block: code=3 (2 data bytes + implicit zero), data 0x11, 0x22
    // Second block: code=2 (1 data byte), data 0x33
    expect(Array.from(encoded)).toEqual([0x03, 0x11, 0x22, 0x02, 0x33]);
  });

  it('encodes [0x11, 0x22, 0x33] (no zeros) correctly', () => {
    const encoded = cobs_encode(new Uint8Array([0x11, 0x22, 0x33]));
    // Single block: code=4 (3 data bytes, no trailing zero), data 0x11, 0x22, 0x33
    expect(Array.from(encoded)).toEqual([0x04, 0x11, 0x22, 0x33]);
  });

  // --- Decode error cases -------------------------------------------------

  it('decode returns null for an empty frame', () => {
    expect(cobs_decode(new Uint8Array([]))).toBeNull();
  });

  it('decode returns null when frame contains 0x00', () => {
    expect(cobs_decode(new Uint8Array([0x02, 0x00, 0x01]))).toBeNull();
  });

  it('decode returns null for invalid overhead byte (code too large for remaining data)', () => {
    // Code byte says 5 data bytes follow, but only 1 is present.
    expect(cobs_decode(new Uint8Array([0x05, 0xaa]))).toBeNull();
  });

  it('decode returns null for frame with leading zero code byte', () => {
    // Code byte 0x00 is never valid in COBS.
    expect(cobs_decode(new Uint8Array([0x00, 0x01]))).toBeNull();
  });
});
