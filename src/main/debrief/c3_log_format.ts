/**
 * Casper-3 flash-log format constants and types.
 *
 * This is a SEPARATE format from `src/main/readout/` — that module reads the
 * Casper-2 log (STM32H750, single-byte READOUT_CMD_*, MAGIC_CASP/SUMM/META).
 * Casper-3 logs to a 64 MB W25Q512JV as page-aligned pools with a prologue,
 * an index and a summary region, and is read over the `CDMP` dump protocol.
 * Neither the wire protocol nor the record layouts are shared, so the two
 * live side by side rather than one growing a mode switch.
 *
 * Ground truth for every constant here is the firmware repo:
 *   flight/logging/log_types.h   — flash map + record layouts
 *   flight/app/flight_app.c      — dump region table (s_dump_regions)
 *   tools/casper_decode.py       — the reference decoder this is ported from
 *
 * All multi-byte fields are little-endian.
 *
 * @module debrief/c3_log_format
 */

// ---------------------------------------------------------------------------
// Flash map (log_types.h)
// ---------------------------------------------------------------------------

export const PAGE_SIZE = 256;
export const LOG_FLASH_END = 0x04000000; // 64 MB

export const FLASH_INDEX_BASE = 0x00000000;
export const FLASH_INDEX_SIZE = 0x00001000; // 4 KB
export const FLASH_SUMMARY_BASE = 0x00001000;
export const FLASH_SUMMARY_SIZE = 0x00010000; // 64 KB
export const FLASH_LR_BASE = 0x00011000;
export const FLASH_LR_SIZE = 0x00200000; // 2 MB
export const FLASH_LR_END = FLASH_LR_BASE + FLASH_LR_SIZE;
export const FLASH_BMI_BASE = 0x00211000;
export const FLASH_BMI_SIZE = 0x00680000; // 6.5 MB
export const FLASH_BMI_END = FLASH_BMI_BASE + FLASH_BMI_SIZE;
export const FLASH_PRELAUNCH_BASE = 0x00891000;
export const FLASH_PRELAUNCH_SIZE = 0x02769000; // 39.41 MiB
export const FLASH_HR_BASE = 0x02ffa000;
export const FLASH_PROLOGUE_BASE = 0x03ffa000;
export const FLASH_HR_END = FLASH_PROLOGUE_BASE; // 16 MiB pool
export const PROLOGUE_SLOT_A = 0x03ffa000;
export const PROLOGUE_SLOT_B = 0x03ffb000;

export const PROLOGUE_MAGIC = 0x50524c47; // "PRLG"
export const SUMMARY_MAGIC = 0x43535052; // "CSPR"
export const PROLOGUE_REC_SIZE = 256;
export const SUMMARY_REC_SIZE = 256;
export const INDEX_ENTRY_SIZE = 32;
export const MAX_FLIGHTS = 128;
export const INDEX_DIRTY = 0xffffffff;

// ---------------------------------------------------------------------------
// Record sizes (log_types.h). recs_per_page is exact — no padding.
// ---------------------------------------------------------------------------

export const HR_REC_SIZE = 64;
export const LR_REC_SIZE = 32;
export const BMI_REC_SIZE = 32;
export const HR_RECS_PER_PAGE = PAGE_SIZE / HR_REC_SIZE; // 4
export const LR_RECS_PER_PAGE = PAGE_SIZE / LR_REC_SIZE; // 8
export const BMI_RECS_PER_PAGE = PAGE_SIZE / BMI_REC_SIZE; // 8

/** Log stream slot-2 record tag. Slot 2 held the (never-written) ADXL stream
 *  until 2026-08-27, when it was repurposed for the BMI088. The prologue's
 *  stream[2].rec_type says which a given dump holds, so old dumps still
 *  decode — that is why this is read, not assumed. */
export const LOG_REC_TYPE_HR = 0;
export const LOG_REC_TYPE_LR = 1;
export const LOG_REC_TYPE_ADXL = 2; // retired, legacy dumps only (10 B)
export const LOG_REC_TYPE_BMI = 3;

// ---------------------------------------------------------------------------
// Sensor scales
// ---------------------------------------------------------------------------

/** Raw LSB -> engineering units. Fixed by the part + its configured range,
 *  so these are compile-time facts about the board, not dump metadata (unlike
 *  DEFAULT_QUANT_SCALES below, which the prologue can override). */
export const LSM6_ACCEL_SCALE = 0.000976; // raw -> g   (+-32 g, 16-bit)
export const LSM6_GYRO_SCALE = 0.07; // raw -> dps (+-2000 dps, 16-bit)
export const ADXL_SCALE = 0.1; // raw -> g   (+-200 g, 100 mg/LSB)
export const BMI_ACCEL_SCALE = 1.0 / 1365.0; // raw -> g   (+-24 g, DS Table 4)
export const BMI_GYRO_SCALE = 1.0 / 16.384; // raw -> dps (+-2000 dps, DS Table 2)
export const BARO_SCALE = 2.0 / 100.0; // raw -> hPa (2 Pa/LSB)
export const TEMP_SCALE = 0.01; // raw -> degC

/** Quantisation scales the FC may override per-flight via the prologue.
 *  Used only when no valid prologue slot is found (a pre-S15a dump, or a
 *  chip that has never launched). */
export const DEFAULT_QUANT_SCALES = {
  quat_scale: 2896.309,
  alt_scale_m: 0.01,
  vel_scale_dms: 0.1,
  time_scale_100ms: 0.1,
  batt_offset_v: 6.0,
  batt_step_v: 0.012,
} as const;

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** flight_fsm state ids. 12 (GND_TEST) is not a flight state: a record
 *  stamped 12 was written on the bench, not in the air. */
