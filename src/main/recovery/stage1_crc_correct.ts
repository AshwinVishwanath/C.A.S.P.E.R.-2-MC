/**
 * Stage 1 — Single-bit CRC-32 correction via syndrome lookup.
 *
 * When a packet fails CRC-32 validation, this module attempts to locate
 * and correct a single-bit error using a precomputed syndrome table.
 *
 * CRC-32 matches the standard CRC-32/ISO-HDLC:
 *   - Polynomial: 0x04C11DB7 (reflected: 0xEDB88320)
 *   - Initial value: 0xFFFFFFFF
 *   - Final XOR: 0xFFFFFFFF
 *   - Reflect input/output: YES
 *   - Process: byte-by-byte with lookup table
 */

/** CRC-32 reflected polynomial (standard CRC-32/ISO-HDLC). */
const POLY = 0xEDB88320;

/** CRC-32 initial value. */
const CRC_INIT = 0xFFFFFFFF;

/** CRC-32 final XOR value. */
const CRC_XOR_OUT = 0xFFFFFFFF;

/**
 * Precomputed 256-entry lookup table for reflected CRC-32.
 */
const CRC32_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let bit = 0; bit < 8; bit++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ POLY;
      } else {
        crc = crc >>> 1;
      }
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/**
 * Raw CRC-32 engine with configurable initial value and NO final XOR.
 *
 * Data is processed byte-by-byte using the reflected lookup table.
 * Returns the raw register value without applying the final XOR.
 *
 * @param data - Input bytes to compute CRC over.
 * @param init - Initial CRC register value.
 * @returns 32-bit unsigned raw CRC register value (no final XOR).
 */
function crc32_engine_raw(data: Uint8Array, init: number): number {
  let crc = init >>> 0;

  for (let i = 0; i < data.length; i++) {
    crc = CRC32_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }

  return crc >>> 0;
}

/**
 * Compute standard CRC-32 (CRC-32/ISO-HDLC).
 *
 * Uses init = 0xFFFFFFFF and final XOR = 0xFFFFFFFF.
 *
 * @param data - Input bytes to compute CRC over.
 * @returns 32-bit unsigned CRC value.
 */
export function crc32_compute(data: Uint8Array): number {
  return (crc32_engine_raw(data, CRC_INIT) ^ CRC_XOR_OUT) >>> 0;
}

/**
 * Compute raw CRC-32 with zero initial value (for syndrome generation).
 *
 * Used for syndrome generation: the syndrome of a single-bit error is
 * independent of the payload content. Mathematically, for the XOR-based
 * CRC computation:
 *
 *   syndrome = CRC(x ^ e) XOR CRC(x)
 *            = [raw(x^e, init) ^ F] XOR [raw(x, init) ^ F]
 *            = raw(x^e, init) XOR raw(x, init)
 *            = raw(e, 0)          (linearity of the XOR engine)
 *
 * where F = CRC_XOR_OUT (0xFFFFFFFF) and raw() is the engine without
 * final XOR. The final XOR cancels in the XOR of two CRCs, so syndrome
 * computation uses init=0 and NO final XOR.
 *
 * @param data - Input bytes (error pattern) to compute syndrome CRC over.
 * @returns 32-bit unsigned raw CRC value (init=0, no final XOR).
 */
function crc32_zero_init(data: Uint8Array): number {
  return crc32_engine_raw(data, 0x00000000);
}

/**
 * Precompute a syndrome table for a given payload length.
 *
 * For each possible single-bit error position in the payload (0 to
 * payload_length * 8 - 1), the function computes the CRC-32 of an
 * all-zero payload with only that bit flipped. The resulting CRC is
 * the syndrome for that single-bit error and is stored as a map entry.
 *
 * Bit numbering: bit 0 is the MSB of byte 0 (bit 7 within the byte),
 * bit 7 is the LSB of byte 0, bit 8 is the MSB of byte 1, etc.
 *
 * @param payload_length - Number of payload bytes (excluding the 4-byte CRC field).
 * @returns Map from syndrome value to bit position.
 */
