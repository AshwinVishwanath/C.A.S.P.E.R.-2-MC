/**
 * Parser for OpenRocket "Export simulation data" CSV files.
 *
 * OpenRocket writes a CSV with `#`-prefixed comment lines (one of which is the
 * column header) followed by comma-separated numeric rows. Flight events are
 * reported either as inline comment lines (e.g.
 * `# Event APOGEE occurred at t=12.34 seconds`) or as text in a dedicated
 * "Event" column. Column order and the exact set of exported columns are
 * user-selectable, so this parser matches columns by header substring
 * (case-insensitive) rather than by position.
 *
 * Many real OpenRocket exports omit events entirely (pure numeric data). In
 * that case the flight phases (BOOST/COAST/APOGEE/DROGUE/MAIN/LANDED) are
 * derived from the trajectory kinematics — see {@link derive_phase_transitions}.
 *
 * Output is a {@link SimProfile} whose keyframe shape matches the pyro
 * editor's evaluator sample, so the same profile drives both the logic
 * designer simulation and the telemetry dashboard.
 *
 * @module sim/openrocket_csv
 */

import { SimKeyframe, SimPhase, SimProfile } from './sim_types';

/** Indices of the columns we care about (−1 = not present). */
interface ColumnMap {
  time: number;
  alt: number;
  vel: number;
  accel: number;
  mach: number;
  tilt: number;
  pitch_rate: number;
  yaw_rate: number;
  event: number;
}

