/**
 * Config / Logic upload — send-and-await-ACK with bounded retry.
 *
 * Extracted from ipc/handlers.ts so this logic is unit-testable without an
 * Electron runtime: it depends only on the FC USB transport, the protocol
 * parser, and protocol constants.
 *
 * Per docs/specs/MC_FC_ALIGNMENT.md §9/§10: both CMD_CONFIG and CMD_LOGIC
 * uploads are USB-CDC-direct only (never routed through the GS/LoRa
 * preference path — the radio caps frames at 32 bytes, far below either
 * upload), so this module talks exclusively to the FC transport.
 *
 * @module protocol/upload_ack
 */

import type { FcUsb } from '../transport/fc_usb';
import { parse_packet } from './parser';
import type { ParsedMessage } from './types';
import { NACK_ERROR_MESSAGES, UPLOAD_ACK_TIMEOUT_MS, UPLOAD_MAX_RETRIES } from './constants';

/** Result of a single upload-and-await-ACK transaction. */
export interface UploadAckResult {
  ok: boolean;
  /** Hash echoed by the FC's ACK (config_hash or logic_hash), if any ACK arrived. */
  hash?: number;
  /** True if the echoed hash equals the locally-computed hash for this upload. */
  verified?: boolean;
  /** Raw NACK error code, if the FC rejected the upload. */
  nack_code?: number;
  /** Human-readable failure reason (timeout, NACK, or transport error). */
  error?: string;
}

/**
 * Wait for the next frame on `fc` that satisfies `predicate`, up to `timeout_ms`.
 * Resolves `null` on timeout. Always removes its listener before resolving,
 * so a timed-out wait cannot leak or double-fire on a later frame.
 */
export function wait_for_frame(
  fc: FcUsb,
  predicate: (msg: ParsedMessage) => boolean,
  timeout_ms: number
): Promise<ParsedMessage | null> {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (result: ParsedMessage | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fc.removeListener('frame', on_frame);
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), timeout_ms);

    const on_frame = (data: Uint8Array): void => {
      const result = parse_packet(data);
      if (!result.ok) return;
      if (!predicate(result.message)) return;
      finish(result.message);
    };

    fc.on('frame', on_frame);
  });
}

/**
 * Send an already-framed config/logic upload and await its matching ACK,
 * retrying (same nonce, same bytes) up to `UPLOAD_MAX_RETRIES` additional
 * times on timeout. A NACK or a hash-verified/mismatched ACK both end the
 * exchange immediately (no point retrying a NACK — the FC already decided).
 *
 * @param fc - Flight-computer USB transport. Uploads never go via GS/LoRa.
 * @param frame - Fully-built command frame (msg_id + nonce + blob + outer CRC).
 * @param nonce - The nonce baked into `frame`, used to match the ACK/NACK.
 * @param ack_type - Discriminant of the expected success response.
 * @param expected_hash - Locally-computed hash (blob trailing CRC) to compare
 *   against the ACK's echoed hash.
 */
export async function send_upload_with_ack(
  fc: FcUsb,
  frame: Uint8Array,
  nonce: number,
  ack_type: 'ack_config' | 'ack_logic',
  expected_hash: number
): Promise<UploadAckResult> {
  if (!fc.is_connected()) {
    return { ok: false, error: 'FC not connected (config/logic uploads are USB-CDC-direct only)' };
  }

  const total_attempts = UPLOAD_MAX_RETRIES + 1;

  for (let attempt = 0; attempt < total_attempts; attempt++) {
    try {
      fc.send(frame);
    } catch (err) {
      return { ok: false, error: `Send failed: ${err instanceof Error ? err.message : String(err)}` };
    }

    const msg = await wait_for_frame(
      fc,
      (m) => {
        if (m.type === 'nack') return m.data.nonce === nonce;
        if (m.type === 'ack_config') return ack_type === 'ack_config' && m.data.nonce === nonce;
        if (m.type === 'ack_logic') return ack_type === 'ack_logic' && m.data.nonce === nonce;
        return false;
      },
      UPLOAD_ACK_TIMEOUT_MS
    );

    if (msg === null) {
      continue; // timeout on this leg — retry with the same nonce/frame
    }

    if (msg.type === 'nack') {
      return {
        ok: false,
        nack_code: msg.data.error_code,
        error: NACK_ERROR_MESSAGES[msg.data.error_code] ?? `NACK (0x${msg.data.error_code.toString(16)})`
      };
    }

    // The predicate above guarantees only 'ack_config'/'ack_logic'/'nack' can
    // resolve `msg`, and 'nack' was handled above — these literal checks give
    // TS a real discriminated narrowing (no casts) for the hash field.
    if (msg.type === 'ack_config') {
      const hash = msg.data.config_hash;
      const verified = (hash >>> 0) === (expected_hash >>> 0);
      return { ok: true, hash, verified };
    }
    if (msg.type === 'ack_logic') {
      const hash = msg.data.logic_hash;
      const verified = (hash >>> 0) === (expected_hash >>> 0);
      return { ok: true, hash, verified };
    }

    // Unreachable given the predicate — defensive fallback.
    return { ok: false, error: `Unexpected message type while awaiting ${ack_type}: ${msg.type}` };
  }

  return { ok: false, error: `No ACK after ${total_attempts} attempt(s) (timeout)` };
}
