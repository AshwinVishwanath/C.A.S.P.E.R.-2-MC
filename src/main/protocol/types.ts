/**
 * Protocol types for C.A.S.P.E.R. 2 Mission Control.
 *
 * Defines all TypeScript types, enums, and interfaces used by the protocol
 * layer for communication between the ground station (GS) and flight
 * computer (FC).
 *
 * @module protocol/types
 */

// ---------------------------------------------------------------------------
// FSM States (4-bit, from FC_FSM_STATE — PRD Section 4.2)
// ---------------------------------------------------------------------------

/** Flight state machine states reported by the FC. */
export enum FsmState {
  Pad = 0x0,
  Boost = 0x1,
  Coast = 0x2,
  Coast1 = 0x3,
  Sustain = 0x4,
  Coast2 = 0x5,
  Apogee = 0x6,
  Drogue = 0x7,
  Main = 0x8,
  Recovery = 0x9,
  Tumble = 0xA,
  Landed = 0xB
}

/** Human-readable names for each FSM state. */
export const FSM_STATE_NAMES: Record<FsmState, string> = {
  [FsmState.Pad]: 'PAD',
  [FsmState.Boost]: 'BOOST',
  [FsmState.Coast]: 'COAST',
  [FsmState.Coast1]: 'COAST_1',
  [FsmState.Sustain]: 'SUSTAIN',
  [FsmState.Coast2]: 'COAST_2',
  [FsmState.Apogee]: 'APOGEE',
  [FsmState.Drogue]: 'DROGUE',
  [FsmState.Main]: 'MAIN',
  [FsmState.Recovery]: 'RECOVERY',
  [FsmState.Tumble]: 'TUMBLE',
  [FsmState.Landed]: 'LANDED'
};

// ---------------------------------------------------------------------------
// NACK error codes (PRD Section 17.5)
// ---------------------------------------------------------------------------

/** Error codes returned in NACK messages from the FC. */
export enum NackError {
  CrcFail = 0x01,
  BadState = 0x02,
  NotArmed = 0x03,
  NoTestMode = 0x04,
  NonceReuse = 0x05,
  NoContinuity = 0x06,
  LowBattery = 0x07,
  SelfTest = 0x08,
  CfgTooLarge = 0x09,
  FlashFail = 0x0A
}

// ---------------------------------------------------------------------------
// Event types (PRD Section 4.5)
// ---------------------------------------------------------------------------

/** Types of events reported in FC_MSG_EVENT packets. */
export enum EventType {
  State = 0x01,
  Pyro = 0x02,
  Apogee = 0x03,
  Error = 0x04,
  Origin = 0x05,
  Burnout = 0x06,
  Staging = 0x07,
  Arm = 0x08
}

// ---------------------------------------------------------------------------
// FC telemetry status bitmap (PRD Section 4.2)
// ---------------------------------------------------------------------------

/** Decoded FC_TLM_STATUS bitmap. */
export interface FcTlmStatus {
  /** Continuity detected on each of the 4 pyro channels. */
  continuity: [boolean, boolean, boolean, boolean];
  /** Arm state of each of the 4 pyro channels. */
  armed: [boolean, boolean, boolean, boolean];
  /** Current flight state machine state. */
  fsm_state: FsmState;
  /** True if any pyro channel has fired. */
  fired: boolean;
  /** True if the FC has flagged an error condition. */
  error: boolean;
}

// ---------------------------------------------------------------------------
// FC direct messages (PRD Section 4)
// ---------------------------------------------------------------------------

/** FC_MSG_FAST — high-rate telemetry packet (msg_id 0x01). */
export interface FcMsgFast {
  msg_id: number;
  status: FcTlmStatus;
  /** Altitude in metres. FC_TLM_ALT * 10.0 */
  alt_m: number;
  /** Velocity in m/s (signed). FC_TLM_VEL * 0.1 */
  vel_mps: number;
  /** Attitude quaternion [w, x, y, z]. */
  quat: [number, number, number, number];
  /** Flight time in seconds. FC_FSM_TIME * 0.1 */
  flight_time_s: number;
  /** Battery voltage in volts. 6.0 + FC_PWR_BATT * 0.012 */
  batt_v: number;
  /** Sequence number (rolling). */
  seq: number;
  /** True if CRC verified OK. */
  crc_ok: boolean;
  /** True if Stage 1 CRC correction was applied. */
  corrected: boolean;
}

