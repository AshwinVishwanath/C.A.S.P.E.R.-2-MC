/**
 * Types for OpenRocket-driven flight simulation.
 *
 * A `SimProfile` is a time-sorted series of flight keyframes whose per-sample
 * shape is intentionally identical to the pyro logic editor's evaluator sample
 * ({@link SimKeyframe} === the `{ phase, t, alt, vel, mach, accel, tilt }` object
 * consumed by `evaluateGraph` in src/renderer/pyro/evaluator.js). This lets the
 * same parsed profile drive both the pyro logic designer's built-in simulation
 * and the live telemetry dashboard.
 *
 * @module sim/sim_types
 */

import { FsmState } from '../protocol/types';

/** Flight phase names — identical to FSM_STATE_NAMES, as the evaluator keys off them. */
export type SimPhase =
  | 'PAD'
  | 'BOOST'
  | 'COAST'
  | 'COAST_1'
  | 'SUSTAIN'
  | 'COAST_2'
  | 'APOGEE'
  | 'DROGUE'
  | 'MAIN'
  | 'RECOVERY'
  | 'TUMBLE'
  | 'LANDED';

/** A single flight keyframe — one interpolation point of a {@link SimProfile}. */
export interface SimKeyframe {
  /** Flight phase in effect at this time. */
  phase: SimPhase;
  /** Time since launch in seconds. */
  t: number;
  /** Altitude AGL in metres. */
  alt: number;
  /** Vertical velocity in m/s (positive = up). */
  vel: number;
  /** Mach number. */
  mach: number;
  /** Acceleration in m/s^2. */
  accel: number;
  /** Tilt from vertical in degrees. */
  tilt: number;
}

/** A parsed flight simulation, ready to replay. */
export interface SimProfile {
  /** Time-sorted keyframes. */
  samples: SimKeyframe[];
  /** Total flight duration in seconds (time of the last keyframe). */
  duration_s: number;
  /** Peak altitude in metres. */
  apogee_m: number;
}

/** One playback sample pushed from the renderer to the main process. */
export interface SimSamplePush {
  phase: SimPhase;
  t: number;
  alt: number;
  vel: number;
  mach: number;
  accel: number;
  tilt: number;
  /** Optional evaluator-fired pyro channels, ch1..ch4. */
  fired?: [boolean, boolean, boolean, boolean];
}

/** Map a flight phase to the corresponding FC flight-state enum. */
export const PHASE_TO_FSM: Record<SimPhase, FsmState> = {
  PAD: FsmState.Pad,
  BOOST: FsmState.Boost,
  COAST: FsmState.Coast,
  COAST_1: FsmState.Coast1,
  SUSTAIN: FsmState.Sustain,
  COAST_2: FsmState.Coast2,
  APOGEE: FsmState.Apogee,
  DROGUE: FsmState.Drogue,
  MAIN: FsmState.Main,
  RECOVERY: FsmState.Recovery,
  TUMBLE: FsmState.Tumble,
  LANDED: FsmState.Landed
};

/** Resolve a (possibly unknown) phase string to an FsmState, defaulting to Pad. */
export function phase_to_fsm(phase: string): FsmState {
  const key = (phase || '').toUpperCase() as SimPhase;
  return PHASE_TO_FSM[key] ?? FsmState.Pad;
}
