/**
 * Store-specific types for C.A.S.P.E.R. 2 Mission Control telemetry state.
 *
 * Defines the shape of the telemetry snapshot that the TelemetryStore
 * maintains and publishes to all subscribers (renderer, logging, etc.).
 *
 * @module store/store_types
 */

import { FsmState } from '../protocol/types';

// ---------------------------------------------------------------------------
// Pyro channel state
// ---------------------------------------------------------------------------

/** State of a single pyro channel as seen by Mission Control. */
export interface PyroState {
  /** Hardware channel number (1-4). */
  channel: number;
  /** True if the channel is armed. */
  armed: boolean;
  /** True if continuity is detected. */
  continuity: boolean;
  /** True if the channel has fired. */
  fired: boolean;
  /** Role name assigned in MC configuration (not from telemetry). */
  role: string;
  /** Continuity voltage from diagnostics. */
  cont_v: number;
}

// ---------------------------------------------------------------------------
// Event log entry
// ---------------------------------------------------------------------------

/** A single entry in the mission event log. */
export interface EventLogEntry {
  /** Numeric event type code (see EventType enum). */
  type: number;
  /** Human-readable event description. */
  type_name: string;
  /** Event-specific data payload. */
  data: number;
  /** Flight time in seconds when the event occurred on the FC. */
  flight_time_s: number;
  /** Local wall-clock timestamp (Date.now()) when this event was received. */
  arrival_timestamp: number;
}

// ---------------------------------------------------------------------------
// Telemetry snapshot
// ---------------------------------------------------------------------------

/**
 * Complete telemetry snapshot — the single source of truth for all
 * real-time data displayed in Mission Control.
 *
 * Updated atomically by the TelemetryStore on each incoming packet.
 */
export interface TelemetrySnapshot {
  // --- Connection state ---
  /** True if FC USB link is connected. */
  fc_conn: boolean;
  /** True if GS USB link is connected. */
  gs_conn: boolean;
  /** True if protocol handshake succeeded. */
  protocol_ok: boolean;
  /** FC firmware version string, or null if unknown. */
  fw_version: string | null;
  /** FC configuration hash, or null if unknown. */
  config_hash: number | null;
  /** True if config_hash matches the MC-side config. */
  config_hash_verified: boolean;

  // --- Telemetry (10 Hz) ---
  /** Altitude in metres AGL. */
  alt_m: number;
  /** Velocity in m/s (positive = up). */
  vel_mps: number;
  /** Attitude quaternion [w, x, y, z]. */
  quat: [number, number, number, number];
  /** Roll angle in degrees. */
  roll_deg: number;
  /** Pitch angle in degrees. */
  pitch_deg: number;
  /** Yaw angle in degrees. */
  yaw_deg: number;
  /** Mach number. */
  mach: number;
  /** Dynamic pressure in Pascals. */
  qbar_pa: number;
  /** Battery voltage in volts. */
  batt_v: number;
  /** Current flight state machine state. */
  fsm_state: FsmState;
  /** Flight time in seconds. */
  flight_time_s: number;
  /** Packet sequence number (rolling). */
  seq: number;

  // --- Pyro (from FC_TLM_STATUS) ---
  /** State of all 4 pyro channels. */
  pyro: [PyroState, PyroState, PyroState, PyroState];

  // --- GPS (1-5 Hz) ---
  /** Delta latitude from pad origin in metres. */
  gps_dlat_m: number;
  /** Delta longitude from pad origin in metres. */
  gps_dlon_m: number;
  /** GPS altitude MSL in metres. */
  gps_alt_msl_m: number;
  /** GPS altitude AGL in metres. */
  gps_alt_agl_m: number;
  /** GPS fix type (0=none, 2=2D, 3=3D). */
  gps_fix: number;
  /** Number of satellites in use. */
  gps_sats: number;
  /** Position dilution of precision. */
  gps_pdop: number;
  /** True if a range field saturated its encoding. */
  gps_range_saturated: boolean;

