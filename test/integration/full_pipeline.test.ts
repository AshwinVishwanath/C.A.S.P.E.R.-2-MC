/**
 * Integration tests for the C.A.S.P.E.R. 2 Mission Control data pipeline.
 *
 * Verifies the complete path from raw bytes through protocol parsing,
 * telemetry store updates, and command state machine transitions --
 * without requiring actual serial ports or Electron.
 *
 * @module test/integration/full_pipeline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parse_packet } from '../../src/main/protocol/parser';
import { TelemetryStore } from '../../src/main/store/telemetry_store';
import { CacMachine } from '../../src/main/command/cac_machine';
import { cobs_encode, cobs_decode } from '../../src/main/transport/cobs';
import { FsmState, NackError, EventType } from '../../src/main/protocol/types';
import { RING_BUFFER_DEPTH, STALE_THRESHOLD_MS } from '../../src/main/protocol/constants';
import type { CacCallbacks } from '../../src/main/command/cac_types';
import * as fixtures from '../fixtures/packets';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a mock CacCallbacks object with vi.fn() stubs. */
function mock_cac_callbacks(): CacCallbacks {
  return {
    send: vi.fn(),
    on_state_change: vi.fn()
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Full Pipeline Integration', () => {
  let store: TelemetryStore;

  beforeEach(() => {
    store = new TelemetryStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // Test 1: GS_MSG_TELEM -> parse -> store -> verify snapshot
  // -----------------------------------------------------------------------

  it('should parse GS_MSG_TELEM and update store with all telemetry fields', () => {
    const result = parse_packet(fixtures.GS_TELEM_BOOST);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('gs_telem');
    if (result.message.type !== 'gs_telem') return;

    const msg = result.message.data;
    expect(msg.crc_ok).toBe(true);
    expect(msg.alt_m).toBe(1000.0);
    expect(msg.vel_mps).toBeCloseTo(50.0, 1);
    expect(msg.batt_v).toBeCloseTo(7.2, 2);
    expect(msg.seq).toBe(42);
    expect(msg.status.fsm_state).toBe(FsmState.Boost);
    expect(msg.status.continuity[0]).toBe(true);
    expect(msg.rssi_dbm).toBeCloseTo(-120.0, 1);
    expect(msg.snr_db).toBe(10.0);
    expect(msg.freq_err_hz).toBe(50);
    expect(msg.data_age_ms).toBe(100);
    expect(msg.stale).toBe(false);
    expect(msg.mach).toBeCloseTo(0.147, 3);
    expect(msg.qbar_pa).toBe(1500);
    expect(msg.pitch_deg).toBeCloseTo(90.0, 1);

    // Feed into store
    store.update_from_gs_telem(msg);
    const snap = store.get_snapshot();

    expect(snap.alt_m).toBe(1000.0);
    expect(snap.vel_mps).toBeCloseTo(50.0, 1);
    expect(snap.batt_v).toBeCloseTo(7.2, 2);
    expect(snap.seq).toBe(42);
    expect(snap.fsm_state).toBe(FsmState.Boost);
    expect(snap.rssi_dbm).toBeCloseTo(-120.0, 1);
    expect(snap.snr_db).toBe(10.0);
    expect(snap.mach).toBeCloseTo(0.147, 3);
    expect(snap.qbar_pa).toBe(1500);
    expect(snap.pitch_deg).toBeCloseTo(90.0, 1);
    expect(snap.stale).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Test 2: FC_MSG_FAST -> parse -> store -> verify altitude, velocity, FSM
  // -----------------------------------------------------------------------

  it('should parse FC_MSG_FAST and update store with core telemetry', () => {
    const result = parse_packet(fixtures.FC_FAST_PAD_IDLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('fc_fast');
    if (result.message.type !== 'fc_fast') return;

    const msg = result.message.data;
    expect(msg.crc_ok).toBe(true);
    expect(msg.msg_id).toBe(0x01);
    expect(msg.alt_m).toBe(0);
    expect(msg.vel_mps).toBe(0);
    expect(msg.status.fsm_state).toBe(FsmState.Pad);
    expect(msg.batt_v).toBeCloseTo(7.2, 2);
    expect(msg.flight_time_s).toBe(0);

    // Feed into store
    store.update_from_fc_fast(msg);
    const snap = store.get_snapshot();

    expect(snap.alt_m).toBe(0);
    expect(snap.vel_mps).toBe(0);
    expect(snap.fsm_state).toBe(FsmState.Pad);
    expect(snap.batt_v).toBeCloseTo(7.2, 2);
    expect(snap.stale).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Test 3: FC_MSG_GPS -> parse -> store -> verify GPS fields
  // -----------------------------------------------------------------------

  it('should parse FC_MSG_GPS and update store with GPS position', () => {
    const result = parse_packet(fixtures.FC_GPS_3D_FIX);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('fc_gps');
    if (result.message.type !== 'fc_gps') return;

    const msg = result.message.data;
    expect(msg.crc_ok).toBe(true);
    expect(msg.dlat_m).toBe(1.0);
    expect(msg.dlon_m).toBe(2.0);
    expect(msg.alt_msl_m).toBe(150.0);
    expect(msg.fix_type).toBe(3);
    expect(msg.sat_count).toBe(12);
    expect(msg.range_saturated).toBe(false);

    // Feed into store
    store.update_from_gps(msg);
    const snap = store.get_snapshot();

    expect(snap.gps_dlat_m).toBe(1.0);
    expect(snap.gps_dlon_m).toBe(2.0);
    expect(snap.gps_alt_msl_m).toBe(150.0);
    expect(snap.gps_fix).toBe(3);
    expect(snap.gps_sats).toBe(12);
    expect(snap.gps_range_saturated).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Test 4: FC_MSG_EVENT (Apogee) -> parse -> store -> verify apogee + events
  // -----------------------------------------------------------------------

  it('should parse FC_MSG_EVENT (Apogee) and record in store events log', () => {
    const result = parse_packet(fixtures.FC_EVENT_APOGEE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('fc_event');
    if (result.message.type !== 'fc_event') return;

    const msg = result.message.data;
    expect(msg.crc_ok).toBe(true);
    expect(msg.event_type).toBe(EventType.Apogee);
    expect(msg.event_data).toBe(50);
    expect(msg.flight_time_s).toBeCloseTo(30.0, 1);

    // Feed into store
    store.update_from_event(msg);
    const snap = store.get_snapshot();

    // Apogee altitude: event_data * 10 = 500m
    expect(snap.apogee_alt_m).toBe(500);
    // Event should be in the events log
    expect(snap.events).toHaveLength(1);
    expect(snap.events[0].type).toBe(EventType.Apogee);
    expect(snap.events[0].data).toBe(50);
    expect(snap.events[0].flight_time_s).toBeCloseTo(30.0, 1);
    expect(snap.events[0].type_name).toContain('APOGEE');
    expect(snap.events[0].type_name).toContain('500');
  });

  // -----------------------------------------------------------------------
  // Test 5: COBS-encoded GS_MSG_TELEM -> decode -> parse -> store (full GS pipeline)
  // -----------------------------------------------------------------------

  it('should handle full GS pipeline: COBS encode -> decode -> parse -> store', () => {
    // Encode the raw packet with COBS
    const encoded = cobs_encode(fixtures.GS_TELEM_BOOST);

    // Encoded output should not contain any 0x00 bytes
    for (let i = 0; i < encoded.length; i++) {
      expect(encoded[i]).not.toBe(0x00);
    }

    // Decode back
    const decoded = cobs_decode(encoded);
    expect(decoded).not.toBeNull();
    if (!decoded) return;

    // Decoded should match original
    expect(decoded.length).toBe(fixtures.GS_TELEM_BOOST.length);
    for (let i = 0; i < decoded.length; i++) {
      expect(decoded[i]).toBe(fixtures.GS_TELEM_BOOST[i]);
    }

    // Parse the decoded packet
    const result = parse_packet(decoded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('gs_telem');
    if (result.message.type !== 'gs_telem') return;

    const msg = result.message.data;
    expect(msg.crc_ok).toBe(true);

    // Feed into store and verify
    store.update_from_gs_telem(msg);
    const snap = store.get_snapshot();

    expect(snap.alt_m).toBe(1000.0);
    expect(snap.vel_mps).toBeCloseTo(50.0, 1);
    expect(snap.fsm_state).toBe(FsmState.Boost);
    expect(snap.stale).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Test 6: Stale detection after timeout
  // -----------------------------------------------------------------------

  it('should detect stale data after STALE_THRESHOLD_MS elapses', () => {
    // First, feed a valid packet so last_valid_ms is set
    const result = parse_packet(fixtures.FC_FAST_PAD_IDLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.message.type !== 'fc_fast') return;

    store.update_from_fc_fast(result.message.data);
    expect(store.get_snapshot().stale).toBe(false);

    // Advance time beyond the stale threshold
    const now = Date.now();
    vi.advanceTimersByTime(STALE_THRESHOLD_MS + 100);
    const later = now + STALE_THRESHOLD_MS + 100;

    store.tick_stale(later);
    const snap = store.get_snapshot();

    expect(snap.stale).toBe(true);
    expect(snap.stale_since_ms).toBeGreaterThan(STALE_THRESHOLD_MS);
  });

  // -----------------------------------------------------------------------
  // Test 7: Ring buffer accumulation and cap at RING_BUFFER_DEPTH
  // -----------------------------------------------------------------------

  it('should cap ring buffers at RING_BUFFER_DEPTH (150) entries', () => {
    const result = parse_packet(fixtures.FC_FAST_PAD_IDLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.message.type !== 'fc_fast') return;

    const msg = result.message.data;

    // Push 200 samples into the store
    for (let i = 0; i < 200; i++) {
      store.update_from_fc_fast(msg);
    }

    const snap = store.get_snapshot();

    expect(snap.buf_alt.length).toBe(RING_BUFFER_DEPTH);
    expect(snap.buf_vel.length).toBe(RING_BUFFER_DEPTH);
    expect(snap.buf_qbar.length).toBe(RING_BUFFER_DEPTH);
  });

  // -----------------------------------------------------------------------
  // Test 8: ACK_ARM -> CacMachine -> verify state transitions
  // -----------------------------------------------------------------------

  it('should transition CacMachine through ARM -> ACK -> verifying_ack on valid ACK_ARM', () => {
    const callbacks = mock_cac_callbacks();
    const cac = new CacMachine(callbacks);

    // Initiate an ARM command for channel 1
    cac.cmd_arm(1, true);
    expect(cac.get_phase()).toBe('awaiting_ack');
    expect(callbacks.send).toHaveBeenCalledTimes(1);

    // Parse the ACK_ARM fixture
    const result = parse_packet(fixtures.ACK_ARM_CH1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message.type).toBe('ack_arm');
    if (result.message.type !== 'ack_arm') return;

    // The fixture has nonce=0x1234, but cmd_arm generates a random nonce.
    // We need to inject a matching ACK. Let's get the nonce from the CAC.
    const ui = cac.get_ui_state();
    expect(ui.command_type).toBe('arm');
    expect(ui.target_channel).toBe(1);

    // To test the full flow, we need the nonce from the sent command.
    // Extract it from the sent payload.
    const sent_payload = (callbacks.send as any).mock.calls[0][0] as Uint8Array;
    // ARM command: [0]=0x80, [1]=0xCA, [2]=0x5A, [3-4]=nonce(LE), [5]=channel, [6]=action, [7]=~channel
    const sent_nonce = sent_payload[3] | (sent_payload[4] << 8);

    // Build a matching ACK_ARM with the correct nonce
    const ack_buf = new Uint8Array(fixtures.ACK_ARM_CH1);
    // Patch the nonce to match
    ack_buf[1] = sent_nonce & 0xFF;
    ack_buf[2] = (sent_nonce >> 8) & 0xFF;
    // Recompute CRC (we need the CRC function)
    // Instead, let's use the parser directly with the fact that CRC check
    // is separate from nonce matching. We construct a proper ParsedMessage.
    const ack_msg = {
      type: 'ack_arm' as const,
      data: {
        msg_id: 0xA0,
        nonce: sent_nonce,
        echo_channel: 0, // 0-indexed (channel 1 - 1)
        echo_action: 1,  // arm
        arm_state: 0x01,
        cont_state: 0x01,
        crc_ok: true
      }
    };

    cac.on_message(ack_msg);
    expect(cac.get_phase()).toBe('verifying_ack');

    // Clean up timers
    cac.reset();
  });

  // -----------------------------------------------------------------------
  // Test 9: NACK -> CacMachine -> verify failure and error message
  // -----------------------------------------------------------------------

  it('should transition CacMachine to failed on NACK with error message', () => {
    const callbacks = mock_cac_callbacks();
    const cac = new CacMachine(callbacks);

    // Track failure events
    const failed_handler = vi.fn();
    cac.on('failed', failed_handler);

    // Initiate a FIRE command for channel 2
    cac.cmd_fire(2, 100);
    expect(cac.get_phase()).toBe('awaiting_ack');

    // Get the nonce from the sent command
    const sent_payload = (callbacks.send as any).mock.calls[0][0] as Uint8Array;
    // FIRE command: [0]=0x81, [1]=0xCA, [2]=0x5A, [3-4]=nonce(LE)
    const sent_nonce = sent_payload[3] | (sent_payload[4] << 8);

    // Send a NACK with matching nonce
    const nack_msg = {
      type: 'nack' as const,
      data: {
        msg_id: 0xE0,
        nonce: sent_nonce,
        error_code: NackError.NotArmed,
        crc_ok: true
      }
    };

    cac.on_message(nack_msg);
    expect(cac.get_phase()).toBe('failed');

    // Verify the error message
    const ui = cac.get_ui_state();
    expect(ui.error).toContain('NACK');
    expect(ui.error).toContain('not armed');
    expect(ui.nack_code).toBe(NackError.NotArmed);

    // Verify the failed event was emitted
    expect(failed_handler).toHaveBeenCalledTimes(1);
    expect(failed_handler).toHaveBeenCalledWith(expect.stringContaining('NACK'));
  });

  // -----------------------------------------------------------------------
  // Test 10: Parse invalid packet (bad CRC) -> verify result.ok === false
  // -----------------------------------------------------------------------

  it('should report crc_ok=false for a packet with corrupted CRC', () => {
    // Create a copy with corrupted CRC (flip last byte)
    const corrupted = new Uint8Array(fixtures.FC_FAST_PAD_IDLE);
    corrupted[corrupted.length - 1] ^= 0xFF;

    const result = parse_packet(corrupted);
    // Parse should still succeed (it returns the message with crc_ok=false)
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('fc_fast');
    if (result.message.type !== 'fc_fast') return;

    expect(result.message.data.crc_ok).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Additional: Parse each fixture packet standalone (sanity checks)
  // -----------------------------------------------------------------------

  it('should parse ACK_ARM fixture with valid CRC', () => {
    const result = parse_packet(fixtures.ACK_ARM_CH1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('ack_arm');
    if (result.message.type !== 'ack_arm') return;

    const msg = result.message.data;
    expect(msg.crc_ok).toBe(true);
    expect(msg.nonce).toBe(0x1234);
    expect(msg.echo_channel).toBe(0);
    expect(msg.echo_action).toBe(1);
    expect(msg.arm_state).toBe(0x01);
    expect(msg.cont_state).toBe(0x01);
  });

  it('should parse ACK_FIRE fixture with valid CRC', () => {
    const result = parse_packet(fixtures.ACK_FIRE_CH2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('ack_fire');
    if (result.message.type !== 'ack_fire') return;

    const msg = result.message.data;
    expect(msg.crc_ok).toBe(true);
    expect(msg.nonce).toBe(0x5678);
    expect(msg.echo_channel).toBe(1);
    expect(msg.echo_duration).toBe(100);
    expect(msg.test_mode).toBe(false);
    expect(msg.channel_armed).toBe(true);
    expect(msg.cont_state).toBe(0x03);
  });

  it('should parse NACK fixture with valid CRC', () => {
    const result = parse_packet(fixtures.NACK_NOT_ARMED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.message.type).toBe('nack');
    if (result.message.type !== 'nack') return;

    const msg = result.message.data;
    expect(msg.crc_ok).toBe(true);
    expect(msg.nonce).toBe(0xABCD);
    expect(msg.error_code).toBe(NackError.NotArmed);
  });

  // -----------------------------------------------------------------------
  // Additional: Store subscriber notification
  // -----------------------------------------------------------------------

  it('should notify subscribers on store updates', () => {
    const subscriber = vi.fn();
    store.subscribe(subscriber);

    const result = parse_packet(fixtures.FC_FAST_PAD_IDLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.message.type !== 'fc_fast') return;

    store.update_from_fc_fast(result.message.data);

    expect(subscriber).toHaveBeenCalledTimes(1);
    const received_snap = subscriber.mock.calls[0][0];
    expect(received_snap.alt_m).toBe(0);
    expect(received_snap.batt_v).toBeCloseTo(7.2, 2);
  });

  // -----------------------------------------------------------------------
  // Additional: Empty payload error handling
  // -----------------------------------------------------------------------

  it('should return error for empty payload', () => {
    const result = parse_packet(new Uint8Array(0));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Empty');
  });

  // -----------------------------------------------------------------------
  // Additional: Too-short packet error handling
  // -----------------------------------------------------------------------

  it('should return error for truncated FC_MSG_FAST', () => {
    // Only send 5 bytes (need 19)
    const truncated = fixtures.FC_FAST_PAD_IDLE.subarray(0, 5);
    const result = parse_packet(truncated);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('too short');
    expect(result.msg_id).toBe(0x01);
  });
});
