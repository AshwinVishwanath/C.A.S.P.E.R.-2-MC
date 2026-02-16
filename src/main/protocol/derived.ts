/**
 * Derived aerodynamic and attitude computations.
 *
 * Computes Mach number, dynamic pressure (qbar), and Euler angles
 * from quaternion attitude. Used in direct FC mode when the ground
 * station needs to compute these values locally (the GS relay mode
 * provides them pre-computed).
 *
 * @module protocol/derived
 */

// ---------------------------------------------------------------------------
// ISA atmosphere constants
// ---------------------------------------------------------------------------

/** Sea-level temperature in Kelvin. */
const ISA_T0_K = 288.15;

/** Temperature lapse rate in K/m (troposphere, h < 11000 m). */
const ISA_LAPSE_RATE = 0.0065;

/** Tropopause altitude in metres. */
const ISA_TROPOPAUSE_M = 11000;

/** Temperature at/above the tropopause in Kelvin. */
const ISA_T_TROPOPAUSE_K = 216.65;

/** Ratio of specific heats for air (gamma). */
const GAMMA = 1.4;

/** Specific gas constant for dry air in J/(kg*K). */
const R_AIR = 287.05;

/** Sea-level air density in kg/m^3. */
const RHO_0 = 1.225;

/** Scale height for exponential density approximation in metres. */
const SCALE_HEIGHT_M = 8500;

/** Conversion factor: radians to degrees. */
const RAD_TO_DEG = 180.0 / Math.PI;

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Compute Mach number from velocity and altitude.
 *
 * Uses ISA atmosphere model:
 *   T = 288.15 - 0.0065 * h  for h < 11000 m
 *   T = 216.65              for h >= 11000 m
 *   a = sqrt(gamma * R * T)
 *   Mach = |v| / a
 *
 * @param vel_mps - Velocity in m/s (may be negative for descending).
 * @param alt_m - Altitude AGL in metres.
 * @returns Mach number (always >= 0).
 */
export function compute_mach(vel_mps: number, alt_m: number): number {
  const t = isa_temperature(alt_m);
  const speed_of_sound = Math.sqrt(GAMMA * R_AIR * t);

  if (speed_of_sound <= 0) {
    return 0;
  }

  return Math.abs(vel_mps) / speed_of_sound;
}

/**
 * Compute dynamic pressure (qbar) from velocity and altitude.
 *
 * Uses exponential density model:
 *   rho = 1.225 * exp(-h / 8500)
 *   qbar = 0.5 * rho * v^2
 *
 * @param vel_mps - Velocity in m/s.
 * @param alt_m - Altitude AGL in metres.
 * @returns Dynamic pressure in Pascals (always >= 0).
 */
export function compute_qbar(vel_mps: number, alt_m: number): number {
  const rho = RHO_0 * Math.exp(-alt_m / SCALE_HEIGHT_M);
  return 0.5 * rho * vel_mps * vel_mps;
}

/**
 * Convert quaternion [w, x, y, z] to Euler angles [roll, pitch, yaw] in degrees.
 *
 * Uses aerospace convention (ZYX rotation order):
 *   roll  = atan2(2*(w*x + y*z), 1 - 2*(x^2 + y^2))
 *   pitch = asin(clamp(2*(w*y - z*x), -1, 1))
 *   yaw   = atan2(2*(w*z + x*y), 1 - 2*(y^2 + z^2))
 *
 * @param q - Quaternion as [w, x, y, z].
 * @returns Euler angles as [roll_deg, pitch_deg, yaw_deg].
 */
export function quat_to_euler_deg(
  q: [number, number, number, number]
): [number, number, number] {
  const [w, x, y, z] = q;

  // Roll (x-axis rotation)
  const sinr_cosp = 2.0 * (w * x + y * z);
  const cosr_cosp = 1.0 - 2.0 * (x * x + y * y);
  const roll = Math.atan2(sinr_cosp, cosr_cosp);

  // Pitch (y-axis rotation) — clamp to [-1, 1] to avoid NaN from asin
  const sinp = 2.0 * (w * y - z * x);
  const sinp_clamped = Math.max(-1.0, Math.min(1.0, sinp));
  const pitch = Math.asin(sinp_clamped);

  // Yaw (z-axis rotation)
  const siny_cosp = 2.0 * (w * z + x * y);
  const cosy_cosp = 1.0 - 2.0 * (y * y + z * z);
  const yaw = Math.atan2(siny_cosp, cosy_cosp);

  return [
    roll * RAD_TO_DEG,
    pitch * RAD_TO_DEG,
    yaw * RAD_TO_DEG
  ];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute ISA temperature at a given altitude.
 *
 * @param alt_m - Altitude in metres.
 * @returns Temperature in Kelvin.
 */
function isa_temperature(alt_m: number): number {
  const h = Math.max(0, alt_m);
  if (h < ISA_TROPOPAUSE_M) {
    return ISA_T0_K - ISA_LAPSE_RATE * h;
  }
  return ISA_T_TROPOPAUSE_K;
}
