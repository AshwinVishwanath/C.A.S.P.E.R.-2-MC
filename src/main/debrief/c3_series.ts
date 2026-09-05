/**
 * Turns decoded Casper-3 records into plottable series and flight statistics.
 *
 * Two jobs the renderer should not do: applying sensor scales and frame
 * rotations (which are firmware/hardware facts, not display choices), and
 * decimating a 400 Hz stream down to something a chart can draw without
 * shipping 150k points per series over IPC.
 *
 * FRAME. The LSM6DSO32 is the body reference (identity, nose = body +Y).
 * The BMI088 and ADXL372 sit +90 deg about Z from it, so their samples are
 * rotated into the body frame here with `body = [-n[1], n[0], n[2]]` and NO
 * Z flip (CASPER3_FACTS.md — an apparent flip was an offset artifact).
 * Rotating in one place is what makes an IMU cross-check meaningful: three
 * sensors plotted in three different frames disagree for reasons that have
 * nothing to do with the sensors.
 *
 * @module debrief/c3_series
 */

import {
  LSM6_ACCEL_SCALE,
  LSM6_GYRO_SCALE,
  ADXL_SCALE,
  BMI_ACCEL_SCALE,
  BMI_GYRO_SCALE,
  BARO_SCALE,
  TEMP_SCALE,
  fsm_name,
  type HrRecord,
  type LrRecord,
  type BmiRecord,
} from './c3_log_format';
import type { DecodedFlight } from './c3_decode';

// ---------------------------------------------------------------------------
// Frames and scaling
// ---------------------------------------------------------------------------

/** Rotate a BMI088/ADXL372 chip-frame triple into the LSM6 body frame. */
export function to_body(n: readonly [number, number, number]): [number, number, number] {
  return [-n[1], n[0], n[2]];
}

const mag3 = (v: readonly [number, number, number]): number =>
  Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);

const scale3 = (
  v: readonly [number, number, number],
  k: number,
): [number, number, number] => [v[0] * k, v[1] * k, v[2] * k];

// ---------------------------------------------------------------------------
// Series shapes
// ---------------------------------------------------------------------------

/** A decimated series. `t` is seconds; `lo`/`hi` bound what was averaged into
 *  each point, so a chart can draw a min/max band and never hide a spike that
 *  decimation would otherwise erase. */
export interface Series {
  key: string;
  label: string;
  unit: string;
  t: number[];
  v: number[];
  lo: number[];
  hi: number[];
}

export interface StateSpan {
  state: number;
  name: string;
  t_start: number;
  t_end: number;
}

export interface FlightStats {
  flight_id: number;
  duration_s: number;
  hr_count: number;
  lr_count: number;
  bmi_count: number;
  hr_crc_failures: number;
  bmi_crc_failures: number;
  hr_rate_hz: number;
  apogee_m: number | null;
  apogee_t_s: number | null;
  max_vel_mps: number | null;
  max_accel_g: number | null;
  max_accel_t_s: number | null;
  max_highg_g: number | null;
  max_gyro_dps: number | null;
  burnout_t_s: number | null;
  landed_t_s: number | null;
  gps_best_sats: number | null;
  radio_rssi_min: number | null;
  radio_rssi_max: number | null;
}

export interface FlightSeries {
  stats: FlightStats;
  states: StateSpan[];
  /** Grouped for the UI: each group becomes one chart panel. */
  groups: { key: string; title: string; unit: string; series: Series[] }[];
}

// ---------------------------------------------------------------------------
// Decimation
// ---------------------------------------------------------------------------

/**
 * Bucket a raw (t, v) stream into at most `max_points` points.
 *
 * Each bucket contributes ONE point at its mean time carrying the mean value
 * plus the true min and max seen inside it. Peak acceleration in a rocket
 * lasts a handful of samples at 400 Hz; plain stride-sampling drops it and
 * quietly understates the number an operator is looking for.
 */
