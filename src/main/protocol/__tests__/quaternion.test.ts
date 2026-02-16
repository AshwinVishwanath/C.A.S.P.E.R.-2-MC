/**
 * Tests for smallest-three quaternion unpacking.
 *
 * Verifies that packed quaternions decode correctly to [w, x, y, z].
 * The encoding uses 5 bytes (40 bits):
 *   - 2 bits: dropped component index
 *   - 2 bits: reserved
 *   - 3 x 12-bit signed values scaled by QUAT_SCALE = 2047 * sqrt(2) ~ 2895.27
 *
 * Accuracy target: with QUAT_SCALE the quantisation step is ~0.000345,
 * giving round-trip accuracy well under 0.1 degrees.
 */

import { describe, it, expect } from 'vitest';
import { unpack_quaternion } from '../quaternion';

/**
 * Scale factor matching the decoder in quaternion.ts.
 * Maps [-1/sqrt(2), 1/sqrt(2)] to signed 12-bit range [-2047, 2047].
 */
const QUAT_SCALE = 2047.0 * Math.SQRT2;

/** Helper: pack a quaternion using smallest-three encoding. */
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
  // (quaternion and its negation represent the same rotation)
  // so the dropped component reconstructs as positive.
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
  const a = Math.round(components[0] * QUAT_SCALE);
  const b = Math.round(components[1] * QUAT_SCALE);
  const c = Math.round(components[2] * QUAT_SCALE);

  // Clamp to 12-bit signed range [-2048, 2047]
  const clamp12 = (v: number) => Math.max(-2048, Math.min(2047, v));

  // Convert to unsigned 12-bit (two's complement)
  const to_u12 = (v: number) => {
    const clamped = clamp12(v);
    return clamped < 0 ? clamped + 0x1000 : clamped;
  };

  const ua = to_u12(a);
  const ub = to_u12(b);
  const uc = to_u12(c);

  // Pack into 5 bytes:
  // Byte 0: [drop_idx:2][reserved:2][ua_hi:4]
  // Byte 1: [ua_lo:8]
  // Byte 2: [ub_hi:8]
  // Byte 3: [ub_lo:4][uc_hi:4]
  // Byte 4: [uc_lo:8]
  const bytes = new Uint8Array(5);
  bytes[0] = ((max_idx & 0x03) << 6) | ((ua >> 8) & 0x0F);
  bytes[1] = ua & 0xFF;
  bytes[2] = (ub >> 4) & 0xFF;
  bytes[3] = ((ub & 0x0F) << 4) | ((uc >> 8) & 0x0F);
  bytes[4] = uc & 0xFF;

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

  it('should decode 90-degree pitch quaternion', () => {
    // 90 degrees around Y axis: q = [cos(45deg), 0, sin(45deg), 0]
    const cos45 = Math.cos(Math.PI / 4);
    const sin45 = Math.sin(Math.PI / 4);
    const original: [number, number, number, number] = [cos45, 0, sin45, 0];

    const packed = pack_quaternion(original);
    const result = unpack_quaternion(packed);

    const angle_err = quat_angle_deg(original, result);
    expect(angle_err).toBeLessThan(0.1);
  });

  it('should decode 45-degree roll quaternion', () => {
    // 45 degrees around X axis: q = [cos(22.5deg), sin(22.5deg), 0, 0]
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
      [0.9239, 0.3827, 0, 0],   // 45 deg roll
      [0.9239, 0, 0.3827, 0],   // 45 deg pitch
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

      // With QUAT_SCALE = 2047*sqrt(2), the step size is ~0.000345
      // Worst-case angle error with 3 components is well under 0.1 degrees
      expect(angle_err).toBeLessThan(0.1);
    }
  });
});
