/**
 * Smallest-three quaternion unpacking.
 *
 * Decodes the FC_ATT_QPACKED format (5 bytes = 40 bits) into a
 * full [w, x, y, z] unit quaternion.
 *
 * Encoding (PRD Section 4.3):
 *   Bits 39:38 = index of the dropped (largest) component (0=w, 1=x, 2=y, 3=z)
 *   Bits 37:36 = reserved
 *   Bits 35:24 = int12 component A (signed 12-bit)
 *   Bits 23:12 = int12 component B (signed 12-bit)
 *   Bits 11:0  = int12 component C (signed 12-bit)
 *
 * Each non-dropped component lies in the range [-1/sqrt(2), +1/sqrt(2)]
 * (since the dropped component is the largest). The 12-bit signed integer
 * maps this range: component = raw_int12 / QUAT_SCALE, where QUAT_SCALE
 * maps the maximum magnitude 1/sqrt(2) to the 12-bit signed max (2047).
 *
 * QUAT_SCALE = 2047 * sqrt(2) ~ 2895.27, so:
 *   encode: raw = round(component * QUAT_SCALE)
 *   decode: component = raw / QUAT_SCALE
 *
 * The dropped component is reconstructed as sqrt(1 - a^2 - b^2 - c^2),
 * always positive. Components A, B, C map to non-dropped indices in
 * ascending order.
 *
 * @module protocol/quaternion
 */

/**
 * Scale factor for smallest-three quaternion encoding.
 * Maps [-1/sqrt(2), 1/sqrt(2)] to the signed 12-bit range [-2047, 2047].
 */
const QUAT_SCALE = 2047.0 * Math.SQRT2; // ~2895.27

/**
 * Decode a smallest-three packed quaternion (5 bytes) to [w, x, y, z].
 *
 * @param bytes - 5-byte array containing the packed quaternion.
 * @returns Quaternion as [w, x, y, z], normalised to unit length.
 */
export function unpack_quaternion(bytes: Uint8Array): [number, number, number, number] {
  if (bytes.length < 5) {
    // Return identity quaternion for malformed input
    return [1, 0, 0, 0];
  }

  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];
  const b4 = bytes[4];

  // Bits 39:38 = dropped component index
  const drop_idx = (b0 >> 6) & 0x03;

  // Bits 37:36 = reserved (ignored)

  // Bits 35:24 = int12 component A
  const raw_a = ((b0 & 0x0F) << 8) | b1;

  // Bits 23:12 = int12 component B
  const raw_b = (b2 << 4) | ((b3 >> 4) & 0x0F);

  // Bits 11:0 = int12 component C
  const raw_c = ((b3 & 0x0F) << 8) | b4;

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
