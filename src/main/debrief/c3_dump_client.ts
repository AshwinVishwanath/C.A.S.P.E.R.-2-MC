/**
 * Casper-3 `CDMP` flash-dump client.
 *
 * Wire protocol (firmware: flight/app/flight_app.c dump_step(); reference
 * host: tools/casper_dump.py):
 *
 *   host -> fc   COBS(0xD2) + 0x00       request (MSG_ID_DUMP_FLASH)
 *   fc -> host   'C','D','M','P', n      header, RAW (not COBS)
 *   fc -> host   n x 9 bytes             [id:u8][offset:u32le][size:u32le]
 *   host -> fc   0x06                    one ACK, arms the transfer
 *   fc -> host   <= 4096 bytes           chunk, RAW
 *   host -> fc   0x06                    ACK per chunk, repeat
 *   fc -> host   'D','O','N','E'         end
 *
 * Everything after the request is raw binary: the dump owns the pipe for its
 * duration (the firmware suppresses telemetry while dumping), so there is
 * nothing to frame against.
 *
 * THE PROTOCOL HAS NO SEEK. Regions are sent in table order and cannot be
 * requested individually — deselecting one only means the host discards the
 * bytes, not that they stay on the chip. What IS supported is stopping
 * early: region 6 (PRELAUNCH, 39.41 MiB) is deliberately last, so a host
 * that only wants the common regions 0-5 can abandon the transfer after
 * region 5 and skip more than half the download. That is exactly what
 * `include_prelaunch: false` does here.
 *
 * @module debrief/c3_dump_client
 */

import type { FcUsb } from '../transport/fc_usb';
import { LOG_FLASH_END, DUMP_REGIONS } from './c3_log_format';

/** MSG_ID_DUMP_FLASH — the one COBS-framed byte that starts a dump. */
const MSG_ID_DUMP_FLASH = 0xd2;
const DUMP_ACK = 0x06;
const DUMP_CHUNK = 4096;
const ERASED = 0xff;

/** The firmware's own per-step deadline is 5 s; allow more so a slow host
 *  write does not abandon a transfer the FC is still willing to continue. */
const DEFAULT_CHUNK_TIMEOUT_MS = 8000;
/** Header hunt has to outlast whatever telemetry is still in the pipe. */
const DEFAULT_HEADER_TIMEOUT_MS = 10000;

export interface DumpRegionDescriptor {
  id: number;
  name: string;
  offset: number;
  size: number;
}

export interface DumpProgress {
  phase: 'requesting' | 'header' | 'transferring' | 'finishing' | 'done';
  region_id: number | null;
  region_name: string | null;
  bytes_done: number;
  bytes_total: number;
  bytes_per_sec: number;
  eta_s: number | null;
}

export interface DumpOptions {
  /** Pull region 6 (PRELAUNCH, 39.41 MiB). Needed only when launch detect
   *  missed and the whole flight lives in the PAD wrap region. */
  include_prelaunch?: boolean;
  on_progress?: (p: DumpProgress) => void;
  /** Cooperative cancel, polled between chunks. */
  should_cancel?: () => boolean;
  chunk_timeout_ms?: number;
  header_timeout_ms?: number;
}

export interface DumpResult {
  image: Uint8Array;
  regions: DumpRegionDescriptor[];
  bytes_received: number;
  stopped_early: boolean;
  cancelled: boolean;
  elapsed_s: number;
}

function region_name(id: number): string {
  return DUMP_REGIONS.find((r) => r.id === id)?.name ?? `id${id}`;
}

/**
 * Run a full dump and return a sparse 64 MB image.
 *
 * Regions land at their true flash offsets and everything unfetched stays
 * 0xFF, so a partial dump is byte-identical in shape to an MSC raw read and
 * the decoder needs no notion of "partial" — unread gaps read as erased,
 * which is exactly what they are.
 */
