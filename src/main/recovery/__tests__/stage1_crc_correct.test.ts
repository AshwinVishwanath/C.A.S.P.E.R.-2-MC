import { describe, it, expect } from 'vitest';
import {
  crc32_compute,
  generate_syndrome_table,
  try_correct_single_bit,
  FC_MSG_FAST_PAYLOAD_LEN,
  FC_MSG_GPS_PAYLOAD_LEN,
  FC_MSG_EVENT_PAYLOAD_LEN,
} from '../stage1_crc_correct';

/**
 * Helper: build a complete packet (payload + big-endian CRC-32 trailer).
 */
function build_packet(payload: Uint8Array): Uint8Array {
  const crc = crc32_compute(payload);
  const packet = new Uint8Array(payload.length + 4);
  packet.set(payload);
  packet[payload.length] = (crc >>> 24) & 0xff;
  packet[payload.length + 1] = (crc >>> 16) & 0xff;
  packet[payload.length + 2] = (crc >>> 8) & 0xff;
  packet[payload.length + 3] = crc & 0xff;
  return packet;
}

/**
 * Helper: flip a single bit in a Uint8Array (MSB-first bit numbering).
 * Bit 0 = MSB of byte 0, bit 7 = LSB of byte 0, bit 8 = MSB of byte 1, etc.
 */
function flip_bit(data: Uint8Array, bit_pos: number): Uint8Array {
  const copy = data.slice();
  const byte_idx = Math.floor(bit_pos / 8);
  const bit_in_byte = 7 - (bit_pos % 8);
  copy[byte_idx] ^= 1 << bit_in_byte;
  return copy;
}

// ---------------------------------------------------------------------------
// CRC-32 basic tests
// ---------------------------------------------------------------------------

