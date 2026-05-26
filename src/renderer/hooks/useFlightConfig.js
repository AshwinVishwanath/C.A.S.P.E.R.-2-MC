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

// Format helpers shared by Flight tab and Setup tab editor.
export function formatMassKg(kg) {
  return kg.toFixed(2) + " kg";
}

export function formatAltM(m) {
  if (m >= 1000) return m.toLocaleString() + " m";
  return m + " m";
}