export async function run_dump(fc: FcUsb, opts: DumpOptions = {}): Promise<DumpResult> {
  const {
    include_prelaunch = false,
    on_progress,
    should_cancel,
    chunk_timeout_ms = DEFAULT_CHUNK_TIMEOUT_MS,
    header_timeout_ms = DEFAULT_HEADER_TIMEOUT_MS,
  } = opts;

  if (!fc.is_connected()) throw new Error('Dump: flight computer is not connected');

  const started = Date.now();
  let bytes_received = 0;
  let stopped_early = false;
  let cancelled = false;

  const emit = (p: Omit<DumpProgress, 'bytes_per_sec' | 'eta_s'>, total: number): void => {
    if (!on_progress) return;
    const elapsed = (Date.now() - started) / 1000;
    const rate = elapsed > 0.25 ? bytes_received / elapsed : 0;
    const left = Math.max(0, total - p.bytes_done);
    on_progress({
      ...p,
      bytes_per_sec: rate,
      eta_s: rate > 1024 ? left / rate : null,
    });
  };

  fc.enter_raw_mode();
  try {
    emit({ phase: 'requesting', region_id: null, region_name: null, bytes_done: 0, bytes_total: 0 }, 0);

    // The request itself is the one COBS-framed message in the exchange.
    fc.send(new Uint8Array([MSG_ID_DUMP_FLASH]));

    // Hunt for the magic rather than assuming the next bytes are it: on a
    // CDC=telem build the pipe is still carrying COBS telemetry until the
    // dump takes it over, and those bytes arrive first.
    emit({ phase: 'header', region_id: null, region_name: null, bytes_done: 0, bytes_total: 0 }, 0);
    const magic = [0x43, 0x44, 0x4d, 0x50]; // "CDMP"
    const window: number[] = [];
    const hunt_deadline = Date.now() + header_timeout_ms;
    for (;;) {
      if (Date.now() > hunt_deadline) {
        throw new Error(
          'Dump: no CDMP header. Is the FC running a CDC=telem build? ' +
            'The dump state machine is compiled only when CDC_STREAM == 1.',
        );
      }
      const b = await fc.read_exact(1, Math.max(500, hunt_deadline - Date.now()));
      window.push(b[0]);
      if (window.length > 4) window.shift();
      if (window.length === 4 && magic.every((m, i) => window[i] === m)) break;
    }

    const nregions = (await fc.read_exact(1, chunk_timeout_ms))[0];
    if (nregions === 0 || nregions > 32) {
      throw new Error(`Dump: implausible region count ${nregions}`);
    }

    const regions: DumpRegionDescriptor[] = [];
    for (let i = 0; i < nregions; i++) {
      const d = await fc.read_exact(9, chunk_timeout_ms);
      const view = new DataView(d.buffer, d.byteOffset, d.byteLength);
      const id = d[0];
      regions.push({
        id,
        name: region_name(id),
        offset: view.getUint32(1, true),
        size: view.getUint32(5, true),
      });
    }

    // Which regions we intend to keep. Everything before the last wanted one
    // must still be transferred (no seek); everything after it can be skipped
    // by simply not ACKing again.
    const wanted = (id: number): boolean => include_prelaunch || id !== 6;
    const last_wanted = regions.reduce((acc, r, i) => (wanted(r.id) ? i : acc), -1);
    const bytes_total = regions
      .filter((_, i) => i <= last_wanted)
      .reduce((a, r) => a + r.size, 0);

    const image = new Uint8Array(LOG_FLASH_END).fill(ERASED);

    fc.send_raw(new Uint8Array([DUMP_ACK])); // arms the transfer

    for (let ri = 0; ri < regions.length; ri++) {
      const r = regions[ri];
      if (ri > last_wanted) {
        // Region 6 and beyond, unwanted: stop ACKing. The FC's own 5 s
        // per-step deadline returns it to the normal superloop on its own,
        // so this is an ordinary exit, not a wedge.
        stopped_early = true;
        break;
      }

      let addr = r.offset;
      let remaining = r.size;
      while (remaining > 0) {
        if (should_cancel?.()) {
          cancelled = true;
          break;
        }
        const n = Math.min(DUMP_CHUNK, remaining);
        const data = await fc.read_exact(n, chunk_timeout_ms);
        if (addr + n <= image.length) image.set(data, addr);
        fc.send_raw(new Uint8Array([DUMP_ACK]));
        addr += n;
        remaining -= n;
        bytes_received += n;
        emit(
          {
            phase: 'transferring',
            region_id: r.id,
            region_name: r.name,
            bytes_done: bytes_received,
            bytes_total,
          },
          bytes_total,
        );
      }
      if (cancelled) break;
    }

    emit(
      {
        phase: 'done',
        region_id: null,
        region_name: null,
        bytes_done: bytes_received,
        bytes_total,
      },
      bytes_total,
    );

    return {
      image,
      regions,
      bytes_received,
      stopped_early,
      cancelled,
      elapsed_s: (Date.now() - started) / 1000,
    };
  } finally {
    fc.exit_raw_mode();
  }
}
