// recovery_geo.test.js — geo/format helpers behind the ROCKET RECOVERY
// surface: GroundTrack's auto-range ladder, the clipboard "lat, lon" form,
// the QR code's Google Maps URL, and the honest no-fix gate.
import { describe, it, expect } from 'vitest';
import {
  M_PER_DEG,
  RANGE_LADDER_M,
  isValidFix,
  offsetMeters,
  rangeMeters,
  bearingDeg,
  pickAutoRange,
  formatDistanceShort,
  formatCoordPair,
  buildGoogleMapsUrl,
} from '../recovery_geo.js';

describe('isValidFix', () => {
  it('is false with no fix, even when lat/lon are numeric zero (default snapshot)', () => {
    expect(isValidFix('NONE', 0, 0)).toBe(false);
  });

  it('is true for a real fix at (0, 0) — equator/prime-meridian is a legitimate position', () => {
    expect(isValidFix('3D', 0, 0)).toBe(true);
    expect(isValidFix('2D', 0, 0)).toBe(true);
  });

  it('is false when lat/lon are missing or non-finite despite a reported fix', () => {
    expect(isValidFix('3D', NaN, -105)).toBe(false);
    expect(isValidFix('3D', undefined, -105)).toBe(false);
    expect(isValidFix('3D', 40, Infinity)).toBe(false);
  });

  it('rejects unknown fix strings', () => {
    expect(isValidFix('', 40, -105)).toBe(false);
    expect(isValidFix(undefined, 40, -105)).toBe(false);
  });
});

describe('offsetMeters / rangeMeters / bearingDeg', () => {
  it('is zero range at the same point', () => {
    expect(rangeMeters(40, -105, 40, -105)).toBe(0);
  });

  it('1 degree of latitude is ~111.32 km north (bearing 0)', () => {
    const { dx, dy } = offsetMeters(40, -105, 41, -105);
    expect(dx).toBeCloseTo(0, 6);
    expect(dy).toBeCloseTo(M_PER_DEG, 6);
    expect(rangeMeters(40, -105, 41, -105)).toBeCloseTo(M_PER_DEG, 6);
    expect(bearingDeg(40, -105, 41, -105)).toBeCloseTo(0, 6);
  });

  it('due east reads bearing 90, due south reads bearing 180, due west reads bearing 270', () => {
    expect(bearingDeg(40, -105, 40, -104)).toBeCloseTo(90, 4);
    expect(bearingDeg(40, -105, 39, -105)).toBeCloseTo(180, 6);
    expect(bearingDeg(40, -105, 40, -106)).toBeCloseTo(270, 4);
  });

  it('shrinks the east-west metres-per-degree by cos(latitude)', () => {
    const distAtEquator = rangeMeters(0, 0, 0, 1);
    const distAt60 = rangeMeters(60, 0, 60, 1);
    expect(distAtEquator).toBeCloseTo(M_PER_DEG, 6);
    expect(distAt60).toBeCloseTo(M_PER_DEG * Math.cos((60 * Math.PI) / 180), 6);
  });
});

describe('pickAutoRange', () => {
  it('picks the smallest rung that is not yet 70%-full', () => {
    expect(pickAutoRange(0)).toBe(RANGE_LADDER_M[0]);
    expect(pickAutoRange(6)).toBe(10);      // 6 < 10*0.7=7
    expect(pickAutoRange(8)).toBe(25);      // 8 >= 7, next rung
    expect(pickAutoRange(60)).toBe(100);    // 60 >= 50*0.7=35, < 100*0.7=70
  });

  it('clamps to the top rung beyond the ladder', () => {
    expect(pickAutoRange(1_000_000)).toBe(RANGE_LADDER_M[RANGE_LADDER_M.length - 1]);
  });

  it('accepts a custom ladder', () => {
    expect(pickAutoRange(3, [1, 5, 20])).toBe(5);
  });
});

describe('formatDistanceShort', () => {
  it('formats sub-10m with one decimal', () => {
    expect(formatDistanceShort(4.2)).toBe('4.2m');
  });
  it('formats 10m-999m as a rounded integer', () => {
    expect(formatDistanceShort(42.6)).toBe('43m');
  });
  it('formats >=1000m in km with two decimals', () => {
    expect(formatDistanceShort(1234)).toBe('1.23km');
  });
});

describe('formatCoordPair', () => {
  it('formats as "lat, lon" with 6 decimal places by default', () => {
    expect(formatCoordPair(40.1234567, -105.7654321)).toBe('40.123457, -105.765432');
  });

  it('honors a custom decimal count', () => {
    expect(formatCoordPair(1.5, 2.5, 2)).toBe('1.50, 2.50');
  });

  it('keeps the sign and comma-space separator for negative coordinates', () => {
    expect(formatCoordPair(-33.865143, 151.209900)).toBe('-33.865143, 151.209900');
  });
});

describe('buildGoogleMapsUrl', () => {
  it('uses the documented api=1 search deep link with lat,lon at 7 decimals', () => {
    const url = buildGoogleMapsUrl(40.1234567, -105.7654321);
    expect(url).toBe('https://www.google.com/maps/search/?api=1&query=40.1234567,-105.7654321');
  });

  it('is parseable and carries the expected query param', () => {
    const url = buildGoogleMapsUrl(1, 2);
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://www.google.com/maps/search/');
    expect(parsed.searchParams.get('api')).toBe('1');
    expect(parsed.searchParams.get('query')).toBe('1.0000000,2.0000000');
  });
});
