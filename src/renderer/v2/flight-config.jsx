// CASPER 2 v2 — Shared flight configuration state.
// Read by Flight tab (right-rail summary panel) and edited by Setup tab.
// Persists to localStorage so the values survive a reload.

import { useState, useCallback } from "react";

const STORAGE_KEY = "casper-mc-flight-config-v2";

export const FLIGHT_CONFIG_DEFAULTS = {
  profile:        "L1 single-stage",
  motor:          "AeroTech J350W",
  massWetKg:      3.84,
  apogeeTargetM:  1850,
  drogueAt:       "T+APOGEE",
  mainAtM:        300,
  vehicleId:      "CASPER-2 / 0x7F12",
};

export function useFlightConfig() {
  const [cfg, setCfg] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? { ...FLIGHT_CONFIG_DEFAULTS, ...JSON.parse(stored) } : FLIGHT_CONFIG_DEFAULTS;
    } catch (e) { return FLIGHT_CONFIG_DEFAULTS; }
  });

  const update = useCallback((patch) => {
    setCfg((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    setCfg(FLIGHT_CONFIG_DEFAULTS);
  }, []);

  return [cfg, update, reset];
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
