// CASPER 2 Mission Control — Shared flight configuration hook.
// Read by Flight tab (right-rail summary panel) and edited by Setup tab.
// Persists to localStorage so the values survive a reload.

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "casper-mc-flight-config-v1";

export const FLIGHT_CONFIG_DEFAULTS = {
  profile:       "L1 single-stage",
  motor:         "AeroTech J350W",
  massWetKg:     3.84,
  apogeeTargetM: 1850,
  drogueAt:      "T+APOGEE",
  mainAtM:       300,
  vehicleId:     "CASPER-2 / 0x7F12",
  // Per-channel pyro config for the wire FlightConfig upload (0xC1).
  // `live` drives per-channel flags bit 7 (CHANNEL_LIVE) — see
  // docs/specs/MC_FC_ALIGNMENT.md §4/§5/§10.8. Default UNCHECKED (false) on
  // every channel: unset = no-charge = safe. A live channel is only ever
  // asserted by explicit operator intent on the Setup tab.
  pyroChannels: [
    { role: "Apogee",        live: false },
    { role: "Main",          live: false },
    { role: "Apogee Backup", live: false },
    { role: "Main Backup",   live: false },
  ],
};

// Module-level store + subscriber set so every `useFlightConfig()` consumer
// across the React tree sees updates immediately — not just on remount.
// Without this, two simultaneously-mounted consumers each hold an independent
// `useState` copy and the editor's writes never reach the read sites.
let _cfg = (() => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored
      ? { ...FLIGHT_CONFIG_DEFAULTS, ...JSON.parse(stored) }
      : FLIGHT_CONFIG_DEFAULTS;
  } catch (e) {
    return FLIGHT_CONFIG_DEFAULTS;
  }
})();
const _listeners = new Set();

export function useFlightConfig() {
  const [cfg, setLocal] = useState(_cfg);

  useEffect(() => {
    _listeners.add(setLocal);
    setLocal(_cfg);
    return () => { _listeners.delete(setLocal); };
  }, []);

  const updateConfig = useCallback((patch) => {
    _cfg = { ..._cfg, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_cfg));
    } catch (e) {}
    _listeners.forEach((l) => l(_cfg));
  }, []);

  const resetConfig = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    _cfg = FLIGHT_CONFIG_DEFAULTS;
    _listeners.forEach((l) => l(_cfg));
  }, []);

  return [cfg, updateConfig, resetConfig];
}

// Stable display-only hash. FNV-1a 32-bit over the JSON serialization.
// Used as the "config CRC hash" surfaced on Flight tab — visual only, not
// the wire CRC the FC computes.
export function flightConfigHash(cfg) {
  const s = JSON.stringify(cfg);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return "0x" + h.toString(16).toUpperCase().padStart(8, "0");
}

// ---------------------------------------------------------------------------
// buildFlightConfig — Setup-UI state -> wire FlightConfig (protocol/types.ts)
//
// Maps this hook's local (MC-only) UI config into the real 4-channel
// FlightConfig shape consumed by src/main/protocol/config_serialiser.ts's
// serialise_config(). This is the "Setup-UI -> FlightConfig mapping"
// required by docs/specs/MC_FC_ALIGNMENT.md §10.8. Every field the wire
// format needs but the Setup UI doesn't (yet) expose gets a conservative,
// documented default.
// ---------------------------------------------------------------------------

/**
 * Build the 4-channel wire FlightConfig from the Setup UI's local config.
 *
 * @param {object} cfg - Local flight config from useFlightConfig() (or
 *   FLIGHT_CONFIG_DEFAULTS). `cfg.pyroChannels[i]` supplies `role` and the
 *   `live` flag (-> flags bit 7 / CHANNEL_LIVE) for hw_channel i.
 * @returns {object} FlightConfig matching src/main/protocol/types.ts,
 *   ready for `serialise_config()` / `config_hash()` / IPC `upload_config`.
 */
export function buildFlightConfig(cfg) {
  const channels = (cfg && cfg.pyroChannels) || FLIGHT_CONFIG_DEFAULTS.pyroChannels;
  const mainAtM = (cfg && cfg.mainAtM) ?? FLIGHT_CONFIG_DEFAULTS.mainAtM;

  const pyro_channels = [0, 1, 2, 3].map((hw_channel) => {
    const ch = channels[hw_channel] || { role: "Custom", live: false };
    const isMain = typeof ch.role === "string" && ch.role.startsWith("Main");
    return {
      hw_channel,
      role: ch.role || "Custom",
      altitude_source: "ekf",
      fire_duration_s: 1.0,
      deploy_alt_m: isMain ? mainAtM : 0,
      time_after_apogee_s: 0,
      early_deploy_enabled: false,
      early_deploy_vel_mps: 0,
      backup_mode: "time",
      backup_time_s: 1.0,
      backup_height_m: 0,
      motor_number: 0,
      min_velocity_mps: 0,
      min_altitude_m: 0,
      max_ignition_angle_deg: 0,
      max_flight_angle_deg: 0,
      fire_delay_s: 0,
      // CHANNEL_LIVE — default unchecked/false = no-charge = safe.
      live: !!ch.live,
    };
  });

  return {
    pyro_channels,
    pad_lat_deg: 0,
    pad_lon_deg: 0,
    pad_alt_msl_m: 0,
    sf_fallback: {
      alt_threshold_m: 100,
      vel_threshold_mps: -5,
    },
    checks: {
      min_batt_v: 7.4,
      min_integrity_pct: 90,
    },
  };
}

// Format helpers shared by Flight tab and Setup tab editor.
export function formatMassKg(kg) {
  return kg.toFixed(2) + " kg";
}

export function formatAltM(m) {
  if (m >= 1000) return m.toLocaleString() + " m";
  return m + " m";
}
