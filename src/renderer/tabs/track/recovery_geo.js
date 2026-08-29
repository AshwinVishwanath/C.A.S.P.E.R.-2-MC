// recovery_geo.js — pure geo/formatting helpers for the ROCKET RECOVERY
// surface (GroundTrack canvas, copy-coordinates button, QR code).
//
// Kept dependency-free and free of React/DOM so it can be unit tested with
// plain vitest (environment: 'node' — see vitest.config.ts) and reused by
// both GroundTrack.jsx and RecoveryPanel.jsx without duplicating the
// flat-earth math that already lives (independently) in TrackTab.jsx and
// design/instruments.jsx's Radar.
//
// All range/bearing math here is the same flat-earth approximation used
// throughout this app's GPS scopes (fine at recovery-field distances,
// i.e. up to a few tens of km) — not a great-circle solution.

/** Metres per degree of latitude (and, at the equator, of longitude too). */
export const M_PER_DEG = 111320;

/**
 * Auto-range ladder (metres), shared shape with design/instruments.jsx's
 * Radar so the recovery ground track "steps" feel the same as the rest of
 * the app, extended upward — a recovery walk can be farther than the radar
 * ever needs to auto-range for.
 */
export const RANGE_LADDER_M = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];

/**
 * True only when the FC has an actual GPS fix — never inferred from the
 * coordinate values themselves. (0, 0) is a legitimate lat/lon (equator /
 * prime meridian) and must never be read as "no fix"; conversely a stale
 * default snapshot reports gpsFix 'NONE' even though gpsLat/gpsLon are
 * numerically 0, and that MUST read as "no fix".
 *
 * @param {string} gpsFix - 'NONE' | '2D' | '3D'
 * @param {number} lat
 * @param {number} lon
 */
export function isValidFix(gpsFix, lat, lon) {
  return (
    (gpsFix === '2D' || gpsFix === '3D') &&
    typeof lat === 'number' && Number.isFinite(lat) &&
    typeof lon === 'number' && Number.isFinite(lon)
  );
}

/**
 * East/north offset in metres of (lat2, lon2) relative to (lat1, lon1).
 * Flat-earth approximation: valid at recovery-field scales.
 * @returns {{dx: number, dy: number}} dx = east metres, dy = north metres
 */
export function offsetMeters(lat1, lon1, lat2, lon2) {
  const dy = (lat2 - lat1) * M_PER_DEG;
  const dx = (lon2 - lon1) * M_PER_DEG * Math.cos((lat1 * Math.PI) / 180);
  return { dx, dy };
}

/** Straight-line ground distance in metres (flat-earth approx). */
export function rangeMeters(lat1, lon1, lat2, lon2) {
  const { dx, dy } = offsetMeters(lat1, lon1, lat2, lon2);
  return Math.sqrt(dx * dx + dy * dy);
}

/** True bearing in degrees [0, 360) from (lat1, lon1) to (lat2, lon2). */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const { dx, dy } = offsetMeters(lat1, lon1, lat2, lon2);
  const brg = (Math.atan2(dx, dy) * 180) / Math.PI;
  return brg < 0 ? brg + 360 : brg;
}

/**
 * Pick the smallest ladder rung that comfortably contains `distM`, mirroring
 * Radar's own auto-range loop (design/instruments.jsx) — a fix is "close to
 * the edge" once it passes 70% of the current rung, so the next one up is
 * chosen a little early rather than clipping the trail against the border.
 */
export function pickAutoRange(distM, ladder = RANGE_LADDER_M) {
  for (let i = 0; i < ladder.length; i++) {
    if (distM < ladder[i] * 0.7) return ladder[i];
  }
  return ladder[ladder.length - 1];
}

/** "42m" below 1 km, "1.23km" at/above — same convention as Radar's canvas labels. */
export function formatDistanceShort(m) {
  if (m >= 1000) return (m / 1000).toFixed(2) + 'km';
  if (m < 10) return m.toFixed(1) + 'm';
  return Math.round(m) + 'm';
}

/**
 * "lat, lon" in decimal degrees — the exact form Google Maps' search box
 * (and the paste target generally) accepts. 6 decimal places is ~11 cm of
 * precision at the equator, comfortably past GPS accuracy, and matches what
 * Google Maps itself displays when you long-press a pin.
 */
export function formatCoordPair(lat, lon, decimals = 6) {
  return `${lat.toFixed(decimals)}, ${lon.toFixed(decimals)}`;
}

/**
 * A Google Maps "search" deep link for (lat, lon).
 *
 * Chose the `/maps/search/?api=1&query=LAT,LON` form (Google's documented
 * URL Scheme, https://developers.google.com/maps/documentation/urls/get-started)
 * over a bare `maps.google.com/?q=` link because `api=1` is the stable,
 * documented contract — a plain `q=` link is liable to be reinterpreted as
 * a text search instead of a coordinate pin on some Maps client versions.
 * It also opens correctly with no API key and works identically whether the
 * phone opens it in the Google Maps app or a browser.
 */
export function buildGoogleMapsUrl(lat, lon, decimals = 7) {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(decimals)},${lon.toFixed(decimals)}`;
}
