/**
 * Tests for send_upload_with_ack / wait_for_frame (protocol/upload_ack.ts).
 *
 * Covers nonce matching, hash verification, NACK short-circuiting, and the
 * bounded-retry timeout behaviour required by docs/specs/MC_FC_ALIGNMENT.md
 * §10.3 (2 retries, i.e. up to 3 total send attempts).
 *
 * Uses a mocked `serialport` (same pattern as transport/__tests__/fc_usb.test.ts)
 * so a real FcUsb instance drives the exchange — no Electron runtime needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cobs_encode } from '../../transport/cobs';

// ---------------------------------------------------------------------------
// Mock serialport (vi.mock factory is hoisted — no outer-scope references).
// ---------------------------------------------------------------------------

vi.mock('serialport', () => {
  const { EventEmitter } = require('events');

  class MockSerialPort extends EventEmitter {
    path: string;
    baudRate: number;
    isOpen: boolean;
    written_buffers: Buffer[];

    constructor(opts: { path: string; baudRate: number; autoOpen: boolean }) {
      super();
      this.path = opts.path;
      this.baudRate = opts.baudRate;
      this.isOpen = false;
      this.written_buffers = [];
    }

    open(cb: (err: Error | null) => void): void {
      this.isOpen = true;
      cb(null);
    }

    write(data: Buffer, cb?: (err: Error | null) => void): boolean {
      this.written_buffers.push(Buffer.from(data));
      if (cb) cb(null);
      return true;
    }

    close(cb?: (err: Error | null) => void): void {
      this.isOpen = false;
      if (cb) cb(null);
      process.nextTick(() => this.emit('close'));
    }
  }

  return { SerialPort: MockSerialPort };
});

// Import after the mock is in place.
import { FcUsb } from '../../transport/fc_usb';
import { send_upload_with_ack } from '../upload_ack';
import { build_config_upload } from '../command_builder';
import { crc32_compute } from '../crc32';
import { UPLOAD_ACK_TIMEOUT_MS, UPLOAD_MAX_RETRIES, MSG_ID_ACK_CONFIG, MSG_ID_NACK, CFG_BLOB_SIZE } from '../constants';
import { NackError } from '../types';

const DELIM = 0x00;

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

function write_u16(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xFF;
  buf[offset + 1] = (val >> 8) & 0xFF;
}

function write_u32(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xFF;
  buf[offset + 1] = (val >> 8) & 0xFF;
  buf[offset + 2] = (val >> 16) & 0xFF;
  buf[offset + 3] = (val >> 24) & 0xFF;
}

/** Build a synthetic 163-byte cfg_blob with a valid trailing self-CRC. */
function make_cfg_blob(): Uint8Array {
  const blob = new Uint8Array(CFG_BLOB_SIZE);
  for (let i = 0; i < CFG_BLOB_SIZE - 4; i++) blob[i] = (i * 5 + 1) & 0xFF;
  const crc = crc32_compute(blob.subarray(0, CFG_BLOB_SIZE - 4));
  write_u32(blob, CFG_BLOB_SIZE - 4, crc);
  return blob;
}

/** Feed a raw payload into the mock serial port as a COBS-framed wire frame. */
function feed_frame(port: { emit: (event: string, data: Buffer) => void }, payload: Uint8Array): void {
  const encoded = cobs_encode(payload);
  const wire = new Uint8Array(encoded.length + 1);
  wire.set(encoded, 0);
  wire[encoded.length] = DELIM;
  port.emit('data', Buffer.from(wire));
}

/** Build and feed a 13-byte ACK_CONFIG (msg_id 0xA3) with a valid CRC. */
function feed_ack_config(port: any, nonce: number, hash: number): void {
  const pkt = new Uint8Array(13);
  pkt[0] = MSG_ID_ACK_CONFIG;
  write_u16(pkt, 1, nonce);
  write_u32(pkt, 3, hash);
  pkt[7] = 5; // protocol_version
  pkt[8] = 0; // reserved
  write_u32(pkt, 9, crc32_compute(pkt.subarray(0, 9)));
  feed_frame(port, pkt);
}

