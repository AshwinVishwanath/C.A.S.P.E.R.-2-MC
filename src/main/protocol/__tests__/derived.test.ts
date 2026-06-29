/**
 * Tests for derived aerodynamic and attitude computations.
 *
 * Tests Mach number, dynamic pressure (qbar), and Euler angle conversions
 * against known reference values.
 */

import { describe, it, expect } from 'vitest';
import { compute_mach, compute_qbar, quat_to_euler_deg } from '../derived';

describe('compute_mach', () => {
  it('should compute Mach ~1.0 at 340 m/s at sea level', () => {
    // Speed of sound at sea level (ISA): sqrt(1.4 * 287.05 * 288.15) ~= 340.3 m/s
    const mach = compute_mach(340.3, 0);
    expect(mach).toBeCloseTo(1.0, 1);
  });

  it('should compute correct Mach at 10 km altitude', () => {
    // At 10 km: T = 288.15 - 0.0065 * 10000 = 223.15 K
    // Speed of sound: sqrt(1.4 * 287.05 * 223.15) ~= 299.5 m/s
    const expected_sos = Math.sqrt(1.4 * 287.05 * 223.15);
    const vel = 300; // m/s
    const mach = compute_mach(vel, 10000);
    expect(mach).toBeCloseTo(vel / expected_sos, 2);
  });

  it('should use tropopause temperature above 11 km', () => {
    // At 12 km: T = 216.65 K (above tropopause)
    const expected_sos = Math.sqrt(1.4 * 287.05 * 216.65);
    const mach = compute_mach(expected_sos, 12000);
    expect(mach).toBeCloseTo(1.0, 2);
  });

  it('should return 0 for zero velocity', () => {
    expect(compute_mach(0, 0)).toBe(0);
    expect(compute_mach(0, 5000)).toBe(0);
  });

  it('should use absolute velocity (handle negative)', () => {
    const mach_pos = compute_mach(340, 0);
    const mach_neg = compute_mach(-340, 0);
    expect(mach_neg).toBeCloseTo(mach_pos, 5);
    expect(mach_neg).toBeGreaterThan(0);
  });

  it('should handle negative altitude as sea level', () => {
    // Negative altitude should be clamped to 0
    const mach_neg = compute_mach(340, -100);
    const mach_zero = compute_mach(340, 0);
    expect(mach_neg).toBeCloseTo(mach_zero, 5);
  });

  it('should compute subsonic Mach correctly', () => {
    const mach = compute_mach(170, 0);
    expect(mach).toBeCloseTo(0.5, 1);
  });

  it('should compute supersonic Mach correctly', () => {
    const mach = compute_mach(680, 0);
    expect(mach).toBeCloseTo(2.0, 1);
  });
});

describe('compute_qbar', () => {
  it('should compute correct qbar at sea level', () => {
    // rho = 1.225 * exp(0) = 1.225
    // qbar = 0.5 * 1.225 * 100^2 = 6125 Pa
    const qbar = compute_qbar(100, 0);
    expect(qbar).toBeCloseTo(6125, 0);
  });

  it('should compute lower qbar at altitude', () => {
    const qbar_sea = compute_qbar(100, 0);
    const qbar_high = compute_qbar(100, 5000);
    expect(qbar_high).toBeLessThan(qbar_sea);
  });

  it('should return 0 for zero velocity', () => {
    expect(compute_qbar(0, 0)).toBe(0);
    expect(compute_qbar(0, 10000)).toBe(0);
  });

  it('should scale with velocity squared', () => {
    const qbar_100 = compute_qbar(100, 0);
    const qbar_200 = compute_qbar(200, 0);
    expect(qbar_200 / qbar_100).toBeCloseTo(4.0, 2);
  });

  it('should give same result for positive and negative velocity', () => {
    const qbar_pos = compute_qbar(100, 0);
    const qbar_neg = compute_qbar(-100, 0);
    expect(qbar_neg).toBeCloseTo(qbar_pos, 5);
  });

  it('should compute reasonable value at 10km, 300 m/s', () => {
    // rho ~= 1.225 * exp(-10000/8500) ~= 1.225 * 0.3085 ~= 0.378
    // qbar ~= 0.5 * 0.378 * 90000 ~= 17010 Pa
    const qbar = compute_qbar(300, 10000);
    expect(qbar).toBeGreaterThan(10000);
    expect(qbar).toBeLessThan(25000);
  });
});

