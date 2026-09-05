/**
 * Casper-3 flash-image decoder — TypeScript port of `tools/casper_decode.py`
 * (firmware repo) for the parts a flight debrief needs.
 *
 * Input is a sparse 64 MB image: the dump writes each region at its true
 * flash offset and leaves everything unfetched at 0xFF, so a partial dump
 * (regions 0-5, no PRELAUNCH) decodes exactly like a full one — unread gaps
 * read as erased, which is what they are.
 *
 * Deliberately NOT ported: Hamming SECDED correction. HR records carry both
 * a SECDED word and a CRC16; this verifies the CRC and reports failures
 * rather than silently repairing single-bit errors. A debrief should show
 * you that the data is damaged, not quietly hand you corrected numbers.
 *
 * @module debrief/c3_decode
 */

import {
  PAGE_SIZE,
  LOG_FLASH_END,
  FLASH_INDEX_BASE,
  FLASH_INDEX_SIZE,
  FLASH_SUMMARY_BASE,
  FLASH_LR_END,
  FLASH_BMI_END,
  FLASH_HR_END,
  PROLOGUE_SLOT_A,
  PROLOGUE_SLOT_B,
  PROLOGUE_MAGIC,
  PROLOGUE_REC_SIZE,
  SUMMARY_MAGIC,
  SUMMARY_REC_SIZE,
  INDEX_ENTRY_SIZE,
  MAX_FLIGHTS,
  INDEX_DIRTY,
  HR_REC_SIZE,
  LR_REC_SIZE,
  BMI_REC_SIZE,
  HR_RECS_PER_PAGE,
  LR_RECS_PER_PAGE,
  BMI_RECS_PER_PAGE,
  LOG_REC_TYPE_BMI,
  DEFAULT_QUANT_SCALES,
  type HrRecord,
  type LrRecord,
  type BmiRecord,
  type IndexEntry,
  type Prologue,
  type PrologueStream,
  type DecodeWarning,
} from './c3_log_format';

// ---------------------------------------------------------------------------
// Little-endian readers
// ---------------------------------------------------------------------------

const u8 = (b: Uint8Array, o: number): number => b[o];
const u16 = (b: Uint8Array, o: number): number => b[o] | (b[o + 1] << 8);
const i16 = (b: Uint8Array, o: number): number => (u16(b, o) << 16) >> 16;
const i8 = (b: Uint8Array, o: number): number => (b[o] << 24) >> 24;
const u32 = (b: Uint8Array, o: number): number =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const i32 = (b: Uint8Array, o: number): number =>
  b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24);

function f32(b: Uint8Array, o: number): number {
  // Copy rather than aliasing b.buffer: a Uint8Array view can start at a
  // non-zero byteOffset, and Float32Array demands 4-byte alignment.
  const tmp = new Uint8Array(4);
  tmp.set(b.subarray(o, o + 4));
  return new DataView(tmp.buffer).getFloat32(0, true);
}

function ascii_z(b: Uint8Array, o: number, len: number): string {
  let end = o;
  const stop = o + len;
  while (end < stop && b[end] !== 0) end++;
  let s = '';
  for (let i = o; i < end; i++) s += String.fromCharCode(b[i]);
  return s;
}

// ---------------------------------------------------------------------------
// Checksums
// ---------------------------------------------------------------------------

