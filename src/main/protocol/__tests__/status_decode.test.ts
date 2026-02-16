/**
 * Tests for FC_TLM_STATUS bitmap decoder.
 *
 * Bitmap layout:
 *   Byte 0 (LSB): ARM4|ARM3|ARM2|ARM1|CNT4|CNT3|CNT2|CNT1
 *   Byte 1 (MSB): ST3|ST2|ST1|ST0|FIRED|ERROR|RSVD|RSVD
 */

import { describe, it, expect } from 'vitest';
import { decode_status } from '../status_decode';
import { FsmState } from '../types';

describe('decode_status', () => {
  it('should decode all-zero status correctly', () => {
    const raw = new Uint8Array([0x00, 0x00]);
    const status = decode_status(raw);

    expect(status.continuity).toEqual([false, false, false, false]);
    expect(status.armed).toEqual([false, false, false, false]);
    expect(status.fsm_state).toBe(FsmState.Pad);
    expect(status.fired).toBe(false);
    expect(status.error).toBe(false);
  });

  it('should decode all-ones status correctly', () => {
    const raw = new Uint8Array([0xFF, 0xFF]);
    const status = decode_status(raw);

    expect(status.continuity).toEqual([true, true, true, true]);
    expect(status.armed).toEqual([true, true, true, true]);
    // FSM state 0xF is out of enum range but should still decode
    expect(status.fsm_state).toBe(0x0F);
    expect(status.fired).toBe(true);
    expect(status.error).toBe(true);
  });

  it('should decode individual continuity bits', () => {
    // CNT1 only (bit 0)
    expect(decode_status(new Uint8Array([0x01, 0x00])).continuity)
      .toEqual([true, false, false, false]);

    // CNT2 only (bit 1)
    expect(decode_status(new Uint8Array([0x02, 0x00])).continuity)
      .toEqual([false, true, false, false]);

    // CNT3 only (bit 2)
    expect(decode_status(new Uint8Array([0x04, 0x00])).continuity)
      .toEqual([false, false, true, false]);

    // CNT4 only (bit 3)
    expect(decode_status(new Uint8Array([0x08, 0x00])).continuity)
      .toEqual([false, false, false, true]);

    // CNT1 + CNT3
    expect(decode_status(new Uint8Array([0x05, 0x00])).continuity)
      .toEqual([true, false, true, false]);
  });

  it('should decode individual arm bits', () => {
    // ARM1 only (bit 4)
    expect(decode_status(new Uint8Array([0x10, 0x00])).armed)
      .toEqual([true, false, false, false]);

    // ARM2 only (bit 5)
    expect(decode_status(new Uint8Array([0x20, 0x00])).armed)
      .toEqual([false, true, false, false]);

    // ARM3 only (bit 6)
    expect(decode_status(new Uint8Array([0x40, 0x00])).armed)
      .toEqual([false, false, true, false]);

    // ARM4 only (bit 7)
    expect(decode_status(new Uint8Array([0x80, 0x00])).armed)
      .toEqual([false, false, false, true]);

    // ARM1 + ARM4
    expect(decode_status(new Uint8Array([0x90, 0x00])).armed)
      .toEqual([true, false, false, true]);
  });

  it('should decode all FSM states (0x0 through 0xB)', () => {
    const expected_states: [FsmState, string][] = [
      [FsmState.Pad, 'Pad'],
      [FsmState.Boost, 'Boost'],
      [FsmState.Coast, 'Coast'],
      [FsmState.Coast1, 'Coast1'],
      [FsmState.Sustain, 'Sustain'],
      [FsmState.Coast2, 'Coast2'],
      [FsmState.Apogee, 'Apogee'],
      [FsmState.Drogue, 'Drogue'],
      [FsmState.Main, 'Main'],
      [FsmState.Recovery, 'Recovery'],
      [FsmState.Tumble, 'Tumble'],
      [FsmState.Landed, 'Landed']
    ];

    for (const [state] of expected_states) {
      // FSM state is in bits 7:4 of byte 1
      const byte1 = (state << 4) & 0xFF;
      const status = decode_status(new Uint8Array([0x00, byte1]));
      expect(status.fsm_state).toBe(state);
    }
  });

  it('should decode fired flag (byte 1 bit 3)', () => {
    const raw = new Uint8Array([0x00, 0x08]); // bit 3 of byte 1
    const status = decode_status(raw);
    expect(status.fired).toBe(true);
    expect(status.error).toBe(false);
  });

  it('should decode error flag (byte 1 bit 2)', () => {
    const raw = new Uint8Array([0x00, 0x04]); // bit 2 of byte 1
    const status = decode_status(raw);
    expect(status.fired).toBe(false);
    expect(status.error).toBe(true);
  });

  it('should decode fired and error together', () => {
    const raw = new Uint8Array([0x00, 0x0C]); // bits 3 and 2 of byte 1
    const status = decode_status(raw);
    expect(status.fired).toBe(true);
    expect(status.error).toBe(true);
  });

  it('should decode mixed status: armed ch1+3, continuity ch2+4, Boost, fired', () => {
    // Byte 0: ARM1(bit4) | ARM3(bit6) | CNT2(bit1) | CNT4(bit3) = 0x5A
    const byte0 = 0x10 | 0x40 | 0x02 | 0x08; // = 0x5A
    // Byte 1: Boost(0x1 << 4 = 0x10) | FIRED(0x08) = 0x18
    const byte1 = 0x18;
    const status = decode_status(new Uint8Array([byte0, byte1]));

    expect(status.armed).toEqual([true, false, true, false]);
    expect(status.continuity).toEqual([false, true, false, true]);
    expect(status.fsm_state).toBe(FsmState.Boost);
    expect(status.fired).toBe(true);
    expect(status.error).toBe(false);
  });

  it('should handle short input (1 byte) gracefully', () => {
    const raw = new Uint8Array([0x0F]);
    const status = decode_status(raw);
    expect(status.continuity).toEqual([true, true, true, true]);
    expect(status.armed).toEqual([false, false, false, false]);
    // byte1 defaults to 0
    expect(status.fsm_state).toBe(FsmState.Pad);
  });

  it('should handle empty input gracefully', () => {
    const raw = new Uint8Array([]);
    const status = decode_status(raw);
    expect(status.continuity).toEqual([false, false, false, false]);
    expect(status.armed).toEqual([false, false, false, false]);
    expect(status.fsm_state).toBe(FsmState.Pad);
    expect(status.fired).toBe(false);
    expect(status.error).toBe(false);
  });
});