describe('quat_to_euler_deg', () => {
  const TOLERANCE = 0.1; // degrees
  // FC casper_quat_to_euler convention (body Y = nose/thrust axis):
  //   roll  = asin(2*(w*y - z*x))     — rotation about body Y (nose/antenna)
  //   pitch = atan2(2*(w*x + y*z), …) — rotation about body X (lateral tilt)
  //   yaw   = atan2(2*(w*z + x*y), …) — rotation about body Z (heading)

  it('should return [0, 0, 0] for identity quaternion', () => {
    const [roll, pitch, yaw] = quat_to_euler_deg([1, 0, 0, 0]);
    expect(roll).toBeCloseTo(0, 1);
    expect(pitch).toBeCloseTo(0, 1);
    expect(yaw).toBeCloseTo(0, 1);
  });

  it('should decode 90-degree roll (rotation about body Y) correctly', () => {
    // Roll is the body-Y rotation → q = [cos(45deg), 0, sin(45deg), 0]
    const c = Math.cos(Math.PI / 4);
    const s = Math.sin(Math.PI / 4);
    const [roll, pitch, yaw] = quat_to_euler_deg([c, 0, s, 0]);
    expect(roll).toBeCloseTo(90.0, 0);
    expect(Math.abs(pitch)).toBeLessThan(TOLERANCE);
    expect(Math.abs(yaw)).toBeLessThan(TOLERANCE);
  });

  it('should decode 90-degree pitch (rotation about body X) correctly', () => {
    // Pitch is the body-X rotation → q = [cos(45deg), sin(45deg), 0, 0]
    const c = Math.cos(Math.PI / 4);
    const s = Math.sin(Math.PI / 4);
    const [roll, pitch, yaw] = quat_to_euler_deg([c, s, 0, 0]);
    expect(Math.abs(roll)).toBeLessThan(TOLERANCE);
    expect(pitch).toBeCloseTo(90.0, 0);
    expect(Math.abs(yaw)).toBeLessThan(TOLERANCE);
  });

  it('should decode 90-degree yaw (rotation about body Z) correctly', () => {
    const c = Math.cos(Math.PI / 4);
    const s = Math.sin(Math.PI / 4);
    const [roll, pitch, yaw] = quat_to_euler_deg([c, 0, 0, s]);
    expect(Math.abs(roll)).toBeLessThan(TOLERANCE);
    expect(Math.abs(pitch)).toBeLessThan(TOLERANCE);
    expect(yaw).toBeCloseTo(90.0, 0);
  });

  it('should decode 45-degree roll (about body Y) correctly', () => {
    const half = Math.PI / 8; // half of 45 degrees
    const [roll, pitch, yaw] = quat_to_euler_deg([
      Math.cos(half), 0, Math.sin(half), 0
    ]);
    expect(roll).toBeCloseTo(45.0, 0);
    expect(Math.abs(pitch)).toBeLessThan(TOLERANCE);
    expect(Math.abs(yaw)).toBeLessThan(TOLERANCE);
  });

  it('should handle 180-degree yaw', () => {
    // q = [0, 0, 0, 1] represents 180 deg yaw
    const [roll, pitch, yaw] = quat_to_euler_deg([0, 0, 0, 1]);
    expect(Math.abs(yaw)).toBeCloseTo(180.0, 0);
  });

  it('should handle negative roll (about body Y)', () => {
    const c = Math.cos(Math.PI / 4);
    const s = Math.sin(Math.PI / 4);
    const [roll] = quat_to_euler_deg([c, 0, -s, 0]);
    expect(roll).toBeCloseTo(-90.0, 0);
  });

  it('should handle gimbal lock region (roll near 90)', () => {
    // Roll is the asin term → singular near ±90. Rotate 89° about body Y.
    const half = (89 * Math.PI / 180) / 2;
    const [roll] = quat_to_euler_deg([
      Math.cos(half), 0, Math.sin(half), 0
    ]);
    expect(roll).toBeCloseTo(89.0, 0);
  });
});