/** CRC16-CCITT (poly 0x1021, init 0xFFFF), matching hamming.c / casper_decode. */
export function crc16_ccitt(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

const CRC32_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** zlib-compatible CRC32 — the prologue and summary are sealed with it. */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC32_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Page classification
// ---------------------------------------------------------------------------

function is_erased(b: Uint8Array, from: number, len: number): boolean {
  const end = from + len;
  for (let i = from; i < end; i++) if (b[i] !== 0xff) return false;
  return true;
}

/** All 0x00 — a state NOR flash never reaches on its own. Erase gives 0xFF
 *  and the firmware programs records, never zeros, so an all-zero page means
 *  the DUMP is corrupt: a Fast Read issued while the die was busy returns
 *  zeros. Such a page parses into fabricated records that pass a SECDED
 *  check trivially, which is exactly why it is detected and skipped. */
function is_zeroed(b: Uint8Array, from: number, len: number): boolean {
  const end = from + len;
  for (let i = from; i < end; i++) if (b[i] !== 0x00) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Record parsers
// ---------------------------------------------------------------------------

export function parse_hr_record(r: Uint8Array): HrRecord {
  return {
    timestamp_ms: u32(r, 0),
    baro_pressure: u16(r, 4),
    lsm6_accel: [i16(r, 6), i16(r, 8), i16(r, 10)],
    lsm6_gyro: [i16(r, 12), i16(r, 14), i16(r, 16)],
    adxl372: [i16(r, 18), i16(r, 20), i16(r, 22)],
    mmc: [u16(r, 24), u16(r, 26), u16(r, 28)],
    ekf_alt_m: f32(r, 30),
    ekf_vel_mps: f32(r, 34),
    quat_packed: r.slice(38, 43),
    fsm_state: u8(r, 43),
    flags: u8(r, 44),
    ekf_accel_bias: i16(r, 45),
    ekf_baro_bias: i16(r, 47),
    imu_temp: i16(r, 49),
    baro_temp: i16(r, 51),
    seq_num: u16(r, 53),
    sustain_ms: u16(r, 55),
    crc16: u16(r, 62),
    crc_ok: crc16_ccitt(r.subarray(0, 62)) === u16(r, 62),
  };
}

export function parse_lr_record(r: Uint8Array): LrRecord {
  const fix_sats = u8(r, 31);
  return {
    timestamp_ms: u32(r, 0),
    pyro_state: u8(r, 4),
    pyro_cont_adc: [u16(r, 5), u16(r, 7), u16(r, 9), u16(r, 11)],
    radio_rssi: i8(r, 13),
    radio_snr: i8(r, 14),
    radio_tx_count: u16(r, 15),
    radio_rx_count: u16(r, 17),
    radio_fail_count: u16(r, 19),
    gps_dlat_mm: i32(r, 21),
    gps_dlon_mm: i32(r, 25),
    gps_alt_msl_m: i16(r, 29),
    gps_fix: (fix_sats >> 4) & 0x0f,
    gps_sats: fix_sats & 0x0f,
  };
}

export function parse_bmi_record(r: Uint8Array): BmiRecord {
  return {
    timestamp_ms: u32(r, 0),
    accel: [i16(r, 4), i16(r, 6), i16(r, 8)],
    gyro: [i16(r, 10), i16(r, 12), i16(r, 14)],
    temp: i16(r, 16),
    seq_num: u16(r, 18),
    flags: u8(r, 28),
    crc16: u16(r, 30),
    crc_ok: crc16_ccitt(r.subarray(0, 30)) === u16(r, 30),
  };
}

export function parse_index_entry(d: Uint8Array): IndexEntry {
  return {
    flight_id: u16(d, 0),
    start_tick_ms: u32(d, 2),
    end_tick_ms: u32(d, 6),
    hr_start_addr: u32(d, 10),
    hr_end_addr: u32(d, 14),
    lr_start_addr: u32(d, 18),
    lr_end_addr: u32(d, 22),
    bmi_start_addr: u32(d, 26),
    flags: u16(d, 30),
  };
}

export function parse_prologue(d: Uint8Array, slot: 'A' | 'B'): Prologue {
  const streams: PrologueStream[] = [];
  for (let i = 0; i < 3; i++) {
    const o = 8 + i * 8;
    streams.push({
      id: u8(d, o),
      rec_type: u8(d, o + 1),
      rec_ver: u8(d, o + 2),
      rec_size: u16(d, o + 4),
      recs_per_page: u16(d, o + 6),
    });
  }
  return {
    slot,
    magic: u32(d, 0),
    format_major: u8(d, 4),
    format_minor: u8(d, 5),
    streams,
    quat_scale: f32(d, 32),
    alt_scale_m: f32(d, 36),
    vel_scale_dms: f32(d, 40),
    time_scale_100ms: f32(d, 44),
    batt_offset_v: f32(d, 48),
    batt_step_v: f32(d, 52),
    launch_tick: u32(d, 64),
    flight_id: u16(d, 68),
    proto_version: u8(d, 72),
    summary_version: u8(d, 73),
    fw_git_hash: ascii_z(d, 76, 20),
    build_sig: ascii_z(d, 96, 16),
  };
}

/**
 * Read and validate both prologue slots, returning the freshest valid one.
 *
 * The prologue carries the quantisation scales a decode depends on, so a
 * dump without it falls back to DEFAULT_QUANT_SCALES — correct for current
 * firmware, but not a substitute if the FC ever changes a scale.
 */
export function read_prologue(flash: Uint8Array): Prologue | null {
  const candidates: Prologue[] = [];
  for (const [slot, addr] of [
    ['A', PROLOGUE_SLOT_A],
    ['B', PROLOGUE_SLOT_B],
  ] as const) {
    if (addr + PROLOGUE_REC_SIZE > flash.length) continue;
    if (is_erased(flash, addr, PROLOGUE_REC_SIZE)) continue;
    const d = flash.subarray(addr, addr + PROLOGUE_REC_SIZE);
    const p = parse_prologue(d, slot);
    if (p.magic !== PROLOGUE_MAGIC) continue;
    if (crc32(d.subarray(0, 252)) !== u32(d, 252)) continue;
    candidates.push(p);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.launch_tick - b.launch_tick);
  return candidates[candidates.length - 1];
}

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

/** Every non-erased, non-dirty index entry, oldest first. */
export function read_index(flash: Uint8Array): IndexEntry[] {
  const out: IndexEntry[] = [];
  const limit = Math.min(MAX_FLIGHTS, FLASH_INDEX_SIZE / INDEX_ENTRY_SIZE);
  for (let i = 0; i < limit; i++) {
    const addr = FLASH_INDEX_BASE + i * INDEX_ENTRY_SIZE;
    if (addr + INDEX_ENTRY_SIZE > flash.length) break;
    if (is_erased(flash, addr, INDEX_ENTRY_SIZE)) continue;
    const e = parse_index_entry(flash.subarray(addr, addr + INDEX_ENTRY_SIZE));
    // A dirty entry is a flight that was opened and never closed (power
    // pulled mid-flight). Its start addresses are still good, so keep it —
    // the pool-end fallback in extract_records handles the missing end.
    if (e.flight_id === 0xffff && e.start_tick_ms === INDEX_DIRTY) continue;
    out.push(e);
  }
  return out;
}

/** Flight summaries that carry a valid magic + CRC32, keyed by flight_id. */
export function read_summaries(flash: Uint8Array): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  for (let addr = FLASH_SUMMARY_BASE; addr + SUMMARY_REC_SIZE <= FLASH_LR_END; addr += SUMMARY_REC_SIZE) {
    if (addr + SUMMARY_REC_SIZE > flash.length) break;
    if (is_erased(flash, addr, SUMMARY_REC_SIZE)) continue;
    const d = flash.subarray(addr, addr + SUMMARY_REC_SIZE);
    if (u32(d, 0) !== SUMMARY_MAGIC) continue;
    if (crc32(d.subarray(0, 252)) !== u32(d, 252)) continue;
    out.set(u16(d, 8), d);
    if (out.size > MAX_FLIGHTS) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Record extraction
// ---------------------------------------------------------------------------

export interface ExtractResult<T> {
  records: T[];
  warnings: DecodeWarning[];
}

/**
 * Walk a pool page by page, skipping erased and corrupt pages.
 *
 * `pool_end` is the hard end of the pool the span lives in. It matters only
 * for the wrapped case: firmware older than the wrap->STOP change let a full
 * pool return to its base and NOR-AND new records over the oldest ones, which
 * for a linear pool are the launch and boost records. The index then stores
 * end < start, and a naive `addr < end_addr` loop yields ZERO records with no
 * warning at all — the failure this function exists to make loud.
 */
export function extract_records<T>(
  flash: Uint8Array,
  start_addr: number,
  end_addr: number,
  rec_size: number,
  recs_per_page: number,
  parser: (r: Uint8Array) => T,
  pool_end: number,
  region_name: string,
): ExtractResult<T> {
  const warnings: DecodeWarning[] = [];
  const records: T[] = [];

  if (end_addr < start_addr) {
    warnings.push({
      region: region_name,
      kind: 'pool-wrapped',
      count: 1,
      detail:
        `Pool wrapped (start 0x${start_addr.toString(16)} > end 0x${end_addr.toString(16)}). ` +
        `Records from the pool base up to the end address were overwritten and are NOT recoverable — ` +
        `for a linear pool that is the START of the flight. Decoding the surviving tail only.`,
    });
    end_addr = pool_end;
  }

  const hard_end = Math.min(end_addr, flash.length);
  let zero_pages = 0;
  let interior_blank = 0;
  let pending_blank = 0;
  let crc_fail = 0;

  for (let addr = start_addr; addr < hard_end; addr += PAGE_SIZE) {
    if (is_erased(flash, addr, PAGE_SIZE)) {
      pending_blank++;
      continue;
    }
    if (is_zeroed(flash, addr, PAGE_SIZE)) {
      zero_pages++;
      continue;
    }
    interior_blank += pending_blank;
    pending_blank = 0;

    for (let slot = 0; slot < recs_per_page; slot++) {
      const off = addr + slot * rec_size;
      if (is_erased(flash, off, rec_size)) continue;
      // HR pads a partial page with seq_num = 0xFFFF rather than leaving it
      // erased, so the erased-slot test above does not catch it.
      if (rec_size === HR_REC_SIZE && u16(flash, off + 53) === 0xffff) continue;
      const rec = parser(flash.subarray(off, off + rec_size));
      if ((rec as { crc_ok?: boolean }).crc_ok === false) crc_fail++;
      records.push(rec);
    }
  }

  if (zero_pages > 0) {
    warnings.push({
      region: region_name,
      kind: 'zero-pages',
      count: zero_pages,
      detail:
        `${zero_pages} all-zero page(s) inside the written span (~${zero_pages * recs_per_page} records). ` +
        `NOR erases to 0xFF and the firmware never programs 0x00, so this is DUMP corruption, not a logging ` +
        `fault — the flash was read while the logger was writing to it. THE DATA IS STILL ON THE CHIP: re-dump, do not erase.`,
    });
  }
  if (interior_blank > 0) {
    warnings.push({
      region: region_name,
      kind: 'interior-blank',
      count: interior_blank,
      detail:
        `${interior_blank} erased page(s) INSIDE the written span (~${interior_blank * recs_per_page} records unreadable). ` +
        `Same cause as all-zero pages: a dump that raced the logger. Re-dump, do not erase.`,
    });
  }
  if (crc_fail > 0) {
    warnings.push({
      region: region_name,
      kind: 'crc-failures',
      count: crc_fail,
      detail:
        `${crc_fail} record(s) failed CRC16 and are kept but flagged. Isolated failures are bit rot in one ` +
        `record; a large run usually means the span bounds are wrong rather than the data being bad.`,
    });
  }

  return { records, warnings };
}

// ---------------------------------------------------------------------------
// Whole-flight decode
// ---------------------------------------------------------------------------

export interface DecodedFlight {
  index: IndexEntry;
  prologue: Prologue | null;
  scales: typeof DEFAULT_QUANT_SCALES;
  hr: HrRecord[];
  lr: LrRecord[];
  bmi: BmiRecord[];
  /** True when slot 2 held the retired 10-byte ADXL stream, not the BMI088.
   *  Such a dump decodes without a BMI series rather than misreading it. */
  slot2_is_legacy_adxl: boolean;
  warnings: DecodeWarning[];
}

/**
 * Decode one flight's three streams using its index entry for the spans.
 *
 * BMI has no end address in the index (the entry predates the stream), so it
 * is bounded by the next flight's start where one exists and the pool end
 * otherwise — which over-reads into the following flight only if the index
 * is inconsistent, and under-reads never.
 */
export function decode_flight(
  flash: Uint8Array,
  index: IndexEntry,
  next_index: IndexEntry | null,
  prologue: Prologue | null,
): DecodedFlight {
  const scales = prologue
    ? {
        quat_scale: prologue.quat_scale,
        alt_scale_m: prologue.alt_scale_m,
        vel_scale_dms: prologue.vel_scale_dms,
        time_scale_100ms: prologue.time_scale_100ms,
        batt_offset_v: prologue.batt_offset_v,
        batt_step_v: prologue.batt_step_v,
      }
    : { ...DEFAULT_QUANT_SCALES };

  const slot2 = prologue?.streams?.[2];
  const slot2_is_legacy_adxl = slot2 != null && slot2.rec_type !== LOG_REC_TYPE_BMI;

  const warnings: DecodeWarning[] = [];

  const hr = extract_records(
    flash,
    index.hr_start_addr,
    index.hr_end_addr,
    HR_REC_SIZE,
    HR_RECS_PER_PAGE,
    parse_hr_record,
    FLASH_HR_END,
    'HR',
  );
  warnings.push(...hr.warnings);

  const lr = extract_records(
    flash,
    index.lr_start_addr,
    index.lr_end_addr,
    LR_REC_SIZE,
    LR_RECS_PER_PAGE,
    parse_lr_record,
    FLASH_LR_END,
    'LR',
  );
  warnings.push(...lr.warnings);

  let bmi: ExtractResult<BmiRecord> = { records: [], warnings: [] };
  if (!slot2_is_legacy_adxl) {
    const bmi_end = next_index ? next_index.bmi_start_addr : FLASH_BMI_END;
    bmi = extract_records(
      flash,
      index.bmi_start_addr,
      bmi_end,
      BMI_REC_SIZE,
      BMI_RECS_PER_PAGE,
      parse_bmi_record,
      FLASH_BMI_END,
      'BMI',
    );
    warnings.push(...bmi.warnings);
  }

  return {
    index,
    prologue,
    scales,
    hr: hr.records,
    lr: lr.records,
    bmi: bmi.records,
    slot2_is_legacy_adxl,
    warnings,
  };
}

/** Flights present in an image, newest last, with prologue already resolved. */
export function list_flights(flash: Uint8Array): {
  index: IndexEntry[];
  prologue: Prologue | null;
  summaries: Map<number, Uint8Array>;
} {
  return {
    index: read_index(flash),
    prologue: read_prologue(flash),
    summaries: read_summaries(flash),
  };
}

/** An all-0xFF image of the full flash, the substrate a sparse dump fills in. */
export function blank_flash(size: number = LOG_FLASH_END): Uint8Array {
  return new Uint8Array(size).fill(0xff);
}