export function generate_syndrome_table(payload_length: number): Map<number, number> {
  const table = new Map<number, number>();

  for (let bit_pos = 0; bit_pos < payload_length * 8; bit_pos++) {
    // Create an all-zero payload and flip exactly one bit.
    const test_payload = new Uint8Array(payload_length);
    const byte_idx = Math.floor(bit_pos / 8);
    const bit_in_byte = 7 - (bit_pos % 8); // MSB-first within each byte
    test_payload[byte_idx] = 1 << bit_in_byte;

    const syndrome = crc32_zero_init(test_payload);
    table.set(syndrome, bit_pos);
  }

  return table;
}

/** Cached syndrome tables keyed by payload length. */
const SYNDROME_CACHE = new Map<number, Map<number, number>>();

/**
 * Retrieve (or lazily generate) the syndrome table for a given payload length.
 *
 * @param payload_length - Number of payload bytes.
 * @returns Syndrome-to-bit-position map.
 */
function get_syndrome_table(payload_length: number): Map<number, number> {
  let table = SYNDROME_CACHE.get(payload_length);
  if (!table) {
    table = generate_syndrome_table(payload_length);
    SYNDROME_CACHE.set(payload_length, table);
  }
  return table;
}

/** Payload sizes for the three packet types. */
export const FC_MSG_FAST_PAYLOAD_LEN = 15;
export const FC_MSG_GPS_PAYLOAD_LEN = 8;
export const FC_MSG_EVENT_PAYLOAD_LEN = 5;

/**
 * Result of a successful single-bit correction.
 */
export interface CorrectionResult {
  /** Corrected packet (payload + valid CRC). */
  corrected: Uint8Array;
  /** Bit position that was flipped (0 = MSB of first payload byte). */
  bit_position: number;
}

/**
 * Attempt single-bit CRC correction on a packet.
 *
 * The packet is expected to be `payload_length + 4` bytes, where the last
 * 4 bytes are the received CRC-32 in big-endian byte order.
 *
 * Algorithm:
 * 1. Compute CRC-32 of the payload (first `payload_length` bytes).
 * 2. Extract the received CRC from the last 4 bytes.
 * 3. XOR computed CRC with received CRC to get the syndrome.
 * 4. If syndrome is zero, the packet is already valid (should not reach here).
 * 5. Look up syndrome in the precomputed table.
 * 6. If found, flip the corresponding bit in the payload, recompute CRC,
 *    and verify it matches the received CRC.
 * 7. If not found, multi-bit corruption is present and correction fails.
 *
 * @param packet - Full packet including trailing 4-byte CRC-32.
 * @param payload_length - Number of bytes before the CRC field.
 * @returns Corrected packet and bit position if single-bit fix found, null otherwise.
 */
export function try_correct_single_bit(
  packet: Uint8Array,
  payload_length: number
): CorrectionResult | null {
  if (packet.length !== payload_length + 4) {
    return null;
  }

  // Extract payload and received CRC.
  const payload = packet.slice(0, payload_length);
  const received_crc =
    ((packet[payload_length] << 24) |
      (packet[payload_length + 1] << 16) |
      (packet[payload_length + 2] << 8) |
      packet[payload_length + 3]) >>>
    0;

  // Compute CRC of the received payload.
  const computed_crc = crc32_compute(payload);

  // Syndrome = computed XOR received.
  const syndrome = (computed_crc ^ received_crc) >>> 0;

  if (syndrome === 0) {
    // No error — packet CRC already matches. Should not reach here in
    // normal flow, but return null to indicate no correction was needed.
    return null;
  }

  // Look up syndrome in the table for this payload length.
  const table = get_syndrome_table(payload_length);
  const bit_position = table.get(syndrome);

  if (bit_position === undefined) {
    // Multi-bit corruption — cannot correct.
    return null;
  }

  // Flip the identified bit in the payload.
  const corrected = packet.slice(); // deep copy
  const byte_idx = Math.floor(bit_position / 8);
  const bit_in_byte = 7 - (bit_position % 8);
  corrected[byte_idx] ^= 1 << bit_in_byte;

  // Verify: recompute CRC on the corrected payload.
  const verify_crc = crc32_compute(corrected.slice(0, payload_length));
  if (verify_crc !== received_crc) {
    // Should not happen if syndrome table is correct, but guard anyway.
    return null;
  }

  return { corrected, bit_position };
}