  // --- Link quality ---
  /** Received signal strength in dBm. */
  rssi_dbm: number;
  /** Signal-to-noise ratio in dB. */
  snr_db: number;
  /** Frequency error in Hz. */
  freq_err_hz: number;
  /** Milliseconds since last valid FC packet. */
  data_age_ms: number;
  /** True if data_age_ms exceeds STALE_THRESHOLD_MS. */
  stale: boolean;
  /** Duration in ms that data has been stale (0 if not stale). */
  stale_since_ms: number;
  /** True if the last packet was recovered via error correction. */
  recovery_flag: boolean;
  /** Recovery method code. */
  recovery_method: number;
  /** Recovery confidence (0-100). */
  recovery_confidence: number;

  // --- Packet stats (1 Hz) ---
  /** Total packets received. */
  pkt_rx_count: number;
  /** Total packets lost. */
  pkt_lost: number;
  /** Link integrity percentage. */
  integrity_pct: number;
  /** GS battery voltage in volts. */
  gs_batt_v: number;
  /** GS temperature in degrees Celsius. */
  gs_temp_c: number;
  /** Active radio profile index. */
  radio_profile: number;

  // --- Flags ---
  /** True if the FC has flagged a system error. */
  sys_error: boolean;
  /** Peak altitude at apogee in metres (set by Apogee event). */
  apogee_alt_m: number;

  // --- Ring buffers (last RING_BUFFER_DEPTH samples) ---
  /** Altitude history. */
  buf_alt: number[];
  /** Velocity history. */
  buf_vel: number[];
  /** Dynamic pressure history. */
  buf_qbar: number[];

  // --- Event log ---
  /** Chronological list of all mission events received. */
  events: EventLogEntry[];
}

// ---------------------------------------------------------------------------
// Default snapshot
// ---------------------------------------------------------------------------

/** Factory function for a default PyroState. */
function default_pyro(channel: number): PyroState {
  return {
    channel,
    armed: false,
    continuity: false,
    fired: false,
    role: '',
    cont_v: 0
  };
}

/**
 * Default telemetry snapshot with sensible initial values.
 *
 * All numeric fields are 0, booleans false, quat is identity [1,0,0,0],
 * FSM state is Pad, and all arrays are empty.
 */
export const DEFAULT_SNAPSHOT: TelemetrySnapshot = {
  // Connection state
  fc_conn: false,
  gs_conn: false,
  protocol_ok: false,
  fw_version: null,
  config_hash: null,
  config_hash_verified: false,

  // Telemetry (10 Hz)
  alt_m: 0,
  vel_mps: 0,
  quat: [1, 0, 0, 0],
  roll_deg: 0,
  pitch_deg: 0,
  yaw_deg: 0,
  mach: 0,
  qbar_pa: 0,
  batt_v: 0,
  fsm_state: FsmState.Pad,
  flight_time_s: 0,
  seq: 0,

  // Pyro
  pyro: [
    default_pyro(1),
    default_pyro(2),
    default_pyro(3),
    default_pyro(4)
  ],

  // GPS
  gps_dlat_m: 0,
  gps_dlon_m: 0,
  gps_alt_msl_m: 0,
  gps_alt_agl_m: 0,
  gps_fix: 0,
  gps_sats: 0,
  gps_pdop: 0,
  gps_range_saturated: false,

  // Link quality
  rssi_dbm: 0,
  snr_db: 0,
  freq_err_hz: 0,
  data_age_ms: 0,
  stale: false,
  stale_since_ms: 0,
  recovery_flag: false,
  recovery_method: 0,
  recovery_confidence: 0,

  // Packet stats
  pkt_rx_count: 0,
  pkt_lost: 0,
  integrity_pct: 0,
  gs_batt_v: 0,
  gs_temp_c: 0,
  radio_profile: 0,

  // Flags
  sys_error: false,
  apogee_alt_m: 0,

  // Ring buffers
  buf_alt: [],
  buf_vel: [],
  buf_qbar: [],

  // Events
  events: []
};