/** FC_MSG_GPS — GPS position packet (msg_id 0x02). */
export interface FcMsgGps {
  msg_id: number;
  /** Delta latitude from pad origin in metres. */
  dlat_m: number;
  /** Delta longitude from pad origin in metres. */
  dlon_m: number;
  /** Altitude MSL in metres. FC_GPS_ALT * 10.0 */
  alt_msl_m: number;
  /** GPS fix type (0=none, 2=2D, 3=3D). */
  fix_type: number;
  /** Number of satellites in use. */
  sat_count: number;
  /** Position dilution of precision. */
  pdop: number;
  /** True if a range field saturated its encoding. */
  range_saturated: boolean;
  /** True if CRC verified OK. */
  crc_ok: boolean;
}

/** FC_MSG_EVENT — discrete event notification (msg_id 0x03). */
export interface FcMsgEvent {
  msg_id: number;
  /** Event type code (see EventType enum). */
  event_type: number;
  /** Event-specific data payload. */
  event_data: number;
  /** Flight time in seconds when the event occurred. */
  flight_time_s: number;
  /** True if CRC verified OK. */
  crc_ok: boolean;
}

// ---------------------------------------------------------------------------
// GS relay messages (PRD Section 5)
// ---------------------------------------------------------------------------

/** GS_MSG_TELEM — ground station telemetry relay (msg_id 0x10). */
export interface GsMsgTelem {
  msg_id: number;
  // --- FC fields (relayed) ---
  status: FcTlmStatus;
  /** Altitude in metres. */
  alt_m: number;
  /** Velocity in m/s. */
  vel_mps: number;
  /** Attitude quaternion [w, x, y, z]. */
  quat: [number, number, number, number];
  /** Flight time in seconds. */
  flight_time_s: number;
  /** Battery voltage in volts. */
  batt_v: number;
  /** Sequence number (rolling). */
  seq: number;
  // --- GS derived fields ---
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
  /** Recovery information from GS error correction. */
  recovery: { recovered: boolean; method: number; confidence: number };
  /** Mach number (GS-computed). */
  mach: number;
  /** Dynamic pressure in Pa (GS-computed). */
  qbar_pa: number;
  /** Roll angle in degrees (GS-computed). */
  roll_deg: number;
  /** Pitch angle in degrees (GS-computed). */
  pitch_deg: number;
  /** Yaw angle in degrees (GS-computed). */
  yaw_deg: number;
  /** True if CRC verified OK. */
  crc_ok: boolean;
}

/** GS_MSG_GPS — stub for future GS GPS relay (msg_id 0x11). */
export interface GsMsgGps {
  msg_id: number;
  raw: Uint8Array;
}

/** GS_MSG_EVENT — stub for future GS event relay (msg_id 0x12). */
export interface GsMsgEvent {
  msg_id: number;
  raw: Uint8Array;
}

/** GS_MSG_STATUS — stub for future GS status message (msg_id 0x13). */
export interface GsMsgStatus {
  msg_id: number;
  raw: Uint8Array;
}

/** GS_MSG_CORRUPT — stub for corrupted GS message (msg_id 0x14). */
export interface GsMsgCorrupt {
  msg_id: number;
  raw: Uint8Array;
}

// ---------------------------------------------------------------------------
// Command acknowledgement / response messages (PRD Section 17)
// ---------------------------------------------------------------------------

/** ACK_ARM — arm/disarm acknowledgement (msg_id 0xA0). */
export interface AckArm {
  msg_id: number;
  /** Echoed nonce from the original ARM command. */
  nonce: number;
  /** Echoed channel number. */
  echo_channel: number;
  /** Echoed action (1=arm, 0=disarm). */
  echo_action: number;
  /** Current arm state bitmap. */
  arm_state: number;
  /** Current continuity state bitmap. */
  cont_state: number;
  /** True if CRC verified OK. */
  crc_ok: boolean;
}

/** ACK_FIRE — fire acknowledgement (msg_id 0xA1). */
export interface AckFire {
  msg_id: number;
  /** Echoed nonce from the original FIRE command. */
  nonce: number;
  /** Echoed channel number. */
  echo_channel: number;
  /** Echoed fire duration in ms. */
  echo_duration: number;
  /** True if test mode was active. */
  test_mode: boolean;
  /** True if the channel was armed when fired. */
  channel_armed: boolean;
  /** Current continuity state bitmap. */
  cont_state: number;
  /** True if CRC verified OK. */
  crc_ok: boolean;
}

/** NACK — negative acknowledgement (msg_id 0xE0). */
export interface Nack {
  msg_id: number;
  /** Echoed nonce from the rejected command. */
  nonce: number;
  /** Error code (see NackError enum). */
  error_code: NackError;
  /** True if CRC verified OK. */
  crc_ok: boolean;
}

