/**
 * Channel-change orchestration.
 *
 * Changing the flight computer's LoRa channel means sending a command over the
 * link it is about to move. Get it wrong and the vehicle transmits somewhere
 * nothing is listening, and the only fix is physical access to the rocket. The
 * firmware protects itself with a revert deadline (it goes back on its own if
 * no COMMIT arrives on the new channel); this machine drives the ground half so
 * that deadline is never reached in the normal case.
 *
 * The sequence, from docs/specs/MC_FC_ALIGNMENT.md S16.3:
 *
 *   1. CMD_CHANNEL(SET, N) -> FC        (travels on the OLD channel)
 *   2. FC answers ACK_CHANNEL(STAGED)   (on the OLD channel, then it retunes)
 *   3. GS_CMD_CHANNEL(N) -> GS over USB (the ground station follows)
 *   4. CMD_CHANNEL(COMMIT, N) -> FC     (must reach it on the NEW channel)
 *   5. FC answers ACK_CHANNEL(COMMITTED) and only now writes it to flash
 *
 * Step 4 arriving at all IS the proof the new channel works. That is why the
 * firmware persists nothing before it, and why this machine must not report
 * success on the STAGED ack.
 *
 * WHY A SEPARATE MACHINE AND NOT CacMachine: the CAC handshake exists to make a
 * human confirm something that can actuate (arm, fire). This is not that. There
 * is no operator confirmation step here -- the confirmation is the physics of a
 * packet arriving on a new frequency, and it has to be automatic because a
 * human cannot answer inside the revert deadline.
 *
 * Every failure path puts the GROUND STATION back where it was. The FC returns
 * on its own; if we left the GS moved, a self-recovered vehicle would still be
 * unreachable, which is the exact failure this whole design exists to avoid.
 */

import {
  CH_ACT_SET,
  CH_ACT_COMMIT,
  CH_ST_STAGED,
  CH_ST_COMMITTED,
  CH_ST_UNCHANGED,
  RADIO_CHANNEL_REVERT_MS,
  channel_valid
} from '../protocol/constants';
import { build_channel, build_gs_channel, generate_nonce } from '../protocol/command_builder';
import type { AckChannel } from '../protocol/types';

/**
 * How long to wait for the STAGED ack before giving up. The FC answers from its
 * superloop on the channel we are already on, so this is a link-latency budget,
 * not a work budget: generous, but far inside the revert deadline.
 */
export const STAGE_TIMEOUT_MS = 3000;

/**
 * Pause after retuning the ground station before sending COMMIT. The GS retunes
 * and re-arms RX-continuous synchronously, but the command reaches it over USB
 * and the radio needs to settle on the new carrier; sending COMMIT into that
 * window would waste the attempt.
 */
export const GS_SETTLE_MS = 400;

/**
 * How long to wait for COMMITTED before concluding the new channel does not
 * work and putting everything back. Deliberately SHORTER than the firmware's
 * revert deadline so the ground gives up first and the operator is told,
 * rather than discovering it from a link that silently reappeared on the old
 * channel.
 */
export const COMMIT_TIMEOUT_MS = RADIO_CHANNEL_REVERT_MS - 3000;

export type ChannelPhase =
  | 'idle'
  | 'staging'
  | 'retuning_ground_station'
  | 'committing'
  | 'committed'
  | 'failed';

export interface ChannelState {
  phase: ChannelPhase;
  /** Channel being moved to, or the settled channel once committed. */
  target: number | null;
  /** Channel we came from, and would go back to. */
  previous: number | null;
  /** Frequency the FC reported. Authoritative -- never re-derived locally. */
  freq_hz: number | null;
  /** The FC build's channel count, from the ack. */
  channel_count: number | null;
  /** Human-readable reason, set when phase is 'failed'. */
  error: string | null;
}

type Timer = ReturnType<typeof setTimeout>;

export interface ChannelDeps {
  /** Send bytes to the FLIGHT COMPUTER (via the GS relay, or direct USB). */
  send_fc: (bytes: Uint8Array) => void;
  /**
   * Send bytes to the GROUND STATION over USB. null when Mission Control is
   * wired straight to the FC, in which case there is no ground station to move.
   */
  send_gs: ((bytes: Uint8Array) => void) | null;
  /** Called on every state change, for the UI. */
  emit: (state: ChannelState) => void;
  set_timer?: (fn: () => void, ms: number) => Timer;
  clear_timer?: (t: Timer) => void;
}

export class ChannelMachine {
  private deps: ChannelDeps;
  private state: ChannelState;
  private nonce = 0;
  private timer: Timer | null = null;
  private set_timer: (fn: () => void, ms: number) => Timer;
  private clear_timer: (t: Timer) => void;

