/**
 * Readout orchestrator for C.A.S.P.E.R.-2 flight log download.
 *
 * Coordinates the full readout sequence: metadata, HR stream, LR stream,
 * summary stream, and flash erase.  Uses the FcUsb raw-mode API to send
 * single-byte commands and read binary responses.
 *
 * @module readout/readout_orchestrator
 */

import type { FcUsb } from '../transport/fc_usb';
import {
  READOUT_CMD_HR, READOUT_CMD_LR, READOUT_CMD_SUMMARY,
  READOUT_CMD_METADATA, READOUT_CMD_ERASE,
  HR_ENTRY_SIZE, LR_ENTRY_SIZE,
  HR_LR_HEADER_SIZE, SUMMARY_HEADER_SIZE, METADATA_SIZE, CRC_SIZE,
  type ReadoutProgress, type ReadoutResult, type Metadata,
  type HrEntry, type LrEntry, type SummaryEntry
} from './readout_types';
import {
  parse_hr_lr_header, parse_summary_header, parse_metadata,
  decode_hr_entry, decode_lr_entry, decode_summary_entries,
  verify_data_crc
} from './readout_parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a little-endian uint32 from a Uint8Array. */
function read_u32_le(buf: Uint8Array, offset: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  return view.getUint32(offset, true);
}

/**
 * Read an HR or LR binary stream from the FC.
 *
 * Protocol: send 1-byte command -> read 16-byte header -> read N*entry_size
 * payload bytes -> read 4-byte CRC footer -> verify CRC -> decode entries.
 *
 * Progress is reported incrementally within [pct_start, pct_end].
 */
async function read_stream<T>(
  fc: FcUsb,
  cmd: number,
  entry_size: number,
  decode_fn: (raw: Uint8Array) => T,
  phase: 'hr' | 'lr',
  pct_start: number,
  pct_end: number,
  on_progress: (p: ReadoutProgress) => void
): Promise<{ stream_id: number; entries: T[] }> {
  // Send command
  fc.send_raw(new Uint8Array([cmd]));

  // Read header
  const header = await fc.read_exact(HR_LR_HEADER_SIZE, 10000);
  const { stream_id, count } = parse_hr_lr_header(header);

  on_progress({
    phase,
    pct: pct_start,
    detail: `${phase.toUpperCase()}: ${count} entries`
  });

  if (count === 0) {
    // No data — still need to read the CRC footer (4 zero bytes)
    const crc_buf = await fc.read_exact(CRC_SIZE, 5000);
    // CRC of zero-length payload is a degenerate case — FC sends CRC of empty
    void crc_buf;
    on_progress({ phase, pct: pct_end, detail: `${phase.toUpperCase()}: 0 entries (empty)` });
    return { stream_id, entries: [] };
  }

  // Read payload — use generous timeout for large logs
  const payload_size = count * entry_size;
  const timeout = Math.max(30000, count * 10);
  const payload = await fc.read_exact(payload_size, timeout);

  // Read CRC footer
  const crc_buf = await fc.read_exact(CRC_SIZE, 5000);
  const expected_crc = read_u32_le(crc_buf, 0);
  verify_data_crc(payload, expected_crc);

  // Decode entries with incremental progress
  const entries: T[] = [];
  const pct_range = pct_end - pct_start;
  for (let i = 0; i < count; i++) {
    const offset = i * entry_size;
    const entry_raw = payload.subarray(offset, offset + entry_size);
    entries.push(decode_fn(entry_raw));

    // Report progress every 10% of entries (avoid flooding)
    if (count > 0 && (i % Math.max(1, Math.floor(count / 10)) === 0)) {
      const frac = (i + 1) / count;
      on_progress({
        phase,
        pct: Math.round(pct_start + frac * pct_range),
        detail: `${phase.toUpperCase()}: decoded ${i + 1}/${count}`
      });
    }
  }

  on_progress({
    phase,
    pct: pct_end,
    detail: `${phase.toUpperCase()}: ${count} entries decoded`
  });

  return { stream_id, entries };
}

// ---------------------------------------------------------------------------
// Main readout
// ---------------------------------------------------------------------------

/**
 * Run the full flight log readout sequence.
 *
 * Enters raw mode, reads metadata + HR + LR + summary streams, then exits
 * raw mode.  Progress is reported via the callback throughout.
 *
 * @param fc           - Connected FcUsb instance.
 * @param on_progress  - Callback invoked with progress updates.
 * @returns Parsed readout result containing all flight log data.
 * @throws On communication, framing, or CRC errors.
 */
