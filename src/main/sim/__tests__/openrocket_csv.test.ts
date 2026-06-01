/**
 * Tests for the OpenRocket CSV parser.
 *
 * Covers: keyframe extraction, apogee/duration, event→phase mapping (including
 * dual-deploy DROGUE→MAIN), tolerant header matching (renamed/reordered
 * columns, no `#` prefix, event column instead of comment lines), and the
 * required-column error paths.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse_openrocket_csv } from '../openrocket_csv';

const FIXTURE = readFileSync(
  join(__dirname, '../../../../test/fixtures/openrocket_sample.csv'),
  'utf-8'
);

/** Phase in effect at time t for a parsed profile. */
function phaseAt(profile: ReturnType<typeof parse_openrocket_csv>, t: number): string {
  return profile.samples.reduce(
    (acc, s) => (s.t <= t + 1e-9 ? s.phase : acc),
    profile.samples[0].phase
  );
}

describe('parse_openrocket_csv', () => {
  it('parses all data rows from the fixture', () => {
    const profile = parse_openrocket_csv(FIXTURE);
    expect(profile.samples.length).toBe(11);
  });

  it('computes duration and apogee', () => {
    const profile = parse_openrocket_csv(FIXTURE);
    expect(profile.duration_s).toBe(160);
    expect(profile.apogee_m).toBeCloseTo(1402, 0);
  });

  it('maps events to phases in chronological order (dual deploy → DROGUE then MAIN)', () => {
    const profile = parse_openrocket_csv(FIXTURE);
    expect(phaseAt(profile, 0)).toBe('BOOST'); // LAUNCH at t=0
    expect(phaseAt(profile, 1.0)).toBe('BOOST');
    expect(phaseAt(profile, 4)).toBe('COAST'); // after BURNOUT at 1.6
    expect(phaseAt(profile, 11.2)).toBe('APOGEE');
    expect(phaseAt(profile, 60)).toBe('DROGUE'); // first recovery deployment
    expect(phaseAt(profile, 120)).toBe('MAIN'); // second recovery deployment
    expect(phaseAt(profile, 160)).toBe('LANDED');
  });

  it('keeps the evaluator sample shape { phase, t, alt, vel, mach, accel, tilt }', () => {
    const s = parse_openrocket_csv(FIXTURE).samples[1];
    expect(s).toEqual({
      phase: expect.any(String),
      t: 0.5,
      alt: 18,
      vel: 72,
      mach: 0.21,
      accel: 118,
      tilt: 1.5
    });
  });

  it('matches columns by name regardless of order / casing', () => {
    const csv = [
      'MACH NUMBER,Time (s),Vertical velocity (m/s),Altitude (m)',
      '0.0,0,0,0',
      '0.5,1,80,40',
      '0.2,2,40,120'
    ].join('\n');
    const profile = parse_openrocket_csv(csv);
    expect(profile.samples.length).toBe(3);
    expect(profile.samples[1]).toMatchObject({ t: 1, alt: 40, vel: 80, mach: 0.5 });
    expect(profile.apogee_m).toBe(120);
  });

  it('reads events from an Event column when present', () => {
    const csv = [
      'Time (s),Altitude (m),Vertical velocity (m/s),Event',
      '0,0,0,LAUNCH',
      '1,100,90,',
      '5,300,0,APOGEE',
      '8,50,-10,GROUND_HIT'
    ].join('\n');
    const profile = parse_openrocket_csv(csv);
    const last = profile.samples[profile.samples.length - 1];
    expect(profile.samples[0].phase).toBe('BOOST');
    expect(profile.samples[2].phase).toBe('APOGEE');
    expect(last.phase).toBe('LANDED');
  });

  it('throws a clear error when the altitude column is missing', () => {
    const csv = ['Time (s),Vertical velocity (m/s)', '0,0', '1,80'].join('\n');
    expect(() => parse_openrocket_csv(csv)).toThrow(/altitude/i);
  });

  it('throws when there is no data', () => {
    const csv = '# just a comment\n# Time (s),Altitude (m),Vertical velocity (m/s)\n';
    expect(() => parse_openrocket_csv(csv)).toThrow(/no flight data/i);
  });

  describe('kinematic phase derivation (no events in CSV)', () => {
    // Synthetic event-free flight: boost, coast, apogee, fast drogue, slow main.
    function buildFlight(): string {
      const rows: string[] = ['Time (s),Altitude (m),Vertical velocity (m/s)'];
      const push = (t: number, a: number, v: number) => rows.push(`${t},${a},${v}`);
      // Boost: 0→2s, accelerating up, velocity peaks at burnout (t=2).
      push(0, 0, 0);
      push(0.5, 20, 80);
      push(1.0, 80, 140);
      push(2.0, 260, 200); // burnout (peak velocity)
      // Coast: decelerating to apogee at t=8.
      push(4, 600, 120);
      push(6, 820, 60);
      push(8, 900, 0); // apogee (peak altitude)
      // Drogue descent: fast (~-30 m/s).
      push(10, 840, -30);
      push(20, 540, -30);
      push(40, 80, -30);
      // Main: slow descent (~-5 m/s), then touchdown.
      push(45, 55, -5);
      push(55, 5, -5);
      push(57, 0, 0); // landed
      return rows.join('\n');
    }

    it('infers PAD→BOOST→COAST→APOGEE→DROGUE→MAIN→LANDED from kinematics', () => {
      const p = parse_openrocket_csv(buildFlight());
      expect(phaseAt(p, 0)).toBe('PAD');
      expect(phaseAt(p, 1.0)).toBe('BOOST');
      expect(phaseAt(p, 4)).toBe('COAST'); // after the velocity peak at t=2
      expect(phaseAt(p, 8)).toBe('APOGEE');
      expect(phaseAt(p, 20)).toBe('DROGUE'); // fast descent
      expect(phaseAt(p, 55)).toBe('MAIN'); // descent slowed sharply
      expect(phaseAt(p, 57)).toBe('LANDED');
    });

    it('does not invent a MAIN phase for a single gentle descent', () => {
      const rows = [
        'Time (s),Altitude (m),Vertical velocity (m/s)',
        '0,0,0', '1,60,100', '2,150,120', '5,400,40', '8,460,0',
        '10,440,-4', '30,360,-4', '60,240,-4', '90,120,-4', '120,0,0'
      ].join('\n');
      const p = parse_openrocket_csv(rows);
      const phases = new Set(p.samples.map((s) => s.phase));
      expect(phases.has('MAIN')).toBe(false);
      expect(phaseAt(p, 30)).toBe('DROGUE');
      expect(phaseAt(p, 120)).toBe('LANDED');
    });
  });

  describe('tilt synthesis from body rates (no orientation column)', () => {
    it('integrates pitch/yaw rate into a tilt-from-vertical angle', () => {
      // Constant 10 deg/s pitch rate for 2 s → ~20 deg tilt; no orientation col.
      const rows = ['Time (s),Altitude (m),Vertical velocity (m/s),Pitch rate (deg/s),Yaw rate (deg/s)'];
      for (let i = 0; i <= 20; i++) rows.push(`${i * 0.1},${i * 5},${100 - i},10,0`);
      const p = parse_openrocket_csv(rows.join('\n'));
      expect(p.samples[0].tilt).toBeCloseTo(0, 5);
      expect(p.samples[p.samples.length - 1].tilt).toBeCloseTo(20, 1);
    });

    it('combines pitch and yaw rate in quadrature and wraps into [0,180]', () => {
      // 30 + 40 deg/s → 50 deg/s transverse; 4 s → 200 deg unsigned → wraps to 160.
      const rows = ['Time (s),Altitude (m),Vertical velocity (m/s),Pitch rate (deg/s),Yaw rate (deg/s)'];
      for (let i = 0; i <= 40; i++) rows.push(`${i * 0.1},${i},${50 - i},30,40`);
      const p = parse_openrocket_csv(rows.join('\n'));
      const last = p.samples[p.samples.length - 1].tilt;
      expect(last).toBeGreaterThanOrEqual(0);
      expect(last).toBeLessThanOrEqual(180);
      expect(last).toBeCloseTo(160, 0);
    });

    it('prefers a real orientation column over rate integration', () => {
      const rows = [
        'Time (s),Altitude (m),Vertical velocity (m/s),Vertical orientation (deg),Pitch rate (deg/s)',
        '0,0,0,5,90', '1,100,90,7,90', '2,200,80,9,90'
      ].join('\n');
      const p = parse_openrocket_csv(rows);
      expect(p.samples[2].tilt).toBe(9); // from the column, not integrated rate
    });
  });

  describe('real OpenRocket export (assets/CSVs/SimCSVDemo.csv)', () => {
    const ASSET = join(__dirname, '../../../../assets/CSVs/SimCSVDemo.csv');
    const run = existsSync(ASSET) ? it : it.skip;

    run('parses the demo flight and derives sensible phases', () => {
      const profile = parse_openrocket_csv(readFileSync(ASSET, 'utf-8'));
      expect(profile.samples.length).toBeGreaterThan(1000); // 1236 data rows
      expect(profile.apogee_m).toBeGreaterThan(300); // ~319.6 m
      // Real flight events: LAUNCH@0, BURNOUT@1.86, APOGEE@7.871,
      // EJECTION_CHARGE@8.861 + RECOVERY_DEVICE_DEPLOYMENT@8.862 (single deploy),
      // GROUND_HIT@84.31.
      expect(phaseAt(profile, 0.05)).toBe('BOOST'); // LAUNCH at t=0
      expect(phaseAt(profile, 1.0)).toBe('BOOST');
      expect(phaseAt(profile, 5)).toBe('COAST'); // after BURNOUT 1.86
      expect(phaseAt(profile, 8)).toBe('APOGEE'); // after APOGEE 7.871
      expect(phaseAt(profile, 50)).toBe('DROGUE'); // single deployment
      expect(phaseAt(profile, 84.31)).toBe('LANDED'); // GROUND_HIT
    });

    run('collapses EJECTION_CHARGE + RECOVERY_DEVICE_DEPLOYMENT into one DROGUE (no false MAIN)', () => {
      const profile = parse_openrocket_csv(readFileSync(ASSET, 'utf-8'));
      const phases = new Set(profile.samples.map((s) => s.phase));
      expect(phases.has('DROGUE')).toBe(true);
      expect(phases.has('MAIN')).toBe(false);
    });
  });
});
