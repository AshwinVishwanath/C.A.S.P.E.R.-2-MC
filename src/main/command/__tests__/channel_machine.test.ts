/**
 * ChannelMachine tests.
 *
 * What these are really protecting: the ground station must never be left on a
 * channel the flight computer is not on. The FC recovers by itself (its revert
 * deadline), so every bug that matters here is a bug where MC moves the GS and
 * then fails to move it back -- the vehicle recovers and is still unreachable.
 *
 * Timers are injected rather than faked globally, so each test drives the clock
 * explicitly and there is nothing timing-dependent about the suite itself.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChannelMachine, STAGE_TIMEOUT_MS, GS_SETTLE_MS, COMMIT_TIMEOUT_MS } from '../channel_machine';
import type { ChannelState } from '../channel_machine';
import {
  MSG_ID_ACK_CHANNEL,
  MSG_ID_CMD_CHANNEL,
  MSG_ID_GS_CMD_CHANNEL,
  CH_ACT_SET,
  CH_ACT_COMMIT,
  CH_ST_STAGED,
  CH_ST_COMMITTED,
  CH_ST_UNCHANGED,
  RADIO_CHANNEL_COUNT
} from '../../protocol/constants';
import type { AckChannel } from '../../protocol/types';

/** A hand-driven timer queue: nothing fires until the test says so. */
class Clock {
  private pending: Array<{ id: number; fn: () => void; ms: number }> = [];
  private next_id = 1;

  set = (fn: () => void, ms: number): number => {
    const id = this.next_id++;
    this.pending.push({ id, fn, ms });
    return id;
  };

  clear = (id: number): void => {
    this.pending = this.pending.filter((t) => t.id !== id);
  };

  /** Fire the single armed timer. The machine only ever arms one at a time. */
  fire(): void {
    const t = this.pending.shift();
    if (!t) throw new Error('no timer armed');
    t.fn();
  }

  get armed(): number {
    return this.pending.length;
  }

  get armed_ms(): number | null {
    return this.pending.length ? this.pending[0].ms : null;
  }
}

function ack(over: Partial<AckChannel>): AckChannel {
  return {
    msg_id: MSG_ID_ACK_CHANNEL,
    nonce: 0,
    act: CH_ACT_SET,
    channel: 7,
    status: CH_ST_STAGED,
    freq_hz: 866_500_000,
    channel_count: RADIO_CHANNEL_COUNT,
    crc_ok: true,
    ...over
  };
}

