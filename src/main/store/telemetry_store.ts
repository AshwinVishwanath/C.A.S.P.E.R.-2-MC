/**
 * Reactive telemetry store for C.A.S.P.E.R. 2 Mission Control.
 *
 * Maintains a single {@link TelemetrySnapshot} that is updated atomically
 * from incoming protocol messages and published to all subscribers
 * (renderer, logging, audio alerts, etc.).
 *
 * @module store/telemetry_store
 */

import { TelemetrySnapshot, PyroState, EventLogEntry, DEFAULT_SNAPSHOT } from './store_types';
import { FcMsgFast, FcMsgGps, FcMsgEvent, GsMsgTelem, FcTlmStatus, EventType, FsmState, FSM_STATE_NAMES } from '../protocol/types';
import { RING_BUFFER_DEPTH, STALE_THRESHOLD_MS } from '../protocol/constants';
import { quat_to_euler_deg } from '../protocol/derived';

export class TelemetryStore {
  private snapshot: TelemetrySnapshot;
  private subscribers: Set<(s: TelemetrySnapshot) => void> = new Set();
  private last_valid_ms: number = 0;

  constructor() {
    // Deep clone DEFAULT_SNAPSHOT to avoid shared state
    this.snapshot = JSON.parse(JSON.stringify(DEFAULT_SNAPSHOT));
  }

  /**
   * Register a callback that fires whenever the snapshot changes.
   *
   * @param callback - Function invoked with an isolated copy of the
   *   current snapshot on every update.
   * @returns An unsubscribe function. Call it to remove the callback.
   */
  subscribe(callback: (snapshot: TelemetrySnapshot) => void): () => void {
    this.subscribers.add(callback);
    return () => { this.subscribers.delete(callback); };
  }

  /**
   * Return a shallow-isolated copy of the current telemetry snapshot.
   *
   * Array fields (`pyro`, `buf_alt`, `buf_vel`, `buf_qbar`, `events`)
   * are copied so that callers cannot mutate the store's internal state.
   *
   * @returns A snapshot copy safe for external consumption.
   */
  get_snapshot(): TelemetrySnapshot {
    return { ...this.snapshot, pyro: [...this.snapshot.pyro] as any, buf_alt: [...this.snapshot.buf_alt], buf_vel: [...this.snapshot.buf_vel], buf_qbar: [...this.snapshot.buf_qbar], events: [...this.snapshot.events] };
  }

  /**
   * Ingest a GS_MSG_TELEM relay packet, updating all FC and GS-derived
   * telemetry fields, ring buffers, and clearing stale state.
   *
   * @param parsed - Decoded GS_MSG_TELEM message.
   */
  update_from_gs_telem(parsed: GsMsgTelem): void {
    const s = this.snapshot;
    // FC fields
    s.alt_m = parsed.alt_m;
    s.vel_mps = parsed.vel_mps;
    s.quat = parsed.quat;
    s.flight_time_s = parsed.flight_time_s;
    s.batt_v = parsed.batt_v;
    s.seq = parsed.seq;
    // Status fields
    this._update_pyro_from_status(parsed.status);
    s.fsm_state = parsed.status.fsm_state;
    s.sys_error = parsed.status.error;
    // GS derived fields
    s.rssi_dbm = parsed.rssi_dbm;
    s.snr_db = parsed.snr_db;
    s.freq_err_hz = parsed.freq_err_hz;
    s.data_age_ms = parsed.data_age_ms;
    s.recovery_flag = parsed.recovery.recovered;
    s.recovery_method = parsed.recovery.method;
    s.recovery_confidence = parsed.recovery.confidence;
    s.mach = parsed.mach;
    s.qbar_pa = parsed.qbar_pa;
    s.roll_deg = parsed.roll_deg;
    s.pitch_deg = parsed.pitch_deg;
    s.yaw_deg = parsed.yaw_deg;
    // Ring buffers
    this._push_ring(s.buf_alt, s.alt_m);
    this._push_ring(s.buf_vel, s.vel_mps);
    this._push_ring(s.buf_qbar, s.qbar_pa);
    // Mark as valid
    s.stale = false;
    s.stale_since_ms = 0;
    this.last_valid_ms = Date.now();
    this._notify();
  }

