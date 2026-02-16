import { useState, useEffect, useCallback } from 'react';

/**
 * FSM state names matching the FsmState enum from protocol/types.ts.
 * Indexed by the numeric enum value (0x0 through 0xB).
 */
const FSM_STATE_NAMES = [
  'PAD',      // 0x0 Pad
  'BOOST',    // 0x1 Boost
  'COAST',    // 0x2 Coast
  'COAST_1',  // 0x3 Coast1
  'SUSTAIN',  // 0x4 Sustain
  'COAST_2',  // 0x5 Coast2
  'APOGEE',   // 0x6 Apogee
  'DROGUE',   // 0x7 Drogue
  'MAIN',     // 0x8 Main
  'RECOVERY', // 0x9 Recovery
  'TUMBLE',   // 0xA Tumble
  'LANDED',   // 0xB Landed
];

/** Default pyro role assignments (MC-side only). */
const DEFAULT_ROLES = ['Apogee', 'Main', 'Apogee Backup', 'Main Backup'];

/**
 * Default telemetry state returned when no data has arrived yet,
 * or when window.casper is unavailable (dev mode outside Electron).
 */
function makeDefaultState() {
  return {
    rssi: 0,
    dataAge: 0,
    batt: 0,
    gpsLat: 0,
    gpsLon: 0,
    gpsFix: 'NONE',
    gpsSats: 0,
    ekfAlt: 0,
    alt: 0,
    vel: 0,
    roll: 0,
    pitch: 0,
    yaw: 0,
    mach: 0,
    state: 'PAD',
    t: 0,
    apogee: 0,
    stale: false,
    staleSince: 0,
    qbar: 0,
    integrity: 0,
    pyro: [
      { hwCh: 1, role: DEFAULT_ROLES[0], cont: false, contV: 0, armed: false, firing: false },
      { hwCh: 2, role: DEFAULT_ROLES[1], cont: false, contV: 0, armed: false, firing: false },
      { hwCh: 3, role: DEFAULT_ROLES[2], cont: false, contV: 0, armed: false, firing: false },
      { hwCh: 4, role: DEFAULT_ROLES[3], cont: false, contV: 0, armed: false, firing: false },
    ],
  };
}

/**
 * Convert a GPS delta-metres offset to a decimal-degree coordinate.
 * Uses a simple flat-earth approximation: 1 degree latitude ~ 111320 m.
 * Pad origin is treated as (0, 0) since the FC reports deltas only.
 */
function deltaToCoord(delta_m) {
  return delta_m / 111320;
}

/**
 * Map a raw TelemetrySnapshot from the preload bridge into the sim-compatible
 * shape that App.jsx expects.
 *
 * @param {object} snap - TelemetrySnapshot from window.casper.on_telemetry
 * @param {string[]} roles - Current role assignments (local MC state)
 * @returns {object} Sim-compatible telemetry object (without command functions)
 */
function mapSnapshot(snap, roles) {
  var gpsFix;
  if (snap.gps_fix === 3) gpsFix = '3D';
  else if (snap.gps_fix === 2) gpsFix = '2D';
  else gpsFix = 'NONE';

  var pyro = [];
  for (var i = 0; i < 4; i++) {
    var sp = snap.pyro && snap.pyro[i] ? snap.pyro[i] : {};
    pyro.push({
      hwCh: sp.channel != null ? sp.channel : i + 1,
      role: sp.role || roles[i] || DEFAULT_ROLES[i],
      cont: !!sp.continuity,
      contV: sp.cont_v != null ? sp.cont_v : 0,
      armed: !!sp.armed,
      firing: !!sp.fired,
    });
  }

  return {
    rssi: snap.rssi_dbm != null ? snap.rssi_dbm : 0,
    dataAge: snap.data_age_ms != null ? snap.data_age_ms : 0,
    batt: snap.batt_v != null ? snap.batt_v : 0,
    gpsLat: deltaToCoord(snap.gps_dlat_m || 0),
    gpsLon: deltaToCoord(snap.gps_dlon_m || 0),
    gpsFix: gpsFix,
    gpsSats: snap.gps_sats != null ? snap.gps_sats : 0,
    ekfAlt: snap.alt_m != null ? snap.alt_m : 0,
    alt: snap.alt_m != null ? snap.alt_m : 0,
    vel: snap.vel_mps != null ? snap.vel_mps : 0,
    roll: snap.roll_deg != null ? snap.roll_deg : 0,
    pitch: snap.pitch_deg != null ? snap.pitch_deg : 0,
    yaw: snap.yaw_deg != null ? snap.yaw_deg : 0,
    mach: snap.mach != null ? snap.mach : 0,
    state: FSM_STATE_NAMES[snap.fsm_state] || 'PAD',
    t: (snap.flight_time_s || 0) * 1000,
    apogee: snap.apogee_alt_m != null ? snap.apogee_alt_m : 0,
    stale: !!snap.stale,
    staleSince: (snap.stale_since_ms || 0) / 1000,
    qbar: snap.qbar_pa != null ? snap.qbar_pa : 0,
    integrity: snap.integrity_pct != null ? snap.integrity_pct : 0,
    pyro: pyro,
  };
}

/**
 * useTelemetry -- drop-in replacement for useSim().
 *
 * Subscribes to real telemetry from window.casper.on_telemetry() and returns
 * the same data shape that App.jsx consumes from useSim(), including the
 * toggleArm, firePyro, and setRole command helpers.
 *
 * If window.casper is not available (e.g. running in a plain browser during
 * development), the hook returns a static default state so the UI still renders.
 *
 * @returns {object} Sim-compatible telemetry + command functions
 */
export default function useTelemetry() {
  var [data, setData] = useState(makeDefaultState);
  var [roles, setRoles] = useState(DEFAULT_ROLES.slice());

  useEffect(function () {
    if (typeof window === 'undefined' || !window.casper) return;

    var unsub = window.casper.on_telemetry(function (snapshot) {
      setData(function (prev) {
        // Preserve local roles across updates
        return mapSnapshot(snapshot, roles);
      });
    });

    return function () {
      if (typeof unsub === 'function') unsub();
    };
  }, [roles]);

  /**
   * Toggle the armed state of pyro channel at index i (0-based).
   * Channels on the FC are 1-indexed, so we send i+1.
   */
  var toggleArm = useCallback(function (i) {
    if (typeof window === 'undefined' || !window.casper) return;
    // Read current armed state from data
    setData(function (prev) {
      var ch = prev.pyro[i];
      if (!ch) return prev;
      if (ch.armed) {
        window.casper.cmd_disarm(i + 1);
      } else {
        window.casper.cmd_arm(i + 1);
      }
      return prev;
    });
  }, []);

  /**
   * Fire pyro channel at index i (0-based) with a 1200 ms default duration.
   * Channels on the FC are 1-indexed.
   */
  var firePyro = useCallback(function (i) {
    if (typeof window === 'undefined' || !window.casper) return;
    window.casper.cmd_fire(i + 1, 1200);
  }, []);

  /**
   * Set the role label for pyro channel at index i.
   * Roles are MC-side configuration only and are not sent to the FC.
   */
  var setRole = useCallback(function (i, role) {
    setRoles(function (prev) {
      var next = prev.slice();
      next[i] = role;
      return next;
    });
    setData(function (prev) {
      return {
        ...prev,
        pyro: prev.pyro.map(function (c, j) {
          return j === i ? { ...c, role: role } : c;
        }),
      };
    });
  }, []);

  return { ...data, toggleArm: toggleArm, firePyro: firePyro, setRole: setRole };
}