export async function run_readout(
  fc: FcUsb,
  on_progress: (p: ReadoutProgress) => void
): Promise<ReadoutResult> {
  fc.enter_raw_mode();

  try {
    // ------------------------------------------------------------------
    // Step 1: Metadata
    // ------------------------------------------------------------------
    fc.send_raw(new Uint8Array([READOUT_CMD_METADATA]));
    const meta_raw = await fc.read_exact(METADATA_SIZE, 10000);
    const metadata: Metadata = parse_metadata(meta_raw);

    on_progress({
      phase: 'metadata',
      pct: 5,
      detail: `Metadata: HR=${metadata.hr_count}, LR=${metadata.lr_count}, Summary=${metadata.summary_bytes}B`
    });

    // ------------------------------------------------------------------
    // Step 2: High-rate stream (pct 10-40)
    // ------------------------------------------------------------------
    const hr_result = await read_stream<HrEntry>(
      fc, READOUT_CMD_HR, HR_ENTRY_SIZE, decode_hr_entry,
      'hr', 10, 40, on_progress
    );

    // ------------------------------------------------------------------
    // Step 3: Low-rate stream (pct 40-70)
    // ------------------------------------------------------------------
    const lr_result = await read_stream<LrEntry>(
      fc, READOUT_CMD_LR, LR_ENTRY_SIZE, decode_lr_entry,
      'lr', 40, 70, on_progress
    );

    // ------------------------------------------------------------------
    // Step 4: Summary stream (pct 70-95)
    // ------------------------------------------------------------------
    on_progress({ phase: 'summary', pct: 70, detail: 'Reading summary...' });

    fc.send_raw(new Uint8Array([READOUT_CMD_SUMMARY]));
    const sum_header = await fc.read_exact(SUMMARY_HEADER_SIZE, 10000);
    const { payload_size } = parse_summary_header(sum_header);

    let summary_entries: SummaryEntry[] = [];
    if (payload_size > 0) {
      const sum_timeout = Math.max(10000, payload_size * 2);
      const sum_payload = await fc.read_exact(payload_size, sum_timeout);

      // Read CRC footer
      const sum_crc_buf = await fc.read_exact(CRC_SIZE, 5000);
      const sum_expected_crc = read_u32_le(sum_crc_buf, 0);
      verify_data_crc(sum_payload, sum_expected_crc);

      summary_entries = decode_summary_entries(sum_payload);
    } else {
      // Empty summary — still read CRC footer
      const sum_crc_buf = await fc.read_exact(CRC_SIZE, 5000);
      void sum_crc_buf;
    }

    on_progress({
      phase: 'summary',
      pct: 95,
      detail: `Summary: ${summary_entries.length} entries`
    });

    // ------------------------------------------------------------------
    // Done
    // ------------------------------------------------------------------
    on_progress({ phase: 'done', pct: 100, detail: 'Readout complete' });

    return {
      metadata,
      hr_entries: hr_result.entries,
      lr_entries: lr_result.entries,
      summary_entries
    };
  } catch (err) {
    on_progress({
      phase: 'error',
      pct: 0,
      detail: 'Readout failed',
      error: err instanceof Error ? err.message : String(err)
    });
    throw err;
  } finally {
    fc.exit_raw_mode();
  }
}

// ---------------------------------------------------------------------------
// Erase
// ---------------------------------------------------------------------------

/**
 * Send the flash erase command and wait for completion.
 *
 * The FC does not send a response after erasing — we wait a fixed 3 seconds
 * for the erase to complete.
 *
 * @param fc           - Connected FcUsb instance.
 * @param on_progress  - Callback invoked with progress updates.
 */
export async function run_erase(
  fc: FcUsb,
  on_progress: (p: ReadoutProgress) => void
): Promise<void> {
  fc.enter_raw_mode();

  try {
    fc.send_raw(new Uint8Array([READOUT_CMD_ERASE]));
    on_progress({ phase: 'erase', pct: 50, detail: 'Erasing flash...' });

    // FC doesn't send a response — wait for erase to complete
    await new Promise(resolve => setTimeout(resolve, 3000));

    on_progress({ phase: 'done', pct: 100, detail: 'Erase complete' });
  } catch (err) {
    on_progress({
      phase: 'error',
      pct: 0,
      detail: 'Erase failed',
      error: err instanceof Error ? err.message : String(err)
    });
    throw err;
  } finally {
    fc.exit_raw_mode();
  }
}