describe('crc32_compute', () => {
  it('should return 0x00000000 for empty input', () => {
    // Empty input: init 0xFFFFFFFF XOR final 0xFFFFFFFF = 0x00000000.
    const crc = crc32_compute(new Uint8Array(0));
    expect(crc).toBe(0x00000000);
  });

  it('should produce a deterministic result for known data', () => {
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const crc1 = crc32_compute(data);
    const crc2 = crc32_compute(data);
    expect(crc1).toBe(crc2);
    // Should be a 32-bit unsigned value.
    expect(crc1).toBeGreaterThanOrEqual(0);
    expect(crc1).toBeLessThanOrEqual(0xffffffff);
  });

  it('should produce different CRCs for different data', () => {
    const a = crc32_compute(new Uint8Array([0x00, 0x00, 0x00, 0x01]));
    const b = crc32_compute(new Uint8Array([0x00, 0x00, 0x00, 0x02]));
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Syndrome table generation
// ---------------------------------------------------------------------------

describe('generate_syndrome_table', () => {
  it('should produce the correct number of entries for FC_MSG_FAST (15 bytes)', () => {
    const table = generate_syndrome_table(FC_MSG_FAST_PAYLOAD_LEN);
    expect(table.size).toBe(15 * 8); // 120 entries
  });

  it('should produce the correct number of entries for FC_MSG_GPS (8 bytes)', () => {
    const table = generate_syndrome_table(FC_MSG_GPS_PAYLOAD_LEN);
    expect(table.size).toBe(8 * 8); // 64 entries
  });

  it('should produce the correct number of entries for FC_MSG_EVENT (5 bytes)', () => {
    const table = generate_syndrome_table(FC_MSG_EVENT_PAYLOAD_LEN);
    expect(table.size).toBe(5 * 8); // 40 entries
  });

  it('should have unique syndromes for all bit positions', () => {
    // If two different single-bit errors produce the same syndrome,
    // the table would have fewer entries than expected. The size checks
    // above already verify this, but let's be explicit.
    const table = generate_syndrome_table(8);
    const syndromes = [...table.keys()];
    const unique_syndromes = new Set(syndromes);
    expect(unique_syndromes.size).toBe(syndromes.length);
  });
});

// ---------------------------------------------------------------------------
// Single-bit correction — FC_MSG_FAST (15 bytes)
// ---------------------------------------------------------------------------

describe('try_correct_single_bit — FC_MSG_FAST (15 bytes)', () => {
  const PAYLOAD_LEN = FC_MSG_FAST_PAYLOAD_LEN;

  it('should return null for a valid (uncorrupted) packet', () => {
    const payload = new Uint8Array(PAYLOAD_LEN);
    payload.fill(0xaa);
    const packet = build_packet(payload);
    const result = try_correct_single_bit(packet, PAYLOAD_LEN);
    expect(result).toBeNull();
  });

  it('should correct a single-bit error at bit 0 (MSB of byte 0)', () => {
    const payload = new Uint8Array(PAYLOAD_LEN);
    payload.fill(0x55);
    const valid_packet = build_packet(payload);

    // Corrupt bit 0 of the payload.
    const corrupted = flip_bit(valid_packet, 0);
    const result = try_correct_single_bit(corrupted, PAYLOAD_LEN);

    expect(result).not.toBeNull();
    expect(result!.bit_position).toBe(0);
    // Corrected payload bytes should match the original.
    expect(result!.corrected.slice(0, PAYLOAD_LEN)).toEqual(valid_packet.slice(0, PAYLOAD_LEN));
  });

  it('should correct a single-bit error at the last bit of the payload', () => {
    const payload = new Uint8Array(PAYLOAD_LEN);
    for (let i = 0; i < PAYLOAD_LEN; i++) payload[i] = i;
    const valid_packet = build_packet(payload);

    const last_bit = PAYLOAD_LEN * 8 - 1;
    const corrupted = flip_bit(valid_packet, last_bit);
    const result = try_correct_single_bit(corrupted, PAYLOAD_LEN);

    expect(result).not.toBeNull();
    expect(result!.bit_position).toBe(last_bit);
    expect(result!.corrected.slice(0, PAYLOAD_LEN)).toEqual(valid_packet.slice(0, PAYLOAD_LEN));
  });

  it('should correct a single-bit error at an arbitrary mid-payload position', () => {
    const payload = new Uint8Array(PAYLOAD_LEN);
    payload.fill(0xcc);
    const valid_packet = build_packet(payload);

    const target_bit = 42; // arbitrary
    const corrupted = flip_bit(valid_packet, target_bit);
    const result = try_correct_single_bit(corrupted, PAYLOAD_LEN);

    expect(result).not.toBeNull();
    expect(result!.bit_position).toBe(target_bit);
    expect(result!.corrected.slice(0, PAYLOAD_LEN)).toEqual(valid_packet.slice(0, PAYLOAD_LEN));
  });

  it('should return null for a two-bit error', () => {
    const payload = new Uint8Array(PAYLOAD_LEN);
    payload.fill(0x33);
    const valid_packet = build_packet(payload);

    // Flip two bits.
    let corrupted = flip_bit(valid_packet, 3);
    corrupted = flip_bit(corrupted, 17);
    const result = try_correct_single_bit(corrupted, PAYLOAD_LEN);

    expect(result).toBeNull();
  });

  it('should correct every single-bit position in the payload', () => {
    const payload = new Uint8Array(PAYLOAD_LEN);
    for (let i = 0; i < PAYLOAD_LEN; i++) payload[i] = (i * 7 + 13) & 0xff;
    const valid_packet = build_packet(payload);

    for (let bit = 0; bit < PAYLOAD_LEN * 8; bit++) {
      const corrupted = flip_bit(valid_packet, bit);
      const result = try_correct_single_bit(corrupted, PAYLOAD_LEN);

      expect(result).not.toBeNull();
      expect(result!.bit_position).toBe(bit);
      expect(result!.corrected.slice(0, PAYLOAD_LEN)).toEqual(valid_packet.slice(0, PAYLOAD_LEN));
    }
  });
});

// ---------------------------------------------------------------------------
// Single-bit correction — FC_MSG_GPS (8 bytes)
// ---------------------------------------------------------------------------

describe('try_correct_single_bit — FC_MSG_GPS (8 bytes)', () => {
  const PAYLOAD_LEN = FC_MSG_GPS_PAYLOAD_LEN;

  it('should correct single-bit errors at first, middle, and last positions', () => {
    const payload = new Uint8Array(PAYLOAD_LEN);
    for (let i = 0; i < PAYLOAD_LEN; i++) payload[i] = 0xa0 + i;
    const valid_packet = build_packet(payload);

    for (const bit of [0, 31, PAYLOAD_LEN * 8 - 1]) {
      const corrupted = flip_bit(valid_packet, bit);
      const result = try_correct_single_bit(corrupted, PAYLOAD_LEN);

      expect(result).not.toBeNull();
      expect(result!.bit_position).toBe(bit);
      expect(result!.corrected.slice(0, PAYLOAD_LEN)).toEqual(valid_packet.slice(0, PAYLOAD_LEN));
    }
  });

  it('should return null for two-bit corruption', () => {
    const payload = new Uint8Array(PAYLOAD_LEN);
    payload.fill(0xff);
    const valid_packet = build_packet(payload);

    let corrupted = flip_bit(valid_packet, 0);
    corrupted = flip_bit(corrupted, 1);
    const result = try_correct_single_bit(corrupted, PAYLOAD_LEN);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Single-bit correction — FC_MSG_EVENT (5 bytes)
// ---------------------------------------------------------------------------

describe('try_correct_single_bit — FC_MSG_EVENT (5 bytes)', () => {
  const PAYLOAD_LEN = FC_MSG_EVENT_PAYLOAD_LEN;

  it('should correct every single-bit position', () => {
    const payload = new Uint8Array(PAYLOAD_LEN);
    for (let i = 0; i < PAYLOAD_LEN; i++) payload[i] = (i * 37) & 0xff;
    const valid_packet = build_packet(payload);

    for (let bit = 0; bit < PAYLOAD_LEN * 8; bit++) {
      const corrupted = flip_bit(valid_packet, bit);
      const result = try_correct_single_bit(corrupted, PAYLOAD_LEN);

      expect(result).not.toBeNull();
      expect(result!.bit_position).toBe(bit);
      expect(result!.corrected.slice(0, PAYLOAD_LEN)).toEqual(valid_packet.slice(0, PAYLOAD_LEN));
    }
  });

  it('should return null for two-bit corruption', () => {
    const payload = new Uint8Array(PAYLOAD_LEN);
    payload.fill(0x12);
    const valid_packet = build_packet(payload);

    let corrupted = flip_bit(valid_packet, 5);
    corrupted = flip_bit(corrupted, 30);
    const result = try_correct_single_bit(corrupted, PAYLOAD_LEN);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('try_correct_single_bit — edge cases', () => {
  it('should return null for wrong packet length', () => {
    const packet = new Uint8Array(10); // Not 15+4 = 19
    const result = try_correct_single_bit(packet, 15);
    expect(result).toBeNull();
  });

  it('should handle all-zero payload', () => {
    const payload = new Uint8Array(8);
    const valid_packet = build_packet(payload);

    const corrupted = flip_bit(valid_packet, 0);
    const result = try_correct_single_bit(corrupted, 8);

    expect(result).not.toBeNull();
    expect(result!.bit_position).toBe(0);
    expect(result!.corrected.slice(0, 8)).toEqual(valid_packet.slice(0, 8));
  });

  it('should handle all-ones payload', () => {
    const payload = new Uint8Array(5);
    payload.fill(0xff);
    const valid_packet = build_packet(payload);

    const corrupted = flip_bit(valid_packet, 20);
    const result = try_correct_single_bit(corrupted, 5);

    expect(result).not.toBeNull();
    expect(result!.bit_position).toBe(20);
    expect(result!.corrected.slice(0, 5)).toEqual(valid_packet.slice(0, 5));
  });
});