export const FSM_NAMES: Record<number, string> = {
  0: 'PAD',
  1: 'BOOST',
  2: 'COAST',
  3: 'COAST_1',
  4: 'SUSTAIN',
  5: 'COAST_2',
  6: 'APOGEE',
  7: 'DROGUE',
  8: 'MAIN',
  9: 'RECOVERY',
  10: 'TUMBLE',
  11: 'LANDED',
  12: 'GND_TEST',
};

export function fsm_name(state: number): string {
  return FSM_NAMES[state] ?? `?${state}`;
}

// ---------------------------------------------------------------------------
// Dump regions (flight_app.c s_dump_regions)
// ---------------------------------------------------------------------------

export interface DumpRegionSpec {
  id: number;
  name: string;
  offset: number;
  size: number;
}

/** The regions the firmware offers, in the order it sends them. The FC sends
 *  its own descriptor table at dump time and THAT is authoritative — this
 *  exists to name and size regions in the UI before a dump starts, and to
 *  decide a default selection. */
export const DUMP_REGIONS: DumpRegionSpec[] = [
  { id: 0, name: 'INDEX', offset: FLASH_INDEX_BASE, size: FLASH_INDEX_SIZE },
  { id: 1, name: 'SUMMARY', offset: FLASH_SUMMARY_BASE, size: FLASH_SUMMARY_SIZE },
  { id: 2, name: 'LR', offset: FLASH_LR_BASE, size: FLASH_LR_SIZE },
  { id: 3, name: 'BMI', offset: FLASH_BMI_BASE, size: FLASH_BMI_SIZE },
  { id: 4, name: 'HR', offset: FLASH_HR_BASE, size: FLASH_HR_END - FLASH_HR_BASE },
  {
    id: 5,
    name: 'PROLOGUE+CFG',
    offset: FLASH_PROLOGUE_BASE,
    size: LOG_FLASH_END - FLASH_PROLOGUE_BASE,
  },
  {
    id: 6,
    name: 'PRELAUNCH',
    offset: FLASH_PRELAUNCH_BASE,
    size: FLASH_PRELAUNCH_SIZE,
  },
];

/** Regions 0-5: everything needed to decode a flight whose launch was
 *  detected — ~24.6 MB. Region 6 is the 39.41 MiB PAD-time wrap region, and
 *  is where the WHOLE flight lives only when launch detect missed entirely.
 *  It more than doubles the download, so it is opt-in rather than default;
 *  the UI offers it explicitly for exactly that recovery case. */
export const DEFAULT_DUMP_REGION_IDS = [0, 1, 2, 3, 4, 5];

// ---------------------------------------------------------------------------
// Decoded record types
// ---------------------------------------------------------------------------

/** 64-byte hr_record_t. Raw fields, unscaled — scaling happens in c3_series
 *  so the record stays a faithful image of the bytes on the chip. */
export interface HrRecord {
  timestamp_ms: number;
  baro_pressure: number;
  lsm6_accel: [number, number, number];
  lsm6_gyro: [number, number, number];
  adxl372: [number, number, number];
  mmc: [number, number, number];
  ekf_alt_m: number;
  ekf_vel_mps: number;
  quat_packed: Uint8Array;
  fsm_state: number;
  flags: number;
  ekf_accel_bias: number;
  ekf_baro_bias: number;
  imu_temp: number;
  baro_temp: number;
  seq_num: number;
  sustain_ms: number;
  crc16: number;
  crc_ok: boolean;
}

/** 32-byte lr_record_t. */
export interface LrRecord {
  timestamp_ms: number;
  pyro_state: number;
  pyro_cont_adc: [number, number, number, number];
  radio_rssi: number;
  radio_snr: number;
  radio_tx_count: number;
  radio_rx_count: number;
  radio_fail_count: number;
  gps_dlat_mm: number;
  gps_dlon_mm: number;
  gps_alt_msl_m: number;
  gps_fix: number;
  gps_sats: number;
}

/** 32-byte bmi_record_t. accel[]/gyro[] are RAW LSBs in the BMI088's own
 *  chip frame, which is +90 deg about Z from the LSM6 body frame — rotating
 *  them is the consumer's job, not the parser's. */
export interface BmiRecord {
  timestamp_ms: number;
  accel: [number, number, number];
  gyro: [number, number, number];
  temp: number;
  seq_num: number;
  flags: number;
  crc16: number;
  crc_ok: boolean;
}

export interface IndexEntry {
  flight_id: number;
  start_tick_ms: number;
  end_tick_ms: number;
  hr_start_addr: number;
  hr_end_addr: number;
  lr_start_addr: number;
  lr_end_addr: number;
  bmi_start_addr: number;
  flags: number;
}

export interface PrologueStream {
  id: number;
  rec_type: number;
  rec_ver: number;
  rec_size: number;
  recs_per_page: number;
}

export interface Prologue {
  slot: 'A' | 'B';
  magic: number;
  format_major: number;
  format_minor: number;
  streams: PrologueStream[];
  quat_scale: number;
  alt_scale_m: number;
  vel_scale_dms: number;
  time_scale_100ms: number;
  batt_offset_v: number;
  batt_step_v: number;
  launch_tick: number;
  flight_id: number;
  proto_version: number;
  summary_version: number;
  fw_git_hash: string;
  build_sig: string;
}

/** Why a decode produced fewer records than expected. These are surfaced to
 *  the operator verbatim: an all-zero page is DUMP corruption (re-dump), an
 *  interior erased page is the same, and a wrapped pool is unrecoverable
 *  data loss. Conflating them would tell someone to erase a chip that still
 *  holds their flight. */
export interface DecodeWarning {
  region: string;
  kind: 'zero-pages' | 'interior-blank' | 'pool-wrapped' | 'crc-failures';
  count: number;
  detail: string;
}