/** Find the first column whose lowercased name contains any of the keys. */
function find_column(cols: string[], keys: string[]): number {
  for (const key of keys) {
    const idx = cols.findIndex((c) => c.toLowerCase().includes(key));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** True if an event token denotes a recovery-device deployment / ejection. */
function is_deploy_event(name: string): boolean {
  const n = name.toUpperCase();
  return (
    n.includes('RECOVERY_DEVICE_DEPLOYMENT') || n.includes('DEPLOYMENT') || n.includes('EJECTION')
  );
}

/**
 * Map a non-deployment OpenRocket event token to a flight phase.
 *
 * Deployment events are handled separately (see {@link parse_openrocket_csv})
 * because they need de-duplication and DROGUE/MAIN ordering.
 *
 * `LAUNCHROD` is deliberately ignored — it is a sub-event of the boost phase,
 * not a phase change. `LAUNCH`/`IGNITION`/`LIFTOFF` already mark boost.
 */
function event_to_phase(name: string): SimPhase | null {
  const n = name.toUpperCase();
  if (n.includes('LAUNCHROD')) return null;
  if (n.includes('LAUNCH') || n.includes('IGNITION') || n.includes('LIFTOFF')) return 'BOOST';
  if (n.includes('BURNOUT')) return 'COAST';
  if (n.includes('APOGEE')) return 'APOGEE';
  if (n.includes('GROUND_HIT') || n.includes('LANDING') || n.includes('LANDED')) return 'LANDED';
  return null;
}

/** A single phase transition at a point in time. */
interface PhaseTransition {
  t: number;
  phase: SimPhase;
}

// --- Kinematic phase-derivation thresholds (used when a CSV has no events) ---
/** Altitude above which the rocket is considered to have left the pad (m). */
const LIFTOFF_ALT_M = 1.0;
/** Vertical velocity above which the rocket is considered airborne (m/s). */
const LIFTOFF_VEL_MPS = 2.0;
/** Altitude below which (with near-zero velocity) the rocket is on the ground (m). */
const LAND_ALT_M = 2.0;
/** Speed below which the rocket is considered stopped (m/s). */
const LAND_VEL_MPS = 1.5;
/** Only infer a main-chute deployment if drogue descent is at least this fast (m/s). */
const MAIN_MIN_DROGUE_SPEED = 8.0;
/** Main deploy = descent speed falls below this fraction of the peak drogue speed. */
const MAIN_SPEED_FRACTION = 0.5;
/**
 * Deployment events within this many seconds of each other are treated as one
 * physical deployment (OpenRocket emits EJECTION_CHARGE then
 * RECOVERY_DEVICE_DEPLOYMENT a few ms apart for a single chute).
 */
const DEPLOY_DEDUPE_S = 1.0;

/** Minimal sample shape needed to infer flight phases. */
interface KinematicSample {
  t: number;
  alt: number;
  vel: number;
}

/**
 * Derive flight-phase transitions purely from the kinematics, for CSV exports
 * that contain no flight events (e.g. an OpenRocket "Export simulation data"
 * with the event column/comments omitted). Maps the trajectory shape to
 * PAD → BOOST → COAST → APOGEE → DROGUE → (MAIN) → (LANDED).
 *
 * @param samples - Time-sorted samples (vertical velocity, positive = up).
 */
function derive_phase_transitions(samples: KinematicSample[]): PhaseTransition[] {
  const n = samples.length;
  const tr: PhaseTransition[] = [];
  if (n < 2) return tr;

  // Liftoff → BOOST: first sample clearly off the pad.
  let liftoff = 0;
  for (let i = 0; i < n; i++) {
    if (samples[i].alt > LIFTOFF_ALT_M || samples[i].vel > LIFTOFF_VEL_MPS) {
      liftoff = i;
      break;
    }
  }
  tr.push({ t: samples[liftoff].t, phase: 'BOOST' });

  // Apogee = peak altitude.
  let apIdx = 0;
  for (let i = 1; i < n; i++) if (samples[i].alt > samples[apIdx].alt) apIdx = i;

  // Burnout → COAST = peak vertical velocity during ascent (motor cutoff).
  // Velocity is a required column, so this works without an acceleration column.
  let boIdx = liftoff;
  for (let i = liftoff; i <= apIdx; i++) if (samples[i].vel > samples[boIdx].vel) boIdx = i;
  if (boIdx > liftoff && boIdx < apIdx) tr.push({ t: samples[boIdx].t, phase: 'COAST' });

  // Apogee → APOGEE.
  tr.push({ t: samples[apIdx].t, phase: 'APOGEE' });

  if (apIdx < n - 1) {
    // First descending sample → DROGUE.
    tr.push({ t: samples[apIdx + 1].t, phase: 'DROGUE' });

    // Peak descent speed (most negative velocity) characterises the drogue phase.
    let peakDescent = 0;
    for (let i = apIdx; i < n; i++) if (samples[i].vel < peakDescent) peakDescent = samples[i].vel;

    // Main deploy: once a fast drogue descent is established, the descent speed
    // drops sharply (chute opens). Only inferred for a meaningfully fast drogue.
    if (peakDescent < -MAIN_MIN_DROGUE_SPEED) {
      let seenDrogue = false;
      for (let i = apIdx + 1; i < n; i++) {
        if (samples[i].vel < 0.6 * peakDescent) {
          seenDrogue = true;
        } else if (seenDrogue && samples[i].vel > MAIN_SPEED_FRACTION * peakDescent) {
          tr.push({ t: samples[i].t, phase: 'MAIN' });
          break;
        }
      }
    }

    // Landed: back near the ground and nearly stopped.
    for (let i = apIdx + 1; i < n; i++) {
      if (samples[i].alt < LAND_ALT_M && Math.abs(samples[i].vel) < LAND_VEL_MPS) {
        tr.push({ t: samples[i].t, phase: 'LANDED' });
        break;
      }
    }
  }

  return tr;
}

/**
 * Parse OpenRocket CSV text into a {@link SimProfile}.
 *
 * @throws Error with a UI-surfaceable message if required columns or data rows
 *   are missing.
 */
export function parse_openrocket_csv(text: string): SimProfile {
  const lines = text.split(/\r?\n/);

  let header: string[] | null = null;
  const transitions: PhaseTransition[] = [];
  let recovery_count = 0;
  let last_deploy_t = -Infinity;
  const data_rows: string[][] = [];

  // Matches inline event comments: "Event APOGEE occurred at t=12.34 seconds"
  const event_comment_re = /event\s+([A-Z_]+)\s+occurred\s+at\s+t\s*=\s*([0-9.+\-eE]+)/i;

  const record_event = (name: string, t: number): void => {
    if (!Number.isFinite(t)) return;

    if (is_deploy_event(name)) {
      // OpenRocket reports a charge firing AND the device deploying as separate
      // events a few ms apart — collapse them into one physical deployment.
      // The first deployment is the drogue, a later one (dual-deploy) the main.
      if (t - last_deploy_t < DEPLOY_DEDUPE_S) return;
      last_deploy_t = t;
      transitions.push({ t, phase: recovery_count === 0 ? 'DROGUE' : 'MAIN' });
      recovery_count += 1;
      return;
    }

    const phase = event_to_phase(name);
    if (phase === null) return;
    transitions.push({ t, phase });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;

    if (line.startsWith('#')) {
      const body = line.replace(/^#+\s*/, '');
      const evt = event_comment_re.exec(body);
      if (evt) {
        record_event(evt[1], parseFloat(evt[2]));
        continue;
      }
      // The header is a comment line that names columns (contains "time" + a comma).
      if (header === null && body.includes(',') && /time/i.test(body)) {
        header = body.split(',').map((s) => s.trim());
      }
      continue;
    }

    // A non-comment line that names columns can also be the header (no `#`).
    if (header === null && line.includes(',') && /time/i.test(line) && /[a-zA-Z]/.test(line)) {
      header = line.split(',').map((s) => s.trim());
      continue;
    }

    // Otherwise it is a data row.
    if (line.includes(',')) {
      data_rows.push(line.split(',').map((s) => s.trim()));
    }
  }

  if (header === null) {
    throw new Error('No column header found — is this an OpenRocket "Export simulation data" CSV?');
  }
  if (data_rows.length < 2) {
    throw new Error('CSV contains no flight data rows.');
  }

  const cols: ColumnMap = {
    time: find_column(header, ['time']),
    alt: find_column(header, ['altitude']),
    vel: find_column(header, ['vertical velocity', 'total velocity', 'velocity']),
    accel: find_column(header, ['vertical acceleration', 'total acceleration', 'acceleration']),
    mach: find_column(header, ['mach']),
    // Use the airframe's orientation from vertical (zenith / vertical
    // orientation). Angle of attack is deliberately NOT used as tilt: it is an
    // aerodynamic angle, is a meaningless transient on the launch rod, and goes
    // NaN during coast/descent in real OpenRocket exports.
    tilt: find_column(header, ['vertical orientation', 'zenith', 'tilt']),
    // Body angular rates (°/s) — used to synthesise tilt when no direct
    // orientation column is exported (see below).
    pitch_rate: find_column(header, ['pitch rate']),
    yaw_rate: find_column(header, ['yaw rate']),
    event: find_column(header, ['event'])
  };

  if (cols.time < 0) throw new Error('Required "Time" column not found in CSV.');
  if (cols.alt < 0) throw new Error('Required "Altitude" column not found in CSV.');
  if (cols.vel < 0) throw new Error('Required velocity column not found in CSV (export "Vertical velocity").');

  const num = (row: string[], idx: number): number => {
    if (idx < 0 || idx >= row.length) return 0;
    const v = parseFloat(row[idx]);
    return Number.isFinite(v) ? v : 0;
  };

  // First pass: collect raw numeric samples + any event-column transitions.
  interface RawSample {
    t: number; alt: number; vel: number; accel: number; mach: number; tilt: number;
    pr: number; yr: number;
  }
  const raw_samples: RawSample[] = [];

  for (const row of data_rows) {
    const t = parseFloat(row[cols.time]);
    if (!Number.isFinite(t)) continue; // skip non-data lines that slipped through

    if (cols.event >= 0) {
      const cell = (row[cols.event] || '').trim();
      if (cell !== '' && /[a-zA-Z]/.test(cell)) record_event(cell, t);
    }

    raw_samples.push({
      t,
      alt: num(row, cols.alt),
      vel: num(row, cols.vel),
      accel: num(row, cols.accel),
      mach: num(row, cols.mach),
      tilt: num(row, cols.tilt),
      pr: num(row, cols.pitch_rate),
      yr: num(row, cols.yaw_rate)
    });
  }

  if (raw_samples.length < 2) {
    throw new Error('CSV contains no numeric flight data rows.');
  }

  raw_samples.sort((a, b) => a.t - b.t);

  // Synthesise tilt-from-vertical when no direct orientation column was
  // exported but body angular rates are available. The nose's angular travel
  // away from vertical is the time-integral of the transverse (pitch+yaw) rate
  // magnitude; roll rate is spin about the long axis and does not change tilt.
  // This is approximate (it ignores roll/rate coupling) but gives a faithful
  // "stands up straight, then tips over under drogue/main" attitude.
  if (cols.tilt < 0 && (cols.pitch_rate >= 0 || cols.yaw_rate >= 0)) {
    let tilt_deg = 0;
    raw_samples[0].tilt = 0;
    for (let i = 1; i < raw_samples.length; i++) {
      const dt = raw_samples[i].t - raw_samples[i - 1].t;
      if (dt > 0 && dt < 5) {
        const a = raw_samples[i - 1];
        const b = raw_samples[i];
        const rate_a = Math.hypot(a.pr, a.yr);
        const rate_b = Math.hypot(b.pr, b.yr);
        tilt_deg += 0.5 * (rate_a + rate_b) * dt; // trapezoidal integration
      }
      // Wrap into [0, 180]: tilt is an unsigned angle from vertical.
      let wrapped = tilt_deg % 360;
      if (wrapped < 0) wrapped += 360;
      if (wrapped > 180) wrapped = 360 - wrapped;
      raw_samples[i].tilt = wrapped;
    }
  }

  // If the export carried no flight events, infer the phases from the
  // trajectory shape so the FSM bar and phase-gated pyro logic still work.
  if (transitions.length === 0) {
    transitions.push(...derive_phase_transitions(raw_samples));
  }

  transitions.sort((a, b) => a.t - b.t);

  // Resolve each sample's phase from the latest transition at or before its time.
  const phase_at = (t: number): SimPhase => {
    let phase: SimPhase = 'PAD';
    for (const tr of transitions) {
      if (tr.t <= t + 1e-9) phase = tr.phase;
      else break;
    }
    return phase;
  };

  let apogee_m = -Infinity;
  const samples: SimKeyframe[] = raw_samples.map((s) => {
    if (s.alt > apogee_m) apogee_m = s.alt;
    return {
      phase: phase_at(s.t),
      t: s.t,
      alt: s.alt,
      vel: s.vel,
      mach: s.mach,
      accel: s.accel,
      tilt: s.tilt
    };
  });

  return {
    samples,
    duration_s: samples[samples.length - 1].t,
    apogee_m: Number.isFinite(apogee_m) ? apogee_m : 0
  };
}