/** Build and feed a 10-byte NACK (msg_id 0xE0) with a valid CRC. */
function feed_nack(port: any, nonce: number, error_code: NackError): void {
  const pkt = new Uint8Array(10);
  pkt[0] = MSG_ID_NACK;
  write_u16(pkt, 1, nonce);
  pkt[3] = error_code;
  pkt[4] = 0;
  pkt[5] = 0;
  write_u32(pkt, 6, crc32_compute(pkt.subarray(0, 6)));
  feed_frame(port, pkt);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('send_upload_with_ack', () => {
  let fc: FcUsb;

  beforeEach(async () => {
    fc = new FcUsb();
    await fc.connect('COM_TEST');
  });

  afterEach(() => {
    vi.useRealTimers();
    fc.disconnect();
    fc.removeAllListeners();
  });

  it('returns an error immediately, with no send, when FC is not connected', async () => {
    const unconnected = new FcUsb();
    const blob = make_cfg_blob();
    const expected_hash = crc32_compute(blob.subarray(0, blob.length - 4));
    const frame = build_config_upload(blob, 0x1111);

    const result = await send_upload_with_ack(unconnected, frame, 0x1111, 'ack_config', expected_hash);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('not connected');
  });

  it('resolves ok+verified when the ACK nonce and hash both match', async () => {
    const blob = make_cfg_blob();
    const expected_hash = crc32_compute(blob.subarray(0, blob.length - 4));
    const nonce = 0x1234;
    const frame = build_config_upload(blob, nonce);
    const port = (fc as any).port;

    const promise = send_upload_with_ack(fc, frame, nonce, 'ack_config', expected_hash);
    expect(port.written_buffers).toHaveLength(1); // sent once, synchronously

    feed_ack_config(port, nonce, expected_hash);

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.hash).toBe(expected_hash);
    expect(port.written_buffers).toHaveLength(1); // no retry needed
  });

  it('resolves ok but verified:false when the ACK hash does not match the local hash', async () => {
    const blob = make_cfg_blob();
    const expected_hash = crc32_compute(blob.subarray(0, blob.length - 4));
    const nonce = 0x5555;
    const frame = build_config_upload(blob, nonce);
    const port = (fc as any).port;

    const promise = send_upload_with_ack(fc, frame, nonce, 'ack_config', expected_hash);
    feed_ack_config(port, nonce, (expected_hash ^ 0xFFFFFFFF) >>> 0); // deliberately wrong hash

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(false);
  });

  it('ignores an ACK with a mismatched nonce and keeps waiting for the right one', async () => {
    const blob = make_cfg_blob();
    const expected_hash = crc32_compute(blob.subarray(0, blob.length - 4));
    const nonce = 0x7777;
    const frame = build_config_upload(blob, nonce);
    const port = (fc as any).port;

    const promise = send_upload_with_ack(fc, frame, nonce, 'ack_config', expected_hash);

    feed_ack_config(port, 0x9999, expected_hash); // wrong nonce — must be ignored
    feed_ack_config(port, nonce, expected_hash);   // correct nonce — should resolve

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(port.written_buffers).toHaveLength(1); // the stray ACK must not trigger a retry/resend
  });

  it('short-circuits on NACK without retrying', async () => {
    const blob = make_cfg_blob();
    const expected_hash = crc32_compute(blob.subarray(0, blob.length - 4));
    const nonce = 0x2020;
    const frame = build_config_upload(blob, nonce);
    const port = (fc as any).port;

    const promise = send_upload_with_ack(fc, frame, nonce, 'ack_config', expected_hash);
    feed_nack(port, nonce, NackError.FlashFail);

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.nack_code).toBe(NackError.FlashFail);
    expect(result.error).toMatch(/flash/i);
    expect(port.written_buffers).toHaveLength(1); // NACK ends the exchange, no retry
  });

  it('retries with the same nonce/frame on timeout, then succeeds on the next attempt', async () => {
    vi.useFakeTimers();
    const blob = make_cfg_blob();
    const expected_hash = crc32_compute(blob.subarray(0, blob.length - 4));
    const nonce = 0x3333;
    const frame = build_config_upload(blob, nonce);
    const port = (fc as any).port;

    const promise = send_upload_with_ack(fc, frame, nonce, 'ack_config', expected_hash);
    expect(port.written_buffers).toHaveLength(1);

    // First leg times out — expect an identical resend (same nonce, same frame
    // bytes, so the COBS-encoded wire bytes are byte-identical too).
    await vi.advanceTimersByTimeAsync(UPLOAD_ACK_TIMEOUT_MS);
    expect(port.written_buffers).toHaveLength(2);
    expect(Buffer.compare(port.written_buffers[0], port.written_buffers[1])).toBe(0);

    feed_ack_config(port, nonce, expected_hash);

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
  });

  it('fails after exhausting UPLOAD_MAX_RETRIES retries with no ACK', async () => {
    vi.useFakeTimers();
    const blob = make_cfg_blob();
    const expected_hash = crc32_compute(blob.subarray(0, blob.length - 4));
    const nonce = 0x4444;
    const frame = build_config_upload(blob, nonce);
    const port = (fc as any).port;

    const promise = send_upload_with_ack(fc, frame, nonce, 'ack_config', expected_hash);

    const total_attempts = UPLOAD_MAX_RETRIES + 1;
    for (let i = 1; i < total_attempts; i++) {
      // eslint-disable-next-line no-await-in-loop
      await vi.advanceTimersByTimeAsync(UPLOAD_ACK_TIMEOUT_MS);
    }
    // One more advance to time out the final attempt.
    await vi.advanceTimersByTimeAsync(UPLOAD_ACK_TIMEOUT_MS);

    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error).toContain('timeout');
    expect(port.written_buffers).toHaveLength(total_attempts);
  });
});
