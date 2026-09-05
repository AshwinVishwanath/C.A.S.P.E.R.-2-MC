/**
 * Debrief service — dump, persist, decode, and serve one flight at a time.
 *
 * Shape of the flow: pulling the chip is slow and happens once; decoding a
 * single flight out of the resulting image is fast and happens whenever the
 * operator picks a different flight from the list. So the 64 MB image is
 * held in main after a download (or after opening a .bin) and flights are
 * decoded on demand, rather than decoding all of them up front and shipping
 * every series across IPC.
 *
 * The raw .bin is always written to disk before anything is decoded. It is
 * the only copy of the flight data off the chip, and a decoder bug must
 * never be the reason it has to be pulled again.
 *
 * @module debrief/debrief_service
 */

import { app, dialog, shell, type BrowserWindow } from 'electron';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import type { FcUsb } from '../transport/fc_usb';
import { run_dump, type DumpOptions, type DumpProgress } from './c3_dump_client';
import { list_flights, decode_flight, blank_flash, type DecodedFlight } from './c3_decode';
import { build_series, type FlightSeries, type SeriesWindow } from './c3_series';
import { hr_to_csv, lr_to_csv, bmi_to_csv, type CsvStream } from './c3_csv';
import { LOG_FLASH_END, fsm_name, type IndexEntry, type Prologue } from './c3_log_format';

// ---------------------------------------------------------------------------
// Cached image
// ---------------------------------------------------------------------------

interface LoadedImage {
  image: Uint8Array;
  index: IndexEntry[];
  prologue: Prologue | null;
  source: string;
  bin_path: string | null;
}

let loaded: LoadedImage | null = null;

/** Test seam and teardown hook — drops the cached 64 MB image. */
export function reset_debrief_state(): void {
  loaded = null;
}

// ---------------------------------------------------------------------------
// Public payload shapes
// ---------------------------------------------------------------------------

export interface FlightListEntry {
  flight_id: number;
  start_tick_ms: number;
  end_tick_ms: number;
  /** Wall duration from the index ticks, which covers pad dwell as well as
   *  flight — the decoded HR span is the flight-relative one. */
  index_duration_s: number;
  hr_bytes: number;
  lr_bytes: number;
  dirty: boolean;
}

export interface DebriefLoadResult {
  ok: true;
  source: string;
  bin_path: string | null;
  bytes_received: number;
  stopped_early: boolean;
  elapsed_s: number;
  firmware: { git_hash: string; build_sig: string } | null;
  prologue_found: boolean;
  flights: FlightListEntry[];
}

function to_list_entry(e: IndexEntry): FlightListEntry {
  const dirty = e.hr_end_addr === 0xffffffff || e.end_tick_ms === 0xffffffff;
  return {
    flight_id: e.flight_id,
    start_tick_ms: e.start_tick_ms,
    end_tick_ms: e.end_tick_ms,
    index_duration_s: dirty ? 0 : Math.max(0, (e.end_tick_ms - e.start_tick_ms) / 1000),
    hr_bytes: dirty ? 0 : Math.max(0, e.hr_end_addr - e.hr_start_addr),
    lr_bytes: dirty ? 0 : Math.max(0, e.lr_end_addr - e.lr_start_addr),
    dirty,
  };
}