describe('ChannelMachine', () => {
  let clock: Clock;
  let to_fc: Uint8Array[];
  let to_gs: Uint8Array[];
  let states: ChannelState[];
  let m: ChannelMachine;

  beforeEach(() => {
    clock = new Clock();
    to_fc = [];
    to_gs = [];
    states = [];
    m = new ChannelMachine({
      send_fc: (b) => to_fc.push(b),
      send_gs: (b) => to_gs.push(b),
      emit: (s) => states.push(s),
      set_timer: clock.set,
      clear_timer: clock.clear
    });
  });

  /** Pull the nonce out of the CMD_CHANNEL the machine just sent. */
  const sent_nonce = (): number => to_fc[0][3] | (to_fc[0][4] << 8);

  it('sends CMD_CHANNEL(SET) and waits, without touching the ground station', () => {
    m.start(7, 10);

    expect(to_fc).toHaveLength(1);
    expect(to_fc[0][0]).toBe(MSG_ID_CMD_CHANNEL);
    expect(to_fc[0][5]).toBe(CH_ACT_SET);
    expect(to_fc[0][6]).toBe(7);
    // Critical: the GS must NOT move until the FC says it staged the change.
    expect(to_gs).toHaveLength(0);
    expect(m.get_state().phase).toBe('staging');
  });

  it('drives SET -> GS retune -> COMMIT -> committed', () => {
    m.start(7, 10);
    const n = sent_nonce();

    m.on_ack(ack({ nonce: n, status: CH_ST_STAGED, channel: 7 }));
    expect(m.get_state().phase).toBe('retuning_ground_station');
    expect(to_gs).toHaveLength(1);
    expect(to_gs[0][0]).toBe(MSG_ID_GS_CMD_CHANNEL);
    expect(to_gs[0][3]).toBe(7);
    // COMMIT must not be sent until the GS has had time to settle.
    expect(to_fc).toHaveLength(1);
    expect(clock.armed_ms).toBe(GS_SETTLE_MS);

    clock.fire();
    expect(to_fc).toHaveLength(2);
    expect(to_fc[1][5]).toBe(CH_ACT_COMMIT);
    expect(m.get_state().phase).toBe('committing');

    m.on_ack(ack({ nonce: n, status: CH_ST_COMMITTED, channel: 7, freq_hz: 866_500_000 }));
    const s = m.get_state();
    expect(s.phase).toBe('committed');
    expect(s.target).toBe(7);
    expect(s.freq_hz).toBe(866_500_000);
    expect(clock.armed).toBe(0);
  });

  it('does NOT report success on the STAGED ack alone', () => {
    m.start(7, 10);
    m.on_ack(ack({ nonce: sent_nonce(), status: CH_ST_STAGED }));
    // Staged means the FC retuned, not that anything reached it there.
    expect(m.get_state().phase).not.toBe('committed');
  });

  it('puts the ground station back when COMMIT is never answered', () => {
    m.start(7, 10);
    const n = sent_nonce();
    m.on_ack(ack({ nonce: n, status: CH_ST_STAGED, channel: 7 }));
    clock.fire(); // GS settle -> sends COMMIT

    expect(clock.armed_ms).toBe(COMMIT_TIMEOUT_MS);
    clock.fire(); // commit timeout

    const s = m.get_state();
    expect(s.phase).toBe('failed');
    expect(s.error).toMatch(/returning to the previous/i);
    // THE POINT OF THE WHOLE TEST FILE: the GS went to 7, and must come back
    // to 10, or the FC's own recovery leaves it unreachable anyway.
    expect(to_gs).toHaveLength(2);
    expect(to_gs[1][3]).toBe(10);
  });

  it('does not touch the ground station when the FC never staged', () => {
    m.start(7, 10);
    expect(clock.armed_ms).toBe(STAGE_TIMEOUT_MS);
    clock.fire(); // stage timeout

    expect(m.get_state().phase).toBe('failed');
    // Nothing was moved, so nothing must be "restored" -- sending a redundant
    // retune here would be a real retune of a working link.
    expect(to_gs).toHaveLength(0);
  });

  it('treats a NACK as a refusal and leaves the ground station alone', () => {
    m.start(7, 10);
    m.on_nack(sent_nonce(), 'BAD_STATE');

    expect(m.get_state().phase).toBe('failed');
    expect(m.get_state().error).toMatch(/refused/i);
    expect(to_gs).toHaveLength(0);
  });

  it('accepts UNCHANGED as already-settled and adopts the reported channel', () => {
    m.start(10, 10);
    m.on_ack(ack({ nonce: sent_nonce(), status: CH_ST_UNCHANGED, channel: 10, freq_hz: 868_000_000 }));

    const s = m.get_state();
    expect(s.phase).toBe('committed');
    expect(s.target).toBe(10);
    expect(s.freq_hz).toBe(868_000_000);
    expect(to_gs).toHaveLength(0);
  });

  it('ignores acks for another transaction, and CRC failures', () => {
    m.start(7, 10);
    const n = sent_nonce();

    m.on_ack(ack({ nonce: (n + 1) & 0xffff, status: CH_ST_STAGED }));
    expect(m.get_state().phase).toBe('staging');

    m.on_ack(ack({ nonce: n, status: CH_ST_STAGED, crc_ok: false }));
    expect(m.get_state().phase).toBe('staging');
    expect(to_gs).toHaveLength(0);
  });

  it('refuses a channel outside the plan without sending anything', () => {
    m.start(RADIO_CHANNEL_COUNT + 1, 10);
    expect(m.get_state().phase).toBe('failed');
    expect(to_fc).toHaveLength(0);
    expect(to_gs).toHaveLength(0);
  });

  it('refuses to start a second change while one is in flight', () => {
    m.start(7, 10);
    m.start(9, 10);
    expect(to_fc).toHaveLength(1);
    expect(m.get_state().target).toBe(7);
  });

  it('works with no ground station attached (direct FC USB)', () => {
    const solo = new ChannelMachine({
      send_fc: (b) => to_fc.push(b),
      send_gs: null,
      emit: (s) => states.push(s),
      set_timer: clock.set,
      clear_timer: clock.clear
    });

    solo.start(7, 10);
    const n = to_fc[0][3] | (to_fc[0][4] << 8);
    solo.on_ack(ack({ nonce: n, status: CH_ST_STAGED, channel: 7 }));
    clock.fire();
    solo.on_ack(ack({ nonce: n, status: CH_ST_COMMITTED, channel: 7 }));

    expect(solo.get_state().phase).toBe('committed');
  });

  it('gives up before the firmware reverts, so the operator is told', () => {
    // If MC waited longer than the FC, the link would silently reappear on the
    // old channel with the UI still claiming the change was in progress.
    expect(COMMIT_TIMEOUT_MS).toBeLessThan(10_000);
  });
});