  /**
   * Ingest an FC_MSG_FAST direct telemetry packet, updating core
   * telemetry fields, pyro status, ring buffers, and clearing stale state.
   *
   * @param parsed - Decoded FC_MSG_FAST message.
   */
  update_from_fc_fast(parsed: FcMsgFast): void {
    const s = this.snapshot;
    s.alt_m = parsed.alt_m;
    s.vel_mps = parsed.vel_mps;
    s.quat = parsed.quat;
    s.flight_time_s = parsed.flight_time_s;
    s.batt_v = parsed.batt_v;
    s.seq = parsed.seq;
    this._update_pyro_from_status(parsed.status);
    s.fsm_state = parsed.status.fsm_state;
    s.sys_error = parsed.status.error;
    // Compute Euler angles from quaternion (not provided by FC direct mode)
    const [roll, pitch, yaw] = quat_to_euler_deg(parsed.quat);
    s.roll_deg = roll;
    s.pitch_deg = pitch;
    s.yaw_deg = yaw;
    // Ring buffers
    this._push_ring(s.buf_alt, s.alt_m);
    this._push_ring(s.buf_vel, s.vel_mps);
    this._push_ring(s.buf_qbar, s.qbar_pa);
    // Mark valid
    s.stale = false;
    s.stale_since_ms = 0;
    this.last_valid_ms = Date.now();
    this._notify();
  }

  /**
   * Ingest an FC_MSG_GPS position packet, updating all GPS fields.
   *
   * @param parsed - Decoded FC_MSG_GPS message.
   */
  update_from_gps(parsed: FcMsgGps): void {
    const s = this.snapshot;
    s.gps_dlat_m = parsed.dlat_m;
    s.gps_dlon_m = parsed.dlon_m;
    s.gps_alt_msl_m = parsed.alt_msl_m;
    s.gps_fix = parsed.fix_type;
    s.gps_sats = parsed.sat_count;
    s.gps_pdop = parsed.pdop;
    s.gps_range_saturated = parsed.range_saturated;
    this._notify();
  }

  /**
   * Ingest an FC_MSG_EVENT discrete event, appending it to the event log
   * and updating relevant snapshot fields (e.g. apogee altitude, FSM state).
   *
   * @param parsed - Decoded FC_MSG_EVENT message.
   */
  update_from_event(parsed: FcMsgEvent): void {
    const entry = this._format_event(parsed.event_type, parsed.event_data, parsed.flight_time_s);
    this.snapshot.events.push(entry);
    // Update fields based on event type
    if (parsed.event_type === EventType.Apogee) {
      this.snapshot.apogee_alt_m = parsed.event_data * 10; // decametres to metres
    }
    if (parsed.event_type === EventType.State) {
      this.snapshot.fsm_state = parsed.event_data as FsmState;
    }
    this._notify();
  }

  /**
   * Update connection state for a given link. When a link disconnects,
   * all telemetry values are reset to defaults while preserving the
   * event log and the other link's connection flag.
   *
   * @param link - Which link changed: `'fc'` for flight computer USB,
   *   `'gs'` for ground station USB.
   * @param connected - Whether the link is now connected.
   */
  set_connection(link: 'fc' | 'gs', connected: boolean): void {
    if (link === 'fc') {
      this.snapshot.fc_conn = connected;
    } else {
      this.snapshot.gs_conn = connected;
    }
    if (!connected) {
      // Reset telemetry values but preserve events
      const events = this.snapshot.events;
      const fc_conn = this.snapshot.fc_conn;
      const gs_conn = this.snapshot.gs_conn;
      this.snapshot = JSON.parse(JSON.stringify(DEFAULT_SNAPSHOT));
      this.snapshot.events = events;
      this.snapshot.fc_conn = fc_conn;
      this.snapshot.gs_conn = gs_conn;
    }
    this._notify();
  }