function summarise(img: LoadedImage, extra: Partial<DebriefLoadResult> = {}): DebriefLoadResult {
  return {
    ok: true,
    source: img.source,
    bin_path: img.bin_path,
    bytes_received: 0,
    stopped_early: false,
    elapsed_s: 0,
    firmware: img.prologue
      ? { git_hash: img.prologue.fw_git_hash, build_sig: img.prologue.build_sig }
      : null,
    prologue_found: img.prologue !== null,
    // Newest first: an operator almost always wants the flight they just flew.
    flights: img.index.map(to_list_entry).reverse(),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/** Where a downloaded image lands. Documents rather than userData so the file
 *  is somewhere an operator can find, attach and archive without digging
 *  through an Electron app-data path. */
export function default_log_dir(): string {
  return join(app.getPath('documents'), 'CASPER Flight Logs');
}

function timestamp_name(): string {
  const d = new Date();
  const p = (n: number, w = 2): string => n.toString().padStart(w, '0');
  return (
    `casper3_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.bin`
  );
}

function write_image(image: Uint8Array): string {
  const dir = default_log_dir();
  mkdirSync(dir, { recursive: true });
  const path = join(dir, timestamp_name());
  writeFileSync(path, Buffer.from(image));
  return path;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Pull the chip, write the .bin, and return the flight list.
 *
 * The image is saved before decoding, so even a dump that decodes to nothing
 * leaves a file to re-examine.
 */
export async function download_debrief(
  fc: FcUsb,
  opts: DumpOptions = {},
): Promise<DebriefLoadResult> {
  const result = await run_dump(fc, opts);

  const bin_path = write_image(result.image);
  const { index, prologue } = list_flights(result.image);

  loaded = {
    image: result.image,
    index,
    prologue,
    source: 'Flight computer',
    bin_path,
  };

  return summarise(loaded, {
    bytes_received: result.bytes_received,
    stopped_early: result.stopped_early,
    elapsed_s: result.elapsed_s,
  });
}

/** Load a previously saved .bin (or an MSC raw read — same shape). */
export async function open_debrief_bin(window: BrowserWindow): Promise<
  DebriefLoadResult | { ok: false; error: string; cancelled?: boolean }
> {
  const start_dir = existsSync(default_log_dir()) ? default_log_dir() : undefined;
  const picked = await dialog.showOpenDialog(window, {
    title: 'Open a Casper-3 flash image',
    defaultPath: start_dir,
    filters: [{ name: 'Flash image', extensions: ['bin'] }],
    properties: ['openFile'],
  });
  if (picked.canceled || picked.filePaths.length === 0) {
    return { ok: false, error: 'Cancelled', cancelled: true };
  }
  return load_debrief_file(picked.filePaths[0]);
}

/** Load a .bin from a known path. Split out so it is testable without a dialog. */
export function load_debrief_file(
  path: string,
): DebriefLoadResult | { ok: false; error: string } {
  let raw: Buffer;
  try {
    raw = readFileSync(path);
  } catch (err) {
    return { ok: false, error: `Could not read ${path}: ${err instanceof Error ? err.message : String(err)}` };
  }

  // A short file is padded up to the full flash size rather than rejected:
  // a dump stopped early is a legitimate, decodable image, and the missing
  // tail is genuinely erased space.
  let image: Uint8Array;
  if (raw.length >= LOG_FLASH_END) {
    image = new Uint8Array(raw.buffer, raw.byteOffset, LOG_FLASH_END);
  } else {
    image = blank_flash();
    image.set(new Uint8Array(raw.buffer, raw.byteOffset, raw.length), 0);
  }

  const { index, prologue } = list_flights(image);
  loaded = { image, index, prologue, source: path, bin_path: path };
  return summarise(loaded);
}

export interface FlightDetail {
  ok: true;
  flight_id: number;
  series: FlightSeries;
  warnings: DecodedFlight['warnings'];
  slot2_is_legacy_adxl: boolean;
  state_summary: string[];
}

/**
 * Decode one flight out of the cached image and build its chart series.
 *
 * `window` re-decimates the series over just that time range at full record
 * resolution — that is what makes the charts' drag-zoom reveal detail rather
 * than stretch the points it already had. Statistics stay whole-flight.
 */
export function get_flight_detail(
  flight_id: number,
  window: SeriesWindow | null = null,
): FlightDetail | { ok: false; error: string } {
  if (!loaded) return { ok: false, error: 'No flash image loaded. Download from the FC or open a .bin first.' };

  const i = loaded.index.findIndex((e) => e.flight_id === flight_id);
  if (i < 0) return { ok: false, error: `Flight ${flight_id} is not in this image's index.` };

  const decoded = decode_flight(
    loaded.image,
    loaded.index[i],
    i + 1 < loaded.index.length ? loaded.index[i + 1] : null,
    loaded.prologue,
  );
  const series = build_series(decoded, window);

  return {
    ok: true,
    flight_id,
    series,
    warnings: decoded.warnings,
    slot2_is_legacy_adxl: decoded.slot2_is_legacy_adxl,
    state_summary: series.states.map(
      (s) => `${fsm_name(s.state)} ${s.t_start.toFixed(1)}–${s.t_end.toFixed(1)} s`,
    ),
  };
}

/** Reveal the saved .bin in the OS file manager. */
export function reveal_bin(): boolean {
  if (!loaded?.bin_path) return false;
  shell.showItemInFolder(loaded.bin_path);
  return true;
}

/**
 * Export one stream of one flight as CSV, through a Save dialog.
 *
 * Re-decodes rather than caching the last `get_flight_detail` result: the
 * renderer only ever holds decimated series, and an export must be full
 * resolution. Decoding one flight out of an in-memory image is fast enough
 * that caching it would buy nothing but a staleness bug.
 */
export async function export_flight_csv(
  window: BrowserWindow,
  flight_id: number,
  stream: CsvStream,
): Promise<{ ok: boolean; path?: string; rows?: number; cancelled?: boolean; error?: string }> {
  if (!loaded) return { ok: false, error: 'No flash image loaded.' };

  const i = loaded.index.findIndex((e) => e.flight_id === flight_id);
  if (i < 0) return { ok: false, error: `Flight ${flight_id} is not in this image's index.` };

  const decoded = decode_flight(
    loaded.image,
    loaded.index[i],
    i + 1 < loaded.index.length ? loaded.index[i + 1] : null,
    loaded.prologue,
  );

  // Same rebasing the charts use, so t_s lines up with what was on screen.
  const t0 =
    decoded.hr.length > 0
      ? decoded.hr[0].timestamp_ms
      : decoded.lr.length > 0
        ? decoded.lr[0].timestamp_ms
        : decoded.bmi.length > 0
          ? decoded.bmi[0].timestamp_ms
          : 0;

  let csv: string;
  let rows: number;
  if (stream === 'hr') {
    csv = hr_to_csv(decoded.hr, t0);
    rows = decoded.hr.length;
  } else if (stream === 'lr') {
    csv = lr_to_csv(decoded.lr, t0);
    rows = decoded.lr.length;
  } else {
    csv = bmi_to_csv(decoded.bmi, t0);
    rows = decoded.bmi.length;
  }

  if (rows === 0) {
    return { ok: false, error: `Flight ${flight_id} has no ${stream.toUpperCase()} records to export.` };
  }

  const picked = await dialog.showSaveDialog(window, {
    title: `Export flight ${flight_id} — ${stream.toUpperCase()} records`,
    defaultPath: join(default_log_dir(), `casper3_flight${flight_id}_${stream}.csv`),
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  });
  if (picked.canceled || !picked.filePath) return { ok: false, cancelled: true };

  try {
    mkdirSync(dirname(picked.filePath), { recursive: true });
    writeFileSync(picked.filePath, csv, 'utf-8');
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, path: picked.filePath, rows };
}

export type { DumpProgress };
