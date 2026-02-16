/**
 * CAC (Command-Acknowledge-Confirm) state machine.
 *
 * Manages the three-phase command exchange with the flight computer:
 *   Command --> Acknowledge --> Confirm
 *
 * State transitions:
 *   IDLE --> SENDING_CMD          on initiate_command()
 *   SENDING_CMD --> AWAITING_ACK  after command bytes sent
 *   AWAITING_ACK --> AWAITING_ACK on timeout (resend same nonce, up to MAX_RETRIES)
 *   AWAITING_ACK --> VERIFYING_ACK on valid ACK received (nonce match)
 *   AWAITING_ACK --> FAILED        on NACK, retries exhausted, or overall timeout
 *   VERIFYING_ACK --> SENDING_CONFIRM  auto-confirm after delay if echo matches
 *   VERIFYING_ACK --> FAILED       if echo does NOT match
 *   SENDING_CONFIRM --> COMPLETE   after confirm bytes sent
 *   COMPLETE --> IDLE              auto-reset
 *   FAILED --> IDLE                on next command initiated
 *
 * @module command/cac_machine
 */

import { EventEmitter } from 'events';
import type { ParsedMessage, AckArm, AckFire, Nack, FcTlmStatus } from '../protocol/types';
import {
  CAC_LEG_TIMEOUT_MS,
  CAC_TOTAL_TIMEOUT_MS,
  NACK_ERROR_MESSAGES
} from '../protocol/constants';
import {
  build_arm_command,
  build_fire_command,
  build_confirm,
  build_abort,
  generate_nonce
} from '../protocol/command_builder';
import type {
  CacPhase,
  CacCommandType,
  CacRequest,
  CacUiState,
  CacCallbacks
} from './cac_types';

// ---------------------------------------------------------------------------
// Local constants (not in protocol/constants)
// ---------------------------------------------------------------------------

/** Maximum number of retransmissions before failing. */
const CAC_MAX_RETRIES = 10;

/** Delay in ms between ACK verification and CONFIRM transmission. */
const CAC_CONFIRM_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// CacMachine
// ---------------------------------------------------------------------------

/**
 * CAC state machine for managing command exchanges with the flight computer.
 *
 * Emits:
 *   'phase_change' (phase: CacPhase) -- whenever the phase transitions
 *   'complete'     ()                -- on successful exchange completion
 *   'failed'       (error: string)   -- on exchange failure
 */