  /**
   * Update protocol handshake status and optional firmware metadata.
   *
   * @param ok - Whether the protocol handshake succeeded.
   * @param fw_version - FC firmware version string (optional).
   * @param config_hash - FC configuration hash (optional).
   */
  set_protocol_ok(ok: boolean, fw_version?: string, config_hash?: number): void {
    this.snapshot.protocol_ok = ok;
    if (fw_version !== undefined) this.snapshot.fw_version = fw_version;
    if (config_hash !== undefined) this.snapshot.config_hash = config_hash;
    this._notify();
  }

  /**
   * Called periodically (typically every 100 ms) to check whether
   * telemetry data has become stale. If more than
   * {@link STALE_THRESHOLD_MS} has elapsed since the last valid packet,
   * the snapshot is marked stale and subscribers are notified.
   *
   * @param now_ms - Current wall-clock time in milliseconds (Date.now()).
   */
  tick_stale(now_ms: number): void {
    if (this.last_valid_ms === 0) return; // No data received yet
    const elapsed = now_ms - this.last_valid_ms;
    if (elapsed > STALE_THRESHOLD_MS) {
      if (!this.snapshot.stale) {
        this.snapshot.stale = true;
      }
      this.snapshot.stale_since_ms = elapsed;
      this.snapshot.data_age_ms = elapsed;
      this._notify();
    }
  }

  /**
   * Reset the store to factory defaults, clearing all telemetry,
   * events, ring buffers, and the last-valid timestamp.
   */
  reset(): void {
    this.snapshot = JSON.parse(JSON.stringify(DEFAULT_SNAPSHOT));
    this.last_valid_ms = 0;
    this._notify();
  }

  // --- Private helpers ---

  private _notify(): void {
    const snap = this.get_snapshot();
    for (const cb of this.subscribers) {
      cb(snap);
    }
  }

  private _push_ring(buf: number[], value: number): void {
    buf.push(value);
    if (buf.length > RING_BUFFER_DEPTH) {
      buf.shift();
    }
  }

  private _update_pyro_from_status(status: FcTlmStatus): void {
    for (let i = 0; i < 4; i++) {
      // Preserve role and cont_v (MC-local config)
      this.snapshot.pyro[i].armed = status.armed[i];
      this.snapshot.pyro[i].continuity = status.continuity[i];
    }
    if (status.fired) {
      // The fired flag is global in the status bitmap — we don't know which channel.
      // Individual channel firing is tracked via FC_EVT_PYRO events.
    }
  }

  private _format_event(type: number, data: number, flight_time_s: number): EventLogEntry {
    let type_name: string;
    switch (type) {
      case EventType.State:
        type_name = `STATE → ${FSM_STATE_NAMES[data as FsmState] ?? `UNKNOWN(${data})`}`;
        break;
      case EventType.Pyro:
        type_name = `PYRO CH${(data >> 8) & 0xFF} FIRED ${data & 0xFF}ms`;
        break;
      case EventType.Apogee:
        type_name = `APOGEE ${data * 10}m`;
        break;
      case EventType.Error:
        type_name = `ERROR: 0x${data.toString(16).padStart(4, '0')}`;
        break;
      case EventType.Origin:
        type_name = `PAD ORIGIN (${data & 0x3F} sats)`;
        break;
      case EventType.Burnout:
        type_name = `BURNOUT (peak ${data}mg)`;
        break;
      case EventType.Staging:
        type_name = `STAGE ${data}`;
        break;
      case EventType.Arm:
        type_name = `CH${(data >> 8) & 0xFF} ${(data & 0xFF) ? 'ARMED' : 'DISARMED'}`;
        break;
      default:
        type_name = `UNKNOWN EVENT 0x${type.toString(16)} data=${data}`;
        break;
    }
    return { type, type_name, data, flight_time_s, arrival_timestamp: Date.now() };
  }
}
