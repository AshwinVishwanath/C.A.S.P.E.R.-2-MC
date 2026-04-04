/**
 * Smallest-three quaternion unpacking.
 *
 * Decodes the FC_ATT_QPACKED format (5 bytes = 40 bits) into a
 * full [w, x, y, z] unit quaternion.
 *
 * Byte layout is LITTLE-ENDIAN (byte 0 = LSB, byte 4 = MSB):
 *   Byte 0:  C[7:0]
 *   Byte 1:  B[3:0] | C[11:8]
 *   Byte 2:  B[11:4]
 *   Byte 3:  A[7:0]
 *   Byte 4:  drop[1:0] | rsvd[1:0] | A[11:8]
 *
 * Each non-dropped component is a signed 12-bit integer scaled by
 * QUAT_SCALE = 4096.0 (component = raw_int12 / 4096).
 *
 * The dropped component is the one with the largest absolute value.
 * It is reconstructed as sqrt(1 - a^2 - b^2 - c^2), always positive
 * (the encoder negates the entire quaternion if needed so the dropped
 * component is positive).
 *
 * See ORIENTATION_SPEC.md §5 for the authoritative encoding reference.
 *
 * @module protocol/quaternion
 */

/**
 * Scale factor for smallest-three quaternion encoding.
 * Per ORIENTATION_SPEC.md §5.1: component = raw_int12 / 4096.0.
 */
const QUAT_SCALE = 4096.0;

/**
 * Decode a smallest-three packed quaternion (5 bytes, little-endian) to [w, x, y, z].
 *
 * @param bytes - 5-byte array containing the packed quaternion (LSB first).
 * @returns Quaternion as [w, x, y, z], normalised to unit length.
 */
export function unpack_quaternion(bytes: Uint8Array): [number, number, number, number] {
  if (bytes.length < 5) {
    // Return identity quaternion for malformed input
    return [1, 0, 0, 0];
  }

  const b0 = bytes[0]; // LSB: C[7:0]
  const b1 = bytes[1]; // B[3:0] | C[11:8]
  const b2 = bytes[2]; // B[11:4]
  const b3 = bytes[3]; // A[7:0]
  const b4 = bytes[4]; // MSB: drop[1:0] | rsvd[1:0] | A[11:8]

  // Extract 12-bit unsigned fields (little-endian layout)
  const raw_c = b0 | ((b1 & 0x0F) << 8);
  const raw_b = ((b1 >> 4) & 0x0F) | (b2 << 4);
  const raw_a = b3 | ((b4 & 0x0F) << 8);
  const drop_idx = (b4 >> 6) & 0x03;

  // Convert from unsigned 12-bit to signed (two's complement), then scale
  const a = sign_extend_12(raw_a) / QUAT_SCALE;
  const b = sign_extend_12(raw_b) / QUAT_SCALE;
  const c = sign_extend_12(raw_c) / QUAT_SCALE;

  // Reconstruct the dropped component (always positive)
  const sum_sq = a * a + b * b + c * c;
  const dropped = sum_sq < 1.0 ? Math.sqrt(1.0 - sum_sq) : 0.0;

  // Map A, B, C to the non-dropped indices in ascending order
  const q: [number, number, number, number] = [0, 0, 0, 0];
  q[drop_idx] = dropped;

  let comp_idx = 0;
  const components = [a, b, c];
  for (let i = 0; i < 4; i++) {
    if (i !== drop_idx) {
      q[i] = components[comp_idx];
      comp_idx++;
    }
  }

  return q;
}

/**
 * Sign-extend a 12-bit unsigned value to a signed integer.
 *
 * @param val - Unsigned 12-bit value (0..4095).
 * @returns Signed integer (-2048..2047).
 */
function sign_extend_12(val: number): number {
  if (val & 0x800) {
    return val - 0x1000;
  }
  return val;
}