export class CacMachine extends EventEmitter {
  private phase: CacPhase = 'idle';
  private request: CacRequest | null = null;
  private callbacks: CacCallbacks;
  private retry_count: number = 0;
  private error_message: string | null = null;
  private nack_code: number | null = null;
  private leg_timer: ReturnType<typeof setTimeout> | null = null;
  private overall_timer: ReturnType<typeof setTimeout> | null = null;
  private confirm_timer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: CacCallbacks) {
    super();
    this.callbacks = callbacks;
  }

  // -----------------------------------------------------------------------
  // Public accessors
  // -----------------------------------------------------------------------

  /** Get current phase of the CAC exchange. */
  get_phase(): CacPhase {
    return this.phase;
  }

  /** Get a read-only UI state snapshot. */
  get_ui_state(): CacUiState {
    return {
      busy: this.phase !== 'idle' && this.phase !== 'complete' && this.phase !== 'failed',
      command_type: this.request?.type ?? null,
      target_channel: this.request?.channel ?? null,
      error: this.error_message,
      nack_code: this.nack_code,
      retry_count: this.retry_count
    };
  }

  /** Check if the machine is currently processing a command. */
  is_busy(): boolean {
    return this.phase !== 'idle' && this.phase !== 'complete' && this.phase !== 'failed';
  }

  // -----------------------------------------------------------------------
  // Command initiation
  // -----------------------------------------------------------------------

  /**
   * Initiate an ARM or DISARM command.
   *
   * Builds the command packet, sends it to the transport layer, and starts
   * the retry/timeout timers.
   *
   * @param channel - Pyro channel (1-4).
   * @param arm - True to arm, false to disarm.
   * @throws Error if the machine is already busy with another exchange.
   */
  cmd_arm(channel: number, arm: boolean): void {
    this._assert_idle();

    const nonce = generate_nonce();
    // Command builder uses 0-indexed channels
    const hw_channel = channel - 1;
    const payload = build_arm_command(hw_channel, arm, nonce);

    this.request = {
      type: arm ? 'arm' : 'disarm',
      channel,
      action: arm ? 0x01 : 0x00,
      nonce,
      payload
    };

    this._begin_exchange();
  }

  /**
   * Initiate a FIRE command.
   *
   * @param channel - Pyro channel (1-4).
   * @param duration_ms - Fire duration in milliseconds.
   * @throws Error if the machine is already busy with another exchange.
   */
  cmd_fire(channel: number, duration_ms: number): void {
    this._assert_idle();

    const nonce = generate_nonce();
    const hw_channel = channel - 1;
    const payload = build_fire_command(hw_channel, duration_ms, nonce);

    this.request = {
      type: 'fire',
      channel,
      duration_ms,
      nonce,
      payload
    };

    this._begin_exchange();
  }

  // -----------------------------------------------------------------------
  // Message ingestion
  // -----------------------------------------------------------------------

  /**
   * Feed a parsed ACK, NACK, or CONFIRM message from the protocol parser.
   *
   * Called by the integration layer whenever the parser emits an
   * acknowledgement-type message. Messages irrelevant to the current
   * exchange are silently ignored.
   *
   * @param msg - Discriminated ParsedMessage union.
   */
  on_message(msg: ParsedMessage): void {
    if (this.phase !== 'awaiting_ack') {
      return;
    }

    switch (msg.type) {
      case 'ack_arm':
        this._handle_ack_arm(msg.data);
        break;
      case 'ack_fire':
        this._handle_ack_fire(msg.data);
        break;
      case 'nack':
        this._handle_nack(msg.data);
        break;
      default:
        // Ignore unrelated message types
        break;
    }
  }

  /**
   * Feed telemetry status for telemetry-as-parallel-ACK.
   *
   * While AWAITING_ACK for an ARM command, if the FC_TLM_STATUS shows the
   * expected arm state change for the target channel, we advance to
   * VERIFYING_ACK using telemetry as the echo source.
   *
   * @param status - Decoded FC telemetry status bitmap.
   */
  on_telemetry_status(status: FcTlmStatus): void {
    if (this.phase !== 'awaiting_ack' || !this.request) {
      return;
    }

    // Only applicable for arm/disarm commands
    if (this.request.type !== 'arm' && this.request.type !== 'disarm') {
      return;
    }

    const ch_index = (this.request.channel ?? 1) - 1;
    const expected_armed = this.request.action === 0x01;

    if (status.armed[ch_index] === expected_armed) {
      // Telemetry confirms the arm state matches our request
      this._clear_leg_timer();
      this._transition('verifying_ack');
      // Telemetry-based echo is treated as verified (the FC state matches)
      this._schedule_confirm();
    }
  }

  // -----------------------------------------------------------------------
  // Operator controls
  // -----------------------------------------------------------------------

  /**
   * Operator abort -- cancel the current exchange.
   *
   * Sends an ABORT packet to the FC and transitions to FAILED.
   */
  abort(): void {
    if (!this.request || this.phase === 'idle') {
      return;
    }

    const abort_pkt = build_abort(this.request.nonce);
    this.callbacks.send(abort_pkt);

    this._fail('Operator abort');
  }

  /**
   * Reset the machine to idle state.
   *
   * Clears all timers, request state, and error messages. Use for cleanup
   * or when re-initialising the command interface.
   */
  reset(): void {
    this._clear_all_timers();
    this.phase = 'idle';
    this.request = null;
    this.retry_count = 0;
    this.error_message = null;
    this.nack_code = null;
    this._notify_ui();
  }

  // -----------------------------------------------------------------------
  // Private: ACK handlers
  // -----------------------------------------------------------------------

  /** Handle an ACK_ARM message while in AWAITING_ACK. */
  private _handle_ack_arm(ack: AckArm): void {
    if (!this.request) return;

    // Nonce must match
    if (ack.nonce !== this.request.nonce) {
      return; // Stale or unrelated ACK -- ignore
    }

    // Must be an arm/disarm command
    if (this.request.type !== 'arm' && this.request.type !== 'disarm') {
      return;
    }

    this._clear_leg_timer();
    this._transition('verifying_ack');

    // Verify echo: channel and action must match the request
    const expected_channel = (this.request.channel ?? 1) - 1; // 0-indexed
    const expected_action = this.request.action ?? 0;

    if (ack.echo_channel !== expected_channel || ack.echo_action !== expected_action) {
      // Echo mismatch -- abort and fail
      const abort_pkt = build_abort(this.request.nonce);
      this.callbacks.send(abort_pkt);
      this._fail(
        `Echo mismatch: expected ch${expected_channel}/action=${expected_action}, ` +
        `got ch${ack.echo_channel}/action=${ack.echo_action}`
      );
      return;
    }

    // Echo verified -- schedule confirm after delay
    this._schedule_confirm();
  }

  /** Handle an ACK_FIRE message while in AWAITING_ACK. */
  private _handle_ack_fire(ack: AckFire): void {
    if (!this.request) return;

    // Nonce must match
    if (ack.nonce !== this.request.nonce) {
      return;
    }

    // Must be a fire command
    if (this.request.type !== 'fire') {
      return;
    }

    this._clear_leg_timer();
    this._transition('verifying_ack');

    // Verify echo: channel and duration must match the request
    const expected_channel = (this.request.channel ?? 1) - 1; // 0-indexed
    const expected_duration = this.request.duration_ms ?? 0;
    // Duration is clamped to u8 by the builder
    const expected_duration_u8 = Math.min(255, Math.max(0, Math.round(expected_duration))) & 0xFF;

    if (ack.echo_channel !== expected_channel || ack.echo_duration !== expected_duration_u8) {
      const abort_pkt = build_abort(this.request.nonce);
      this.callbacks.send(abort_pkt);
      this._fail(
        `Echo mismatch: expected ch${expected_channel}/duration=${expected_duration_u8}, ` +
        `got ch${ack.echo_channel}/duration=${ack.echo_duration}`
      );
      return;
    }

    // Echo verified -- schedule confirm after delay
    this._schedule_confirm();
  }

  /** Handle a NACK message while in AWAITING_ACK. */
  private _handle_nack(nack: Nack): void {
    if (!this.request) return;

    // Nonce must match
    if (nack.nonce !== this.request.nonce) {
      return;
    }

    const error_msg = NACK_ERROR_MESSAGES[nack.error_code] ?? `Unknown NACK error (0x${nack.error_code.toString(16)})`;
    this.nack_code = nack.error_code;
    this._fail(`NACK: ${error_msg}`);
  }

  // -----------------------------------------------------------------------
  // Private: state machine internals
  // -----------------------------------------------------------------------

  /** Assert the machine is idle; throw if busy. */
  private _assert_idle(): void {
    if (this.is_busy()) {
      throw new Error('CAC machine is busy — cannot initiate new command');
    }
  }

  /** Begin the exchange: send command, start timers. */
  private _begin_exchange(): void {
    this.retry_count = 0;
    this.error_message = null;
    this.nack_code = null;

    this._transition('sending_cmd');

    // Send the command
    this.callbacks.send(this.request!.payload);

    // Transition to awaiting ACK
    this._transition('awaiting_ack');

    // Start leg timer (retry on timeout)
    this._start_leg_timer();

    // Start overall timeout
    this._start_overall_timer();
  }

  /** Schedule the CONFIRM packet after the verification delay. */
  private _schedule_confirm(): void {
    this.confirm_timer = setTimeout(() => {
      this.confirm_timer = null;
      if (this.phase !== 'verifying_ack' || !this.request) return;

      this._transition('sending_confirm');

      const confirm_pkt = build_confirm(this.request.nonce);
      this.callbacks.send(confirm_pkt);

      this._clear_overall_timer();
      this._transition('complete');
      this.emit('complete');

      // Auto-reset to idle
      this._auto_reset_to_idle();
    }, CAC_CONFIRM_DELAY_MS);
  }

  /** Auto-reset to idle after completion. */
  private _auto_reset_to_idle(): void {
    this.phase = 'idle';
    this.request = null;
    this.retry_count = 0;
    this.error_message = null;
    this.nack_code = null;
    this._notify_ui();
  }

  /** Transition to FAILED state with an error message. */
  private _fail(error: string): void {
    this._clear_all_timers();
    this.error_message = error;
    this._transition('failed');
    this.emit('failed', error);
  }

  /** Transition to a new phase and notify listeners. */
  private _transition(new_phase: CacPhase): void {
    this.phase = new_phase;
    this.emit('phase_change', new_phase);
    this._notify_ui();
  }

  /** Push the current UI state to the callback. */
  private _notify_ui(): void {
    this.callbacks.on_state_change(this.get_ui_state());
  }

  // -----------------------------------------------------------------------
  // Private: timer management
  // -----------------------------------------------------------------------

  /** Start the leg timer for retransmission. */
  private _start_leg_timer(): void {
    this._clear_leg_timer();
    this.leg_timer = setTimeout(() => {
      this.leg_timer = null;
      this._on_leg_timeout();
    }, CAC_LEG_TIMEOUT_MS);
  }

  /** Handle leg timeout: retransmit or fail. */
  private _on_leg_timeout(): void {
    if (this.phase !== 'awaiting_ack' || !this.request) return;

    this.retry_count++;

    if (this.retry_count >= CAC_MAX_RETRIES) {
      this._fail(`No ACK after ${CAC_MAX_RETRIES} retries`);
      return;
    }

    // Resend the same command (same nonce)
    this.callbacks.send(this.request.payload);
    this._notify_ui();

    // Restart leg timer
    this._start_leg_timer();
  }

  /** Start the overall exchange timeout. */
  private _start_overall_timer(): void {
    this._clear_overall_timer();
    this.overall_timer = setTimeout(() => {
      this.overall_timer = null;
      if (this.phase !== 'idle' && this.phase !== 'complete' && this.phase !== 'failed') {
        this._fail('Overall timeout exceeded');
      }
    }, CAC_TOTAL_TIMEOUT_MS);
  }

  /** Clear the leg retransmission timer. */
  private _clear_leg_timer(): void {
    if (this.leg_timer !== null) {
      clearTimeout(this.leg_timer);
      this.leg_timer = null;
    }
  }

  /** Clear the overall timeout timer. */
  private _clear_overall_timer(): void {
    if (this.overall_timer !== null) {
      clearTimeout(this.overall_timer);
      this.overall_timer = null;
    }
  }

  /** Clear the confirm delay timer. */
  private _clear_confirm_timer(): void {
    if (this.confirm_timer !== null) {
      clearTimeout(this.confirm_timer);
      this.confirm_timer = null;
    }
  }

  /** Clear all active timers. */
  private _clear_all_timers(): void {
    this._clear_leg_timer();
    this._clear_overall_timer();
    this._clear_confirm_timer();
  }
}
