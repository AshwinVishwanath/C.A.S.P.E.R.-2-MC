/**
 * Stage 4 — Zero-order hold (ZOH).
 *
 * When no valid telemetry arrives and interpolation is unavailable,
 * the dashboard repeats the last known-good values. This module
 * tracks staleness so the UI can indicate data age.
 */

/**
 * State for the zero-order hold mechanism.
 */
export interface ZohState {
  /** True when no valid data has arrived within the staleness threshold. */
  stale: boolean;
  /** Timestamp (ms) when the data first became stale, or 0 if not stale. */
  stale_since_ms: number;
  /** Timestamp (ms) of the last valid packet received. */
  last_valid_ms: number;
}

/** Default staleness threshold in milliseconds. */
const DEFAULT_THRESHOLD_MS = 500;

/**
 * Create a fresh ZOH state.
 *
 * Initializes with stale = false, all timestamps at zero.
 *
 * @returns A new ZohState with default values.
 */
export function create_zoh_state(): ZohState {
  return {
    stale: false,
    stale_since_ms: 0,
    last_valid_ms: 0,
  };
}

/**
 * Periodic tick for the ZOH state machine.
 *
 * Called on each display update cycle. Compares the current time against
 * the last valid packet timestamp. If the gap exceeds the threshold,
 * the state transitions to stale and records when staleness began.
 *
 * @param state - Current ZOH state.
 * @param now_ms - Current timestamp in milliseconds.
 * @param threshold_ms - Staleness threshold (default 500 ms).
 * @returns Updated ZOH state with stale flag set appropriately.
 */
export function tick_zoh(
  state: ZohState,
  now_ms: number,
  threshold_ms: number = DEFAULT_THRESHOLD_MS
): ZohState {
  // If we have never received a valid packet, do not mark stale
  // (there is nothing to "hold").
  if (state.last_valid_ms === 0) {
    return { ...state };
  }

  const elapsed = now_ms - state.last_valid_ms;

  if (elapsed >= threshold_ms) {
    // Transition to stale (or stay stale).
    return {
      ...state,
      stale: true,
      stale_since_ms: state.stale ? state.stale_since_ms : now_ms,
    };
  }

  // Still within threshold — not stale.
  return {
    ...state,
    stale: false,
    stale_since_ms: 0,
  };
}

/**
 * Reset ZOH state upon receiving a valid packet.
 *
 * Clears the stale flag and updates the last-valid timestamp.
 *
 * @param state - Current ZOH state.
 * @param now_ms - Timestamp of the received valid packet.
 * @returns Updated ZOH state with stale cleared.
 */
export function reset_zoh(state: ZohState, now_ms: number): ZohState {
  return {
    ...state,
    stale: false,
    stale_since_ms: 0,
    last_valid_ms: now_ms,
  };
}
