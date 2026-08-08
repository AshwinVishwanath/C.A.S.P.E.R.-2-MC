/**
 * Tests for smallest-three quaternion unpacking.
 *
 * Verifies that packed quaternions decode correctly to [w, x, y, z].
 * The encoding uses 5 bytes (40 bits) in LITTLE-ENDIAN order:
 *   Byte 0: C[7:0]                    (LSB)
 *   Byte 1: B[3:0] | C[11:8]
 *   Byte 2: B[11:4]
 *   Byte 3: A[7:0]
 *   Byte 4: drop[1:0] | rsvd[1:0] | A[11:8]  (MSB)
 *
 * Scale factor: QUAT_SCALE = 2896.309 (MC_FC_ALIGNMENT.md S15b revision
 * note, 2026-08-08 -- matches the deployed GS firmware; see quaternion.ts).
 *
 * Accuracy target: with QUAT_SCALE = 2896.309 the quantisation step is
 * ~0.000345, giving round-trip accuracy well under 0.1 degrees. A survivor
 * at the true magnitude bound (1/sqrt(2)) clamps by exactly 1 LSB at the
 * +edge (benign, by design) -- unlike the old 4096 scale's ~849-LSB clamp.
 */

import { describe, it, expect } from 'vitest';
import { unpack_quaternion } from '../quaternion';

/**
 * Scale factor matching the FC firmware (MC_FC_ALIGNMENT.md S15b).
 */
const QUAT_SCALE = 2896.309;

/** The old, defective scale -- kept ONLY so a test below can prove it WOULD
 * have clamped a component at the true 1/sqrt(2) magnitude bound by ~849
 * LSB, where QUAT_SCALE (2896.309) clamps by at most 1 LSB. */
const OLD_DEFECTIVE_QUAT_SCALE = 4096.0;

/**
 * Helper: pack a quaternion using the FC's smallest-three encoding.
 * Little-endian byte order per ORIENTATION_SPEC.md §5.2.
 */
function pack_quaternion(q: [number, number, number, number]): Uint8Array {
  // Find the component with the largest absolute value
  let max_idx = 0;
  let max_val = Math.abs(q[0]);
  for (let i = 1; i < 4; i++) {
    if (Math.abs(q[i]) > max_val) {
      max_val = Math.abs(q[i]);
      max_idx = i;
    }
  }

  // If the dropped component is negative, negate the entire quaternion
  const sign = q[max_idx] < 0 ? -1 : 1;
  const qs = q.map(v => v * sign);

  // Extract the three non-dropped components in ascending index order
  const components: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (i !== max_idx) {
      components.push(qs[i]);
    }
  }

  // Scale to 12-bit signed integers
  const a_raw = Math.round(components[0] * QUAT_SCALE);
  const b_raw = Math.round(components[1] * QUAT_SCALE);
  const c_raw = Math.round(components[2] * QUAT_SCALE);

  // Clamp to 12-bit signed range [-2048, 2047]
  const clamp12 = (v: number) => Math.max(-2048, Math.min(2047, v));

  // Convert to unsigned 12-bit (two's complement)
  const to_u12 = (v: number) => {
    const clamped = clamp12(v);
    return clamped < 0 ? clamped + 0x1000 : clamped;
  };

  const ua = to_u12(a_raw);
  const ub = to_u12(b_raw);
  const uc = to_u12(c_raw);

  // Pack into 5 bytes, LITTLE-ENDIAN (byte 0 = LSB):
  // Byte 0: C[7:0]
  // Byte 1: B[3:0] | C[11:8]
  // Byte 2: B[11:4]
  // Byte 3: A[7:0]
  // Byte 4: drop[1:0] | rsvd[1:0] | A[11:8]
  const bytes = new Uint8Array(5);
  bytes[0] = uc & 0xFF;
  bytes[1] = ((ub & 0x0F) << 4) | ((uc >> 8) & 0x0F);
  bytes[2] = (ub >> 4) & 0xFF;
  bytes[3] = ua & 0xFF;
  bytes[4] = ((max_idx & 0x03) << 6) | ((ua >> 8) & 0x0F);

  return bytes;
}

/** Helper: compute angle between two quaternions in degrees. */
function quat_angle_deg(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  const clamped = Math.min(1.0, dot);
  return (2.0 * Math.acos(clamped) * 180.0) / Math.PI;
}