export function decimate(
  t_raw: number[],
  v_raw: number[],
  key: string,
  label: string,
  unit: string,
  max_points = 1400,
): Series {
  const n = t_raw.length;
  const out: Series = { key, label, unit, t: [], v: [], lo: [], hi: [] };
  if (n === 0) return out;
  if (n <= max_points) {
    out.t = t_raw.slice();
    out.v = v_raw.slice();
    out.lo = v_raw.slice();
    out.hi = v_raw.slice();
    return out;
  }

  const bucket = n / max_points;
  for (let b = 0; b < max_points; b++) {
    const start = Math.floor(b * bucket);
    const end = Math.min(n, Math.max(start + 1, Math.floor((b + 1) * bucket)));
    let lo = Infinity;
    let hi = -Infinity;
    let sum = 0;
    let t_sum = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      const v = v_raw[i];
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      sum += v;
      t_sum += t_raw[i];
      count++;
    }
    if (count === 0) continue;
    out.t.push(t_sum / count);
    out.v.push(sum / count);
    out.lo.push(lo);
    out.hi.push(hi);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Series construction
// ---------------------------------------------------------------------------

/** Index of the peak of `v`, or -1 when empty / all non-finite. */
function argmax(v: number[]): number {
  let best = -1;
  let best_v = -Infinity;
  for (let i = 0; i < v.length; i++) {
    if (Number.isFinite(v[i]) && v[i] > best_v) {
      best_v = v[i];
      best = i;
    }
  }
  return best;
}

function finite_max(v: number[]): number | null {
  const i = argmax(v);
  return i < 0 ? null : v[i];
}

/**
 * Build every chart series and the summary statistics for one flight.
 *
 * `t = 0` is the first HR record of the flight, not the FC's boot tick: the
 * raw timestamps are HAL_GetTick() milliseconds since power-on, which for a
 * 20-minute pad dwell puts launch at t = 1200 s and makes every chart
 * unreadable. Where the FSM leaves PAD the transition is reported in `states`
 * so the launch instant stays visible.
 */
export function build_series(flight: DecodedFlight): FlightSeries {
  const hr: HrRecord[] = flight.hr;
  const lr: LrRecord[] = flight.lr;
  const bmi: BmiRecord[] = flight.bmi;

  const t0 =
    hr.length > 0
      ? hr[0].timestamp_ms
      : lr.length > 0
        ? lr[0].timestamp_ms
        : bmi.length > 0
          ? bmi[0].timestamp_ms
          : 0;
  const secs = (ms: number): number => (ms - t0) / 1000;

  // --- HR-derived ---------------------------------------------------------
  const t_hr: number[] = [];
  const alt: number[] = [];
  const vel: number[] = [];
  const ax: number[] = [];
  const ay: number[] = [];
  const az: number[] = [];
  const amag: number[] = [];
  const gx: number[] = [];
  const gy: number[] = [];
  const gz: number[] = [];
  const gmag: number[] = [];
  const highg: number[] = [];
  const baro: number[] = [];
  const imu_temp: number[] = [];
  const baro_temp: number[] = [];

  let hr_crc_failures = 0;
  for (const r of hr) {
    if (!r.crc_ok) hr_crc_failures++;
    t_hr.push(secs(r.timestamp_ms));
    alt.push(r.ekf_alt_m);
    vel.push(r.ekf_vel_mps);

    const a = scale3(r.lsm6_accel, LSM6_ACCEL_SCALE);
    ax.push(a[0]);
    ay.push(a[1]);
    az.push(a[2]);
    amag.push(mag3(a));

    const g = scale3(r.lsm6_gyro, LSM6_GYRO_SCALE);
    gx.push(g[0]);
    gy.push(g[1]);
    gz.push(g[2]);
    gmag.push(mag3(g));

    // ADXL372 shares the BMI's +90 deg about Z offset from the body frame.
    highg.push(mag3(scale3(to_body(r.adxl372), ADXL_SCALE)));
    baro.push(r.baro_pressure * BARO_SCALE);
    imu_temp.push(r.imu_temp * TEMP_SCALE);
    baro_temp.push(r.baro_temp * TEMP_SCALE);
  }

  // --- BMI-derived (rotated into body frame) ------------------------------
  const t_bmi: number[] = [];
  const b_amag: number[] = [];
  const b_gmag: number[] = [];
  const b_temp: number[] = [];
  let bmi_crc_failures = 0;
  for (const r of bmi) {
    if (!r.crc_ok) bmi_crc_failures++;
    t_bmi.push(secs(r.timestamp_ms));
    b_amag.push(mag3(scale3(to_body(r.accel), BMI_ACCEL_SCALE)));
    b_gmag.push(mag3(scale3(to_body(r.gyro), BMI_GYRO_SCALE)));
    b_temp.push(r.temp * TEMP_SCALE);
  }

  // --- LR-derived ---------------------------------------------------------
  const t_lr: number[] = [];
  const rssi: number[] = [];
  const snr: number[] = [];
  const sats: number[] = [];
  const gps_alt: number[] = [];
  const cont: number[][] = [[], [], [], []];
  for (const r of lr) {
    t_lr.push(secs(r.timestamp_ms));
    rssi.push(r.radio_rssi);
    snr.push(r.radio_snr);
    sats.push(r.gps_sats);
    gps_alt.push(r.gps_alt_msl_m);
    for (let i = 0; i < 4; i++) cont[i].push(r.pyro_cont_adc[i]);
  }

  // --- FSM spans ----------------------------------------------------------
  const states: StateSpan[] = [];
  for (let i = 0; i < hr.length; i++) {
    const s = hr[i].fsm_state;
    const t = t_hr[i];
    const last = states[states.length - 1];
    if (last && last.state === s) {
      last.t_end = t;
    } else {
      if (last) last.t_end = t;
      states.push({ state: s, name: fsm_name(s), t_start: t, t_end: t });
    }
  }

  // --- Statistics ---------------------------------------------------------
  const apogee_i = argmax(alt);
  const accel_i = argmax(amag);
  // Burnout is the BOOST -> COAST* transition, read from the FSM rather than
  // guessed from the accel trace, because a sustainer re-light makes "the
  // moment thrust stops" ambiguous but the state machine unambiguous.
  const boost = states.find((s) => s.name === 'BOOST');
  const landed = states.find((s) => s.name === 'LANDED');

  const stats: FlightStats = {
    flight_id: flight.index.flight_id,
    duration_s:
      t_hr.length > 0
        ? t_hr[t_hr.length - 1] - t_hr[0]
        : t_lr.length > 0
          ? t_lr[t_lr.length - 1] - t_lr[0]
          : 0,
    hr_count: hr.length,
    lr_count: lr.length,
    bmi_count: bmi.length,
    hr_crc_failures,
    bmi_crc_failures,
    hr_rate_hz:
      t_hr.length > 1 ? (t_hr.length - 1) / Math.max(1e-6, t_hr[t_hr.length - 1] - t_hr[0]) : 0,
    apogee_m: apogee_i < 0 ? null : alt[apogee_i],
    apogee_t_s: apogee_i < 0 ? null : t_hr[apogee_i],
    max_vel_mps: finite_max(vel),
    max_accel_g: accel_i < 0 ? null : amag[accel_i],
    max_accel_t_s: accel_i < 0 ? null : t_hr[accel_i],
    max_highg_g: finite_max(highg),
    max_gyro_dps: finite_max(gmag),
    burnout_t_s: boost ? boost.t_end : null,
    landed_t_s: landed ? landed.t_start : null,
    gps_best_sats: sats.length > 0 ? Math.max(...sats) : null,
    radio_rssi_min: rssi.length > 0 ? Math.min(...rssi) : null,
    radio_rssi_max: rssi.length > 0 ? Math.max(...rssi) : null,
  };

  // --- Panels -------------------------------------------------------------
  const groups: FlightSeries['groups'] = [
    {
      key: 'altitude',
      title: 'Altitude',
      unit: 'm',
      series: [
        decimate(t_hr, alt, 'ekf_alt', 'EKF altitude', 'm'),
        decimate(t_lr, gps_alt, 'gps_alt', 'GPS altitude MSL', 'm'),
      ],
    },
    {
      key: 'velocity',
      title: 'Vertical velocity',
      unit: 'm/s',
      series: [decimate(t_hr, vel, 'ekf_vel', 'EKF velocity', 'm/s')],
    },
    {
      key: 'accel_axes',
      title: 'Acceleration — body frame',
      unit: 'g',
      series: [
        decimate(t_hr, ay, 'a_y', 'LSM6 +Y (nose)', 'g'),
        decimate(t_hr, ax, 'a_x', 'LSM6 X', 'g'),
        decimate(t_hr, az, 'a_z', 'LSM6 Z', 'g'),
      ],
    },
    {
      key: 'accel_cross',
      title: 'Acceleration magnitude — IMU cross-check',
      unit: 'g',
      series: [
        decimate(t_hr, amag, 'a_lsm6', 'LSM6DSO32', 'g'),
        decimate(t_bmi, b_amag, 'a_bmi', 'BMI088', 'g'),
        decimate(t_hr, highg, 'a_adxl', 'ADXL372 (high-g)', 'g'),
      ],
    },
    {
      key: 'gyro',
      title: 'Angular rate — body frame',
      unit: 'deg/s',
      series: [
        decimate(t_hr, gmag, 'g_lsm6', 'LSM6DSO32 |w|', 'deg/s'),
        decimate(t_bmi, b_gmag, 'g_bmi', 'BMI088 |w|', 'deg/s'),
        decimate(t_hr, gy, 'g_roll', 'LSM6 roll rate (+Y)', 'deg/s'),
      ],
    },
    {
      key: 'baro',
      title: 'Barometric pressure',
      unit: 'hPa',
      series: [decimate(t_hr, baro, 'baro', 'MS5611', 'hPa')],
    },
    {
      key: 'temp',
      title: 'Die temperature',
      unit: '°C',
      series: [
        decimate(t_hr, imu_temp, 't_lsm6', 'LSM6DSO32', '°C'),
        decimate(t_bmi, b_temp, 't_bmi', 'BMI088 accel die', '°C'),
        decimate(t_hr, baro_temp, 't_baro', 'MS5611', '°C'),
      ],
    },
    {
      key: 'radio',
      title: 'Radio link',
      unit: 'dB',
      series: [
        decimate(t_lr, rssi, 'rssi', 'RSSI', 'dBm'),
        decimate(t_lr, snr, 'snr', 'SNR', 'dB'),
      ],
    },
    {
      key: 'gps_sats',
      title: 'GPS satellites',
      unit: 'sv',
      series: [decimate(t_lr, sats, 'sats', 'Satellites used', 'sv')],
    },
    {
      key: 'pyro',
      title: 'Pyro continuity (raw ADC)',
      unit: 'counts',
      series: [
        decimate(t_lr, cont[0], 'cont1', 'Channel 1', 'counts'),
        decimate(t_lr, cont[1], 'cont2', 'Channel 2', 'counts'),
        decimate(t_lr, cont[2], 'cont3', 'Channel 3', 'counts'),
      ],
    },
  ];

  // Drop panels with nothing in them — a flight with no BMI stream or no LR
  // records should show fewer charts, not a row of empty axes.
  const non_empty = groups
    .map((g) => ({ ...g, series: g.series.filter((s) => s.t.length > 0) }))
    .filter((g) => g.series.length > 0);

  return { stats, states, groups: non_empty };
}
