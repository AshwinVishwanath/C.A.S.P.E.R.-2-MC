/**
 * Tests for the CAC (Command-Acknowledge-Confirm) state machine.
 *
 * Covers the full lifecycle of command exchanges: happy paths for ARM and FIRE,
 * NACK handling, timeout/retry logic, echo mismatch detection, telemetry-as-ACK,
 * operator abort, confirm delay timing, busy rejection, nonce filtering,
 * auto-reset after completion, and UI state callback verification.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacMachine } from '../cac_machine';
import type { CacUiState } from '../cac_types';
import type { ParsedMessage, AckArm, AckFire, Nack, FcTlmStatus } from '../../protocol/types';
import { NackError, FsmState } from '../../protocol/types';
import {
  CAC_LEG_TIMEOUT_MS,
  CAC_TOTAL_TIMEOUT_MS,
  NACK_ERROR_MESSAGES,
  MSG_ID_ACK_ARM,
  MSG_ID_ACK_FIRE,
  MSG_ID_NACK,
  MSG_ID_CONFIRM,
  MSG_ID_ABORT
} from '../../protocol/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read u16 little-endian from a Uint8Array. */
function read_u16_le(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

/** Extract the nonce from a sent command packet (bytes 3-4, LE u16). */
function extract_nonce(pkt: Uint8Array): number {
  return read_u16_le(pkt, 3);
}

/** Build a matching ACK_ARM ParsedMessage for the given nonce and parameters. */
function make_ack_arm(
  nonce: number,
  echo_channel: number,
  echo_action: number
): ParsedMessage {
  return {
    type: 'ack_arm',
    data: {
      msg_id: MSG_ID_ACK_ARM,
      nonce,
      echo_channel,
      echo_action,
      arm_state: 0,
      cont_state: 0,
      crc_ok: true
    }
  };
}

/** Build a matching ACK_FIRE ParsedMessage for the given nonce and parameters. */
function make_ack_fire(
  nonce: number,
  echo_channel: number,
  echo_duration: number
): ParsedMessage {
  return {
    type: 'ack_fire',
    data: {
      msg_id: MSG_ID_ACK_FIRE,
      nonce,
      echo_channel,
      echo_duration,
      test_mode: false,
      channel_armed: true,
      cont_state: 0,
      crc_ok: true
    }
  };
}

/** Build a NACK ParsedMessage for the given nonce and error code. */
function make_nack(nonce: number, error_code: NackError): ParsedMessage {
  return {
    type: 'nack',
    data: {
      msg_id: MSG_ID_NACK,
      nonce,
      error_code,
      crc_ok: true
    }
  };
}

/** Build a default FcTlmStatus with all channels disarmed. */
function make_tlm_status(overrides?: Partial<FcTlmStatus>): FcTlmStatus {
  return {
    continuity: [false, false, false, false],
    armed: [false, false, false, false],
    fsm_state: FsmState.Pad,
    fired: false,
    error: false,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('CacMachine', () => {
  let sent: Uint8Array[];
  let send: ReturnType<typeof vi.fn>;
  let states: CacUiState[];
  let on_state_change: ReturnType<typeof vi.fn>;
  let machine: CacMachine;

  beforeEach(() => {
    vi.useFakeTimers();

    sent = [];
    send = vi.fn((data: Uint8Array) => { sent.push(data); });
    states = [];
    on_state_change = vi.fn((s: CacUiState) => { states.push(s); });

    machine = new CacMachine({ send, on_state_change });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Happy path ARM
  // -------------------------------------------------------------------------

  describe('happy path ARM', () => {
    it('should complete a full ARM exchange: send -> ACK -> confirm -> idle', () => {
      // Initiate ARM on channel 1
      machine.cmd_arm(1, true);

      // Command should have been sent
      expect(send).toHaveBeenCalledTimes(1);
      const cmd_pkt = sent[0];
      const nonce = extract_nonce(cmd_pkt);

      // Feed matching ACK_ARM (channel 0-indexed: ch1 -> 0, action arm -> 0x01)
      machine.on_message(make_ack_arm(nonce, 0, 0x01));

      // Should be in verifying_ack, confirm not yet sent
      expect(machine.get_phase()).toBe('verifying_ack');

      // Advance past the 1000ms confirm delay
      vi.advanceTimersByTime(1000);

      // Confirm should have been sent
      expect(send).toHaveBeenCalledTimes(2);
      const confirm_pkt = sent[1];
      expect(confirm_pkt[0]).toBe(MSG_ID_CONFIRM);

      // Machine should auto-reset to idle
      expect(machine.get_phase()).toBe('idle');
    });
  });

  // -------------------------------------------------------------------------
  // 2. Happy path FIRE
  // -------------------------------------------------------------------------

  describe('happy path FIRE', () => {
    it('should complete a full FIRE exchange: send -> ACK -> confirm', () => {
      // Initiate FIRE on channel 2, duration 100ms
      machine.cmd_fire(2, 100);

      expect(send).toHaveBeenCalledTimes(1);
      const cmd_pkt = sent[0];
      const nonce = extract_nonce(cmd_pkt);

      // Feed matching ACK_FIRE (channel 0-indexed: ch2 -> 1, duration 100)
      machine.on_message(make_ack_fire(nonce, 1, 100));

      expect(machine.get_phase()).toBe('verifying_ack');

      // Advance past the 1000ms confirm delay
      vi.advanceTimersByTime(1000);

      // Confirm should have been sent
      expect(send).toHaveBeenCalledTimes(2);
      const confirm_pkt = sent[1];
      expect(confirm_pkt[0]).toBe(MSG_ID_CONFIRM);

      // Machine should auto-reset to idle
      expect(machine.get_phase()).toBe('idle');
    });
  });

  // -------------------------------------------------------------------------
  // 3. NACK handling
  // -------------------------------------------------------------------------

  describe('NACK handling', () => {
    it('should transition to failed with error message on NACK', () => {
      machine.cmd_arm(1, true);

      const nonce = extract_nonce(sent[0]);

      machine.on_message(make_nack(nonce, NackError.NotArmed));

      expect(machine.get_phase()).toBe('failed');
      const ui = machine.get_ui_state();
      expect(ui.error).toContain('NACK');
      expect(ui.error).toContain(NACK_ERROR_MESSAGES[NackError.NotArmed]);
      expect(ui.nack_code).toBe(NackError.NotArmed);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Timeout + retry
  // -------------------------------------------------------------------------

  describe('timeout and retry', () => {
    it('should resend the same payload on leg timeout and increment retry_count', () => {
      machine.cmd_arm(1, true);

      // Initial send
      expect(send).toHaveBeenCalledTimes(1);
      const original_payload = sent[0];

      // Advance one leg timeout (2000ms). This triggers retry 1.
      vi.advanceTimersByTime(CAC_LEG_TIMEOUT_MS);

      // Retransmission should have occurred with the same payload
      expect(send).toHaveBeenCalledTimes(2);
      expect(sent[1]).toEqual(original_payload);
      expect(machine.get_phase()).toBe('awaiting_ack');
      expect(machine.get_ui_state().retry_count).toBe(1);

      // Advance another leg timeout. This triggers retry 2.
      vi.advanceTimersByTime(CAC_LEG_TIMEOUT_MS);

      expect(send).toHaveBeenCalledTimes(3);
      expect(sent[2]).toEqual(original_payload);
      expect(machine.get_phase()).toBe('awaiting_ack');
      expect(machine.get_ui_state().retry_count).toBe(2);
    });

    it('should fail after overall timeout even if retries have not been exhausted', () => {
      // With CAC_LEG_TIMEOUT_MS=2000 and CAC_TOTAL_TIMEOUT_MS=10000,
      // the overall timeout fires before 10 retries can complete.
      machine.cmd_arm(1, true);

      // Jump to overall timeout
      vi.advanceTimersByTime(CAC_TOTAL_TIMEOUT_MS);

      expect(machine.get_phase()).toBe('failed');
    });
  });

  // -------------------------------------------------------------------------
  // 5. Overall timeout
  // -------------------------------------------------------------------------

  describe('overall timeout', () => {
    it('should fail when overall timeout expires', () => {
      machine.cmd_arm(1, true);

      // Jump straight to overall timeout
      vi.advanceTimersByTime(CAC_TOTAL_TIMEOUT_MS);

      expect(machine.get_phase()).toBe('failed');
      expect(machine.get_ui_state().error).toContain('timeout');
    });
  });

  // -------------------------------------------------------------------------
  // 6. Echo mismatch
  // -------------------------------------------------------------------------

  describe('echo mismatch', () => {
    it('should fail and send abort when ACK echoes wrong channel', () => {
      machine.cmd_arm(1, true);

      const nonce = extract_nonce(sent[0]);

      // Feed ACK with wrong channel (ch2 = 1 instead of ch1 = 0)
      machine.on_message(make_ack_arm(nonce, 1, 0x01));

      expect(machine.get_phase()).toBe('failed');
      expect(machine.get_ui_state().error).toContain('Echo mismatch');

      // An abort packet should have been sent
      const abort_pkt = sent[sent.length - 1];
      expect(abort_pkt[0]).toBe(MSG_ID_ABORT);
    });

    it('should fail and send abort when ACK echoes wrong action', () => {
      machine.cmd_arm(1, true);

      const nonce = extract_nonce(sent[0]);

      // Feed ACK with wrong action (disarm 0x00 instead of arm 0x01)
      machine.on_message(make_ack_arm(nonce, 0, 0x00));

      expect(machine.get_phase()).toBe('failed');
      expect(machine.get_ui_state().error).toContain('Echo mismatch');

      // An abort packet should have been sent
      const abort_pkt = sent[sent.length - 1];
      expect(abort_pkt[0]).toBe(MSG_ID_ABORT);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Telemetry-as-ACK
  // -------------------------------------------------------------------------

  describe('telemetry-as-ACK', () => {
    it('should advance to confirm when telemetry status confirms arm state', () => {
      machine.cmd_arm(1, true);

      expect(machine.get_phase()).toBe('awaiting_ack');

      // Feed telemetry showing channel 1 (index 0) is armed
      const status = make_tlm_status({
        armed: [true, false, false, false]
      });
      machine.on_telemetry_status(status);

      // Should be verifying now
      expect(machine.get_phase()).toBe('verifying_ack');

      // Advance to confirm
      vi.advanceTimersByTime(1000);

      // Confirm should have been sent
      expect(sent.length).toBe(2); // cmd + confirm
      expect(sent[1][0]).toBe(MSG_ID_CONFIRM);
      expect(machine.get_phase()).toBe('idle');
    });
  });

  // -------------------------------------------------------------------------
  // 8. Abort
  // -------------------------------------------------------------------------

  describe('abort', () => {
    it('should send abort packet and transition to failed', () => {
      machine.cmd_arm(1, true);

      const nonce = extract_nonce(sent[0]);

      machine.abort();

      // Abort packet should have been sent
      expect(send).toHaveBeenCalledTimes(2);
      const abort_pkt = sent[1];
      expect(abort_pkt[0]).toBe(MSG_ID_ABORT);

      // Nonce in abort should match the original command
      const abort_nonce = extract_nonce(abort_pkt);
      expect(abort_nonce).toBe(nonce);

      expect(machine.get_phase()).toBe('failed');
      expect(machine.get_ui_state().error).toContain('abort');
    });
  });

  // -------------------------------------------------------------------------
  // 9. Confirm delay
  // -------------------------------------------------------------------------

  describe('confirm delay', () => {
    it('should NOT send confirm before 1000ms and SHOULD send at 1000ms', () => {
      machine.cmd_arm(1, true);

      const nonce = extract_nonce(sent[0]);

      // Feed matching ACK
      machine.on_message(make_ack_arm(nonce, 0, 0x01));

      // At 999ms, confirm should NOT have been sent
      vi.advanceTimersByTime(999);
      expect(send).toHaveBeenCalledTimes(1); // Only the original cmd

      // At 1000ms (1ms more), confirm SHOULD be sent
      vi.advanceTimersByTime(1);
      expect(send).toHaveBeenCalledTimes(2); // cmd + confirm
      expect(sent[1][0]).toBe(MSG_ID_CONFIRM);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Busy rejection
  // -------------------------------------------------------------------------

  describe('busy rejection', () => {
    it('should throw when initiating a command while already busy', () => {
      machine.cmd_arm(1, true);

      expect(() => machine.cmd_arm(2, true)).toThrow('busy');
      expect(() => machine.cmd_fire(2, 100)).toThrow('busy');
    });
  });

  // -------------------------------------------------------------------------
  // 11. Wrong nonce ignored
  // -------------------------------------------------------------------------

  describe('wrong nonce ignored', () => {
    it('should stay in awaiting_ack when ACK has a different nonce', () => {
      machine.cmd_arm(1, true);

      const nonce = extract_nonce(sent[0]);
      const wrong_nonce = (nonce + 1) & 0xFFFF;

      // Feed ACK with wrong nonce
      machine.on_message(make_ack_arm(wrong_nonce, 0, 0x01));

      // Should still be awaiting_ack -- the wrong-nonce ACK is ignored
      expect(machine.get_phase()).toBe('awaiting_ack');
    });

    it('should still accept the correct nonce after ignoring wrong ones', () => {
      machine.cmd_arm(1, true);

      const nonce = extract_nonce(sent[0]);
      const wrong_nonce = (nonce + 1) & 0xFFFF;

      // Feed wrong nonce first
      machine.on_message(make_ack_arm(wrong_nonce, 0, 0x01));
      expect(machine.get_phase()).toBe('awaiting_ack');

      // Now feed correct nonce
      machine.on_message(make_ack_arm(nonce, 0, 0x01));
      expect(machine.get_phase()).toBe('verifying_ack');
    });
  });

  // -------------------------------------------------------------------------
  // 12. Complete auto-reset
  // -------------------------------------------------------------------------

  describe('complete auto-reset', () => {
    it('should auto-reset to idle after successful exchange', () => {
      machine.cmd_arm(1, true);

      const nonce = extract_nonce(sent[0]);

      machine.on_message(make_ack_arm(nonce, 0, 0x01));
      vi.advanceTimersByTime(1000);

      // Should be idle and not busy
      expect(machine.get_phase()).toBe('idle');
      expect(machine.is_busy()).toBe(false);
    });

    it('should allow initiating a new command after auto-reset', () => {
      // First exchange
      machine.cmd_arm(1, true);
      const nonce1 = extract_nonce(sent[0]);
      machine.on_message(make_ack_arm(nonce1, 0, 0x01));
      vi.advanceTimersByTime(1000);

      // Machine is idle, should accept a new command
      expect(() => machine.cmd_arm(2, true)).not.toThrow();
      expect(machine.get_phase()).toBe('awaiting_ack');
    });
  });

  // -------------------------------------------------------------------------
  // 13. UI state updates
  // -------------------------------------------------------------------------

  describe('UI state updates', () => {
    it('should call on_state_change with correct busy/command_type/target_channel at each transition', () => {
      machine.cmd_arm(1, true);

      // After cmd_arm, the machine transitions through sending_cmd and awaiting_ack
      // Check that on_state_change was called with busy=true
      const busy_states = states.filter(s => s.busy);
      expect(busy_states.length).toBeGreaterThan(0);

      // All busy states should have command_type='arm' and target_channel=1
      for (const s of busy_states) {
        expect(s.command_type).toBe('arm');
        expect(s.target_channel).toBe(1);
      }

      // Feed matching ACK
      const nonce = extract_nonce(sent[0]);
      machine.on_message(make_ack_arm(nonce, 0, 0x01));

      // After ACK, still busy (verifying)
      const latest_busy = states.filter(s => s.busy);
      expect(latest_busy.length).toBeGreaterThan(0);

      // Advance to confirm and completion
      vi.advanceTimersByTime(1000);

      // After auto-reset, the last state should be idle (busy=false)
      const final_state = states[states.length - 1];
      expect(final_state.busy).toBe(false);
      expect(final_state.command_type).toBeNull();
      expect(final_state.target_channel).toBeNull();
    });

    it('should report error in UI state on failure', () => {
      machine.cmd_arm(1, true);

      const nonce = extract_nonce(sent[0]);
      machine.on_message(make_nack(nonce, NackError.BadState));

      const final_state = states[states.length - 1];
      expect(final_state.busy).toBe(false);
      expect(final_state.error).toContain('NACK');
      expect(final_state.nack_code).toBe(NackError.BadState);
    });

    it('should report retry_count in UI state during retransmissions', () => {
      machine.cmd_arm(1, true);

      // Trigger one retry
      vi.advanceTimersByTime(CAC_LEG_TIMEOUT_MS);

      // Find a state with retry_count > 0
      const retry_states = states.filter(s => s.retry_count > 0);
      expect(retry_states.length).toBeGreaterThan(0);
      expect(retry_states[0].retry_count).toBe(1);
    });
  });
});