  constructor(deps: ChannelDeps) {
    this.deps = deps;
    this.set_timer = deps.set_timer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clear_timer = deps.clear_timer ?? ((t) => clearTimeout(t));
    this.state = {
      phase: 'idle',
      target: null,
      previous: null,
      freq_hz: null,
      channel_count: null,
      error: null
    };
  }

  get_state(): ChannelState {
    return { ...this.state };
  }

  private set(patch: Partial<ChannelState>): void {
    this.state = { ...this.state, ...patch };
    this.deps.emit(this.get_state());
  }

  private stop_timer(): void {
    if (this.timer !== null) {
      this.clear_timer(this.timer);
      this.timer = null;
    }
  }

  private arm(ms: number, fn: () => void): void {
    this.stop_timer();
    this.timer = this.set_timer(fn, ms);
  }

  is_busy(): boolean {
    return (
      this.state.phase === 'staging' ||
      this.state.phase === 'retuning_ground_station' ||
      this.state.phase === 'committing'
    );
  }

  /**
   * Begin a change to `target`. `current` is the channel we believe we are on,
   * and is where everything is put back on any failure.
   */
  start(target: number, current: number): void {
    if (!channel_valid(target)) {
      this.set({ phase: 'failed', error: `channel ${target} is not in the plan` });
      return;
    }
    if (this.is_busy()) {
      this.set({ error: 'a channel change is already in progress' });
      return;
    }

    this.nonce = generate_nonce();
    this.set({
      phase: 'staging',
      target,
      previous: current,
      freq_hz: null,
      error: null
    });

    this.deps.send_fc(build_channel(CH_ACT_SET, target, this.nonce));
    this.arm(STAGE_TIMEOUT_MS, () => {
      // No STAGED ack. The FC never accepted it, so it never retuned and
      // nothing needs undoing -- but say so plainly rather than hanging.
      this.fail('no response to the channel request (the flight computer did not answer)', false);
    });
  }

  /** Feed every ACK_CHANNEL here. Acks for other transactions are ignored. */
  on_ack(ack: AckChannel): void {
    if (!ack.crc_ok) return;
    if (ack.nonce !== this.nonce) return;
    if (!this.is_busy()) return;

    if (ack.status === CH_ST_UNCHANGED) {
      // The FC was already on this channel, or a commit raced the revert
      // deadline. Either way the channel it reports is the truth; adopt it.
      this.stop_timer();
      this.set({
        phase: 'committed',
        target: ack.channel,
        previous: ack.channel,
        freq_hz: ack.freq_hz,
        channel_count: ack.channel_count,
        error: null
      });
      return;
    }

    if (ack.status === CH_ST_STAGED && this.state.phase === 'staging') {
      this.set({
        phase: 'retuning_ground_station',
        freq_hz: ack.freq_hz,
        channel_count: ack.channel_count
      });

      // The FC has retuned. Move the ground station after it, then commit.
      const target = this.state.target as number;
      if (this.deps.send_gs) this.deps.send_gs(build_gs_channel(target));

      this.arm(GS_SETTLE_MS, () => {
        this.set({ phase: 'committing' });
        this.deps.send_fc(build_channel(CH_ACT_COMMIT, target, this.nonce));
        this.arm(COMMIT_TIMEOUT_MS, () => {
          this.fail(
            'no reply on the new channel -- the flight computer is returning to the previous one',
            true
          );
        });
      });
      return;
    }

    if (ack.status === CH_ST_COMMITTED && this.state.phase === 'committing') {
      this.stop_timer();
      this.set({
        phase: 'committed',
        previous: ack.channel,
        target: ack.channel,
        freq_hz: ack.freq_hz,
        channel_count: ack.channel_count,
        error: null
      });
    }
  }

  /**
   * A NACK for our nonce: the FC refused outright (off the ground, or a channel
   * it cannot tune). Nothing was staged, so nothing needs undoing.
   */
  on_nack(nonce: number, reason: string): void {
    if (nonce !== this.nonce || !this.is_busy()) return;
    this.fail(`the flight computer refused the change (${reason})`, false);
  }

  private fail(error: string, restore_ground_station: boolean): void {
    this.stop_timer();

    // Put the GROUND STATION back. The FC returns on its own via its revert
    // deadline; if we left the receiver moved, a vehicle that had correctly
    // recovered would still be unreachable.
    if (restore_ground_station && this.deps.send_gs && this.state.previous !== null) {
      this.deps.send_gs(build_gs_channel(this.state.previous));
    }

    this.set({ phase: 'failed', target: this.state.previous, error });
  }

  /** Drop any in-flight transaction (link lost, window closing). */
  reset(): void {
    this.stop_timer();
    this.nonce = 0;
    this.set({ phase: 'idle', error: null });
  }
}
