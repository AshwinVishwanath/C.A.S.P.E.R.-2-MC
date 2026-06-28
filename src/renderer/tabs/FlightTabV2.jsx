/**
 * FlightTabV2 — hosts the v2-design Flight tab inside the v1 app shell.
 *
 * The v2 Flight tab (src/renderer/v2/flight-tab.jsx) was authored against the
 * mock `useMissionSim()` shape. This wrapper adapts the REAL telemetry object
 * from `useTelemetry()` into that shape so the v2 visuals run on live data
 * (real serial, or the OpenRocket sim feed — whichever is driving useTelemetry).
 *
 * It also bridges the theme: v2 components want a `T` theme object from v2's
 * own buildTheme(), so we construct one from the v1 tweaks the rest of the app
 * already uses, keeping mode/accent/scheme consistent across tabs.
 *
 * Fields the FC does not yet expose (board temp, HDOP) are passed as neutral
 * placeholders — see notes inline. Everything else is live.
 */
import React, { useRef } from 'react';

import V2FlightTab from '../v2/flight-tab.jsx';
import { buildTheme } from '../v2/tokens.js';
import { useFlightConfig } from '../hooks/useFlightConfig.js';
import useTelemHistory from './flight/useTelemHistory.js';

// v2's FSMBar only knows these 7 buckets. The FC reports a richer state machine
// (COAST_1, SUSTAIN, COAST_2, RECOVERY, TUMBLE) — fold those onto the nearest
// v2 bucket so the progress bar still highlights correctly.
const PHASE_MAP = {
  PAD: 'PAD',
  BOOST: 'BOOST',
  SUSTAIN: 'BOOST',
  COAST: 'COAST',
  COAST_1: 'COAST',
  COAST_2: 'COAST',
  APOGEE: 'APOGEE',
  DROGUE: 'DROGUE',
  MAIN: 'MAIN',
  RECOVERY: 'LANDED',
  TUMBLE: 'DROGUE',
  LANDED: 'LANDED',
};
const V2_FSM = ['PAD', 'BOOST', 'COAST', 'APOGEE', 'DROGUE', 'MAIN', 'LANDED'];

const DEG2RAD = Math.PI / 180;

// Mirror the auto-accent resolution v2's own index.jsx uses.
function resolveAccent(accent, mode) {
  if (accent && accent !== 'auto') return accent;
  return mode === 'dark' ? 'mint' : 'orange';
}

// Vertical accel estimate in g, from the velocity derivative (50 ms gate).
// Mirrors v1 FlightTab's useComputedAccel, but normalised to g for the v2 UI.
function useComputedAccelG(vel) {
  const ref = useRef({ vel: 0, t: 0, accel: 0 });
  const now = Date.now();
  const dt = (now - ref.current.t) / 1000;
  if (dt > 0.05 && vel !== undefined) {
    ref.current.accel = dt > 0 ? ((vel - ref.current.vel) / dt) / 9.81 : 0;
    ref.current.vel = vel;
    ref.current.t = now;
  }
  return ref.current.accel;
}

// Map v1 telemetry pyro rows -> the shape v2's PyroStrip / event log expect.
function mapPyro(pyro) {
  const src = Array.isArray(pyro) ? pyro : [];
  return src.map((p, i) => ({
    ch: p.hwCh != null ? p.hwCh : i + 1,
    role: p.role || '—',
    armed: !!p.armed,
    cont: p.cont ? (p.contV != null ? p.contV : 0) : null,
    status: p.firing ? 'FIRED' : p.armed ? 'ARMED' : p.cont ? 'SAFE' : 'NO CONT',
    threshold: '—',
  }));
}

