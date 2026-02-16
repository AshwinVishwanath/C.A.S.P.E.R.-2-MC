import { describe, it, expect } from 'vitest';
import { create_zoh_state, tick_zoh, reset_zoh } from '../stage4_zoh';

describe('create_zoh_state', () => {
  it('should initialize with stale = false', () => {
    const state = create_zoh_state();
    expect(state.stale).toBe(false);
  });

  it('should initialize stale_since_ms to 0', () => {
    const state = create_zoh_state();
    expect(state.stale_since_ms).toBe(0);
  });

  it('should initialize last_valid_ms to 0', () => {
    const state = create_zoh_state();
    expect(state.last_valid_ms).toBe(0);
  });
});

describe('tick_zoh', () => {
  it('should not become stale if no valid packet has ever been received', () => {
    const state = create_zoh_state();
    const updated = tick_zoh(state, 10000);
    expect(updated.stale).toBe(false);
    expect(updated.stale_since_ms).toBe(0);
  });

  it('should not become stale within the threshold', () => {
    let state = create_zoh_state();
    state = reset_zoh(state, 1000);

    const updated = tick_zoh(state, 1400); // 400ms elapsed, default threshold 500ms
    expect(updated.stale).toBe(false);
    expect(updated.stale_since_ms).toBe(0);
  });

  it('should become stale exactly at the threshold', () => {
    let state = create_zoh_state();
    state = reset_zoh(state, 1000);

    const updated = tick_zoh(state, 1500); // 500ms elapsed = threshold
    expect(updated.stale).toBe(true);
    expect(updated.stale_since_ms).toBe(1500);
  });

  it('should become stale after the threshold', () => {
    let state = create_zoh_state();
    state = reset_zoh(state, 1000);

    const updated = tick_zoh(state, 2000); // 1000ms elapsed > 500ms threshold
    expect(updated.stale).toBe(true);
    expect(updated.stale_since_ms).toBe(2000);
  });

  it('should respect a custom threshold', () => {
    let state = create_zoh_state();
    state = reset_zoh(state, 1000);

    // 300ms elapsed, custom threshold of 200ms.
    const updated = tick_zoh(state, 1300, 200);
    expect(updated.stale).toBe(true);
  });

  it('should not go stale with a custom threshold when within range', () => {
    let state = create_zoh_state();
    state = reset_zoh(state, 1000);

    // 150ms elapsed, custom threshold 200ms.
    const updated = tick_zoh(state, 1150, 200);
    expect(updated.stale).toBe(false);
  });

  it('should preserve stale_since_ms once stale (not update it)', () => {
    let state = create_zoh_state();
    state = reset_zoh(state, 1000);

    // First tick that crosses threshold.
    state = tick_zoh(state, 1600);
    expect(state.stale).toBe(true);
    expect(state.stale_since_ms).toBe(1600);

    // Second tick — stale_since_ms should NOT change.
    state = tick_zoh(state, 2000);
    expect(state.stale).toBe(true);
    expect(state.stale_since_ms).toBe(1600);
  });

  it('should track stale duration correctly', () => {
    let state = create_zoh_state();
    state = reset_zoh(state, 1000);

    state = tick_zoh(state, 1600); // First stale at 1600
    expect(state.stale).toBe(true);
    expect(state.stale_since_ms).toBe(1600);

    // Stale duration at tick 2000 = 2000 - 1600 = 400ms.
    state = tick_zoh(state, 2000);
    const stale_duration = 2000 - state.stale_since_ms;
    expect(stale_duration).toBe(400);
  });
});

describe('reset_zoh', () => {
  it('should clear the stale flag', () => {
    let state = create_zoh_state();
    state = reset_zoh(state, 1000);
    state = tick_zoh(state, 2000); // force stale
    expect(state.stale).toBe(true);

    state = reset_zoh(state, 2100);
    expect(state.stale).toBe(false);
  });

  it('should reset stale_since_ms to 0', () => {
    let state = create_zoh_state();
    state = reset_zoh(state, 1000);
    state = tick_zoh(state, 2000);
    expect(state.stale_since_ms).toBeGreaterThan(0);

    state = reset_zoh(state, 2100);
    expect(state.stale_since_ms).toBe(0);
  });

  it('should update last_valid_ms', () => {
    let state = create_zoh_state();
    state = reset_zoh(state, 5000);
    expect(state.last_valid_ms).toBe(5000);

    state = reset_zoh(state, 6000);
    expect(state.last_valid_ms).toBe(6000);
  });

  it('should allow the system to recover from stale after a new valid packet', () => {
    let state = create_zoh_state();
    state = reset_zoh(state, 1000);

    // Go stale.
    state = tick_zoh(state, 2000);
    expect(state.stale).toBe(true);

    // Receive a new valid packet.
    state = reset_zoh(state, 2100);
    expect(state.stale).toBe(false);

    // Tick shortly after — should still be fresh.
    state = tick_zoh(state, 2200);
    expect(state.stale).toBe(false);

    // Tick well after — goes stale again.
    state = tick_zoh(state, 2700);
    expect(state.stale).toBe(true);
  });
});