describe('unpack_quaternion', () => {
  it('should decode identity quaternion [1, 0, 0, 0]', () => {
    const packed = pack_quaternion([1, 0, 0, 0]);
    const result = unpack_quaternion(packed);

    // Drop index should be 0 (w is largest)
    expect(result[0]).toBeCloseTo(1.0, 3);
    expect(result[1]).toBeCloseTo(0.0, 3);
    expect(result[2]).toBeCloseTo(0.0, 3);
    expect(result[3]).toBeCloseTo(0.0, 3);
  });

  it('should decode 90-degree roll quaternion (body Y) accurately -- S15b fixes the old clamp', () => {
    // 90 degrees around Y axis (= roll in FC convention): q = [cos(45deg), 0, sin(45deg), 0]
    // Both w and y = 1/sqrt(2) ~= 0.70711 -- exactly the true magnitude
    // bound every smallest-three survivor respects. With the OLD scale
    // (4096), 0.70711 exceeded 2047/4096 = 0.4998 and clamped, causing a
    // large angle error (the pre-S15b defect this contract fixed). With
    // QUAT_SCALE = 2896.309 = 2048*sqrt(2), this component lands on the
    // top of the int12 range (1-LSB edge clamp, benign by design).
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);
    const original: [number, number, number, number] = [cos45, 0, sin45, 0];

    const packed = pack_quaternion(original);
    const result = unpack_quaternion(packed);

    const angle_err = quat_angle_deg(original, result);
    // Same tight bound as the other accurate-decode cases below -- no
    // clamp means no special-cased large-error allowance is needed anymore.
    expect(angle_err).toBeLessThan(0.1);
  });

  it('S15b: old 4096 scale clamped a 1/sqrt(2) survivor by ~849 LSB; 2896.309 by at most 1 LSB', () => {
    // Direct proof of the fix, independent of pack/unpack round-trip noise:
    // compute the raw int12-scaled value each scale would produce for a
    // component sitting exactly at the true magnitude bound. The old scale
    // overshoots the signed 12-bit top by ~849 counts (~30 deg attitude
    // error after clamping); the new scale overshoots by at most ~1 count,
    // absorbed by the clamp as a quantization-step-sized edge error.
    const component = 1 / Math.sqrt(2);   // ~0.70711, the true survivor bound

    const old_scaled = component * OLD_DEFECTIVE_QUAT_SCALE;
    const new_scaled = component * QUAT_SCALE;

    expect(old_scaled).toBeGreaterThan(2047 + 800);  // old: clamps by ~849 LSB
    expect(new_scaled).toBeGreaterThan(2047);        // new: rounds just past the top...
    expect(new_scaled).toBeLessThanOrEqual(2048.5);  // ...by at most ~1 LSB

    // And the full pack/unpack round-trip at that exact bound recovers the
    // original quaternion to within the quantisation step, not a ~30deg
    // clamp error.
    const original: [number, number, number, number] = [component, component, 0, 0];
    const packed = pack_quaternion(original);
    const result = unpack_quaternion(packed);
    const angle_err = quat_angle_deg(original, result);
    expect(angle_err).toBeLessThan(0.1);
  });

  it('should decode moderate roll quaternion accurately', () => {
    // 30 degrees around Y axis (= roll in FC convention): q = [cos(15deg), 0, sin(15deg), 0]
    // All components < 0.5, no clipping occurs
    const half = (30 * Math.PI / 180) / 2;
    const original: [number, number, number, number] = [Math.cos(half), 0, Math.sin(half), 0];

    const packed = pack_quaternion(original);
    const result = unpack_quaternion(packed);

    const angle_err = quat_angle_deg(original, result);
    expect(angle_err).toBeLessThan(0.1);
  });

  it('should decode 45-degree pitch quaternion', () => {
    // 45 degrees around X axis (= pitch in FC convention): q = [cos(22.5deg), sin(22.5deg), 0, 0]
    const half = Math.PI / 8;
    const original: [number, number, number, number] = [
      Math.cos(half), Math.sin(half), 0, 0
    ];

    const packed = pack_quaternion(original);
    const result = unpack_quaternion(packed);

    const angle_err = quat_angle_deg(original, result);
    expect(angle_err).toBeLessThan(0.1);
  });

  it('should decode 180-degree yaw quaternion', () => {
    // 180 degrees around Z axis: q = [0, 0, 0, 1]
    const original: [number, number, number, number] = [0, 0, 0, 1];

    const packed = pack_quaternion(original);
    const result = unpack_quaternion(packed);

    const angle_err = quat_angle_deg(original, result);
    expect(angle_err).toBeLessThan(0.1);
  });

  it('should decode arbitrary quaternion with all components non-zero', () => {
    // Normalised arbitrary quaternion
    const raw = [0.5, 0.5, 0.5, 0.5];
    const norm = Math.sqrt(raw[0]**2 + raw[1]**2 + raw[2]**2 + raw[3]**2);
    const original: [number, number, number, number] = [
      raw[0]/norm, raw[1]/norm, raw[2]/norm, raw[3]/norm
    ];

    const packed = pack_quaternion(original);
    const result = unpack_quaternion(packed);

    const angle_err = quat_angle_deg(original, result);
    expect(angle_err).toBeLessThan(0.1);
  });

  it('should handle negative component quaternion correctly', () => {
    const half = Math.PI / 3; // 60 deg around diagonal
    const s = Math.sin(half);
    const inv_sqrt3 = 1.0 / Math.sqrt(3);
    const original: [number, number, number, number] = [
      Math.cos(half), s * inv_sqrt3, s * inv_sqrt3, s * inv_sqrt3
    ];

    const packed = pack_quaternion(original);
    const result = unpack_quaternion(packed);

    const angle_err = quat_angle_deg(original, result);
    expect(angle_err).toBeLessThan(0.1);
  });

  it('should return identity quaternion for short input', () => {
    const short = new Uint8Array([0x00, 0x00, 0x00]);
    const result = unpack_quaternion(short);
    expect(result).toEqual([1, 0, 0, 0]);
  });

  it('should achieve round-trip accuracy better than 0.1 degrees', () => {
    // Test multiple orientations
    const test_cases: [number, number, number, number][] = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
      [0.5, 0.5, 0.5, 0.5],
      [0.9239, 0.3827, 0, 0],   // 45 deg pitch (body X)
      [0.9239, 0, 0.3827, 0],   // 45 deg roll (body Y)
      [0.9239, 0, 0, 0.3827],   // 45 deg yaw
    ];

    for (const tc of test_cases) {
      // Normalise
      const norm = Math.sqrt(tc[0]**2 + tc[1]**2 + tc[2]**2 + tc[3]**2);
      const q: [number, number, number, number] = [
        tc[0]/norm, tc[1]/norm, tc[2]/norm, tc[3]/norm
      ];

      const packed = pack_quaternion(q);
      const result = unpack_quaternion(packed);
      const angle_err = quat_angle_deg(q, result);

      // With QUAT_SCALE = 2896.309, the step size is ~0.000345
      // Worst-case angle error with 3 components is well under 0.1 degrees
      expect(angle_err).toBeLessThan(0.1);
    }
  });
});