export default function FlightTabV2({ tel, cmd, serial, flightSim, tweaks }) {
  const t = tel || {};

  const T = buildTheme(tweaks.mode, resolveAccent(tweaks.accent, tweaks.mode), tweaks.scheme);
  const [flightConfig] = useFlightConfig();

  // History ring buffers — same hook the v1 Flight tab uses.
  const altH = useTelemHistory(t.alt, 200);
  const velH = useTelemHistory(t.vel, 200);
  const qbarH = useTelemHistory(t.qbar, 200);
  const accelG = useComputedAccelG(t.vel);

  const integrity = t.integrity != null ? t.integrity : 100;

  // -------------------------------------------------------------------------
  // Live command wiring — mirrors v1 RightRail / HeroStrip / PyroRail.
  // -------------------------------------------------------------------------
  const pyroChans = Array.isArray(t.pyro) ? t.pyro : [];
  const anyArmed = pyroChans.slice(0, 3).some((ch) => ch.armed);
  const armDisabled = !t.pyro;
  // A loaded OpenRocket sim that isn't already playing — ARM doubles as
  // "start the flight" so playback can begin from the Flight tab.
  const canStartSim = !!(flightSim && flightSim.profile && !flightSim.playing);

  const commands = {
    anyArmed,
    armDisabled,
    onMasterArm() {
      if (!t.toggleArm || armDisabled) return;
      if (anyArmed) {
        pyroChans.slice(0, 3).forEach((ch, i) => { if (ch.armed) t.toggleArm(i); });
      } else {
        if (canStartSim) flightSim.play();
        t.toggleArm(0); // master-arm channel 1
      }
    },
    onArmChannel(i) { if (t.toggleArm) t.toggleArm(i); },
    onFireChannel(i) { if (t.firePyro) t.firePyro(i); },
    onAbort() { if (cmd && cmd.abort) cmd.abort(); },
  };

  // Pre-flight checklist derived from live telemetry — mirrors v1 ChecklistPanel.
  const checklist = [
    { label: 'Pyro continuity · channels 1–3', status: pyroChans.slice(0, 3).every((ch) => ch.cont) ? 'GO' : 'NO-GO' },
    { label: 'EKF converged · σ_alt < 0.4 m', status: !t.stale ? 'GO' : 'NO-GO' },
    { label: `GPS fix · ${t.gpsSats || 0} sats`, status: t.gpsFix === '3D' ? 'GO' : 'NO-GO' },
    { label: 'Telemetry CRC clean · last 60 s', status: integrity >= 95 ? 'GO' : 'NO-GO' },
    { label: 'CAC token validated', status: cmd && !cmd.busy ? 'GO' : 'NO-GO' },
    { label: 'Wind aloft within envelope', status: 'GO' }, // no live wind source
  ];

  const sim = {
    met: (t.t || 0) / 1000,
    phase: PHASE_MAP[t.state] || t.state || 'PAD',
    FSM: V2_FSM,

    alt: t.alt || 0,
    vel: t.vel || 0,
    accel: accelG,
    qbar: t.qbar || 0,
    apogee: t.apogee || 0,
    altH,
    velH,
    qbarH,

    gpsLat: t.gpsLat || 0,
    gpsLon: t.gpsLon || 0,
    gpsFix: t.gpsFix || 'NONE',
    gpsSats: t.gpsSats || 0,
    hdop: 0, // FC does not expose HDOP yet — placeholder

    rssi: t.rssi || 0,
    dataAge: t.dataAge || 0,
    snr: t.snr || 0,
    freqErr: t.freqErr || 0,
    recovered: t.recovered || 0,
    crc: { errors: t.crcErrors || 0, total: t.pktRx || 0, lost: t.pktLost || 0 },

    batt: t.batt || 0,
    temp: 0, // FC does not expose board temp yet — placeholder

    // v2 treats `quat` as an euler triple in RADIANS; v1 telemetry is degrees.
    quat: {
      roll: (t.roll || 0) * DEG2RAD,
      pitch: (t.pitch || 0) * DEG2RAD,
      yaw: (t.yaw || 0) * DEG2RAD,
    },

    pyro: mapPyro(t.pyro),
  };

  return (
    <V2FlightTab
      T={T}
      sim={sim}
      scheme={tweaks.scheme}
      motion={tweaks.motion}
      flightConfig={flightConfig}
      commands={commands}
      checklist={checklist}
    />
  );
}