/** ACK_CONFIG — configuration acknowledgement (msg_id 0xA3). */
export interface AckConfig {
  msg_id: number;
  /** Echoed nonce from the CONFIG command. */
  nonce: number;
  /** Hash of the accepted configuration. */
  config_hash: number;
  /** Protocol version supported by the FC. */
  protocol_version: number;
  /** True if CRC verified OK. */
  crc_ok: boolean;
}

// ---------------------------------------------------------------------------
// Discriminated union of all parsed message types
// ---------------------------------------------------------------------------

/** Discriminated union of every message type the parser can return. */
export type ParsedMessage =
  | { type: 'fc_fast'; data: FcMsgFast }
  | { type: 'fc_gps'; data: FcMsgGps }
  | { type: 'fc_event'; data: FcMsgEvent }
  | { type: 'gs_telem'; data: GsMsgTelem }
  | { type: 'gs_gps'; data: GsMsgGps }
  | { type: 'gs_event'; data: GsMsgEvent }
  | { type: 'gs_status'; data: GsMsgStatus }
  | { type: 'gs_corrupt'; data: GsMsgCorrupt }
  | { type: 'ack_arm'; data: AckArm }
  | { type: 'ack_fire'; data: AckFire }
  | { type: 'ack_config'; data: AckConfig }
  | { type: 'nack'; data: Nack }
  | { type: 'confirm'; data: { nonce: number; crc_ok: boolean } }
  | { type: 'unknown'; msg_id: number; raw: Uint8Array };

/** Result of parsing a raw packet. */
export type ParseResult =
  | { ok: true; message: ParsedMessage }
  | { ok: false; error: string; msg_id?: number };

// ---------------------------------------------------------------------------
// Flight configuration types (PRD Section 18)
// ---------------------------------------------------------------------------

/** Pyro channel role assignment. */
export type PyroRole =
  | 'Apogee'
  | 'Apogee Backup'
  | 'Main'
  | 'Main Backup'
  | 'Ignition'
  | 'Ignition Backup'
  | 'Custom';

/** Configuration for a single pyro channel. */
export interface PyroChannelConfig {
  /** Hardware channel index (0-3). */
  hw_channel: number;
  /** Deployment role. */
  role: PyroRole;
  /** Altitude data source for deployment logic. */
  altitude_source: 'ekf' | 'baro';
  /** Fire duration in seconds. */
  fire_duration_s: number;
  /** Deploy altitude AGL in metres (for Main/Custom roles). */
  deploy_alt_m?: number;
  /** Delay after apogee detection in seconds (for Apogee roles). */
  time_after_apogee_s?: number;
  /** Enable early-deploy based on velocity. */
  early_deploy_enabled?: boolean;
  /** Early deploy velocity threshold in m/s. */
  early_deploy_vel_mps?: number;
  /** Backup trigger mode. */
  backup_mode?: 'time' | 'height';
  /** Backup time trigger in seconds after expected event. */
  backup_time_s?: number;
  /** Backup height trigger in metres AGL. */
  backup_height_m?: number;
  /** Motor number (for staging/ignition roles). */
  motor_number?: number;
  /** Minimum velocity for ignition in m/s. */
  min_velocity_mps?: number;
  /** Minimum altitude for ignition in metres AGL. */
  min_altitude_m?: number;
  /** Maximum angle from vertical for ignition in degrees. */
  max_ignition_angle_deg?: number;
  /** Maximum flight path angle for deployment in degrees. */
  max_flight_angle_deg?: number;
  /** Additional delay before firing in seconds. */
  fire_delay_s?: number;
}

/** Complete flight configuration for FC upload. */
export interface FlightConfig {
  /** Configuration for all 4 pyro channels. */
  pyro_channels: [PyroChannelConfig, PyroChannelConfig, PyroChannelConfig, PyroChannelConfig];
  /** Pad latitude in degrees. */
  pad_lat_deg: number;
  /** Pad longitude in degrees. */
  pad_lon_deg: number;
  /** Pad altitude MSL in metres. */
  pad_alt_msl_m: number;
  /** State-machine fallback thresholds. */
  sf_fallback: {
    /** Altitude threshold in metres. */
    alt_threshold_m: number;
    /** Velocity threshold in m/s. */
    vel_threshold_mps: number;
  };
  /** Pre-flight checks. */
  checks: {
    /** Minimum battery voltage in volts. */
    min_batt_v: number;
    /** Minimum self-test integrity percentage. */
    min_integrity_pct: number;
  };
}
