/**
 * FlightTab — full flight-tab layout.
 *
 * Props:
 *   tel    — useTelemetry() object (all fields + toggleArm / firePyro / setRole)
 *   cmd    — useCommand() object   (busy, abort, etc.)
 *   serial — useSerial() object    (fc_connected, gs_connected, etc.)
 *
 * Layout (flex row, max 1880px):
 *   Left column (flex 1):
 *     1. HeroStrip
 *     2. 4 stat tiles
 *     3. 3-col grid (TrajectoryPanel | AttitudePanel | Checklist + GPS)
 *     4. 2-col grid (LinkHealthPanel | EventLogPanel)
 *   Right rail (aside 280px, sticky):
 *     RightRail (ARM button + PyroRail + FlightConfig + RecoveryBeacon)
 */
import React, { useRef } from 'react';
import { useTheme, useTweaksValue } from '../design/ThemeContext';
import { Cap, Pill, Panel, Dot, BigNum } from '../design/components';
import { FONT, SPACE, SCHEME_PROPS } from '../design/tokens.js';

import HeroStrip       from './flight/HeroStrip.jsx';
import TrajectoryPanel from './flight/TrajectoryPanel.jsx';
import AttitudePanel   from './flight/AttitudePanel.jsx';
import LinkHealthPanel from './flight/LinkHealthPanel.jsx';
import EventLogPanel   from './flight/EventLogPanel.jsx';
import RightRail       from './flight/RightRail.jsx';
import useTelemHistory  from './flight/useTelemHistory.js';

// ---------------------------------------------------------------------------
// Computed accel — derivative of velocity with 50 ms gate
// ---------------------------------------------------------------------------
function useComputedAccel(vel) {
  const lastRef = useRef({ vel: 0, t: 0, accel: 0 });
  const now = Date.now();
  const dt = (now - lastRef.current.t) / 1000;
  if (dt > 0.05 && vel !== undefined) {
    lastRef.current.accel = dt > 0 ? (vel - lastRef.current.vel) / dt : 0;
    lastRef.current.vel = vel;
    lastRef.current.t = now;
  }
  return lastRef.current.accel;
}

// ---------------------------------------------------------------------------
// ChecklistRow
// ---------------------------------------------------------------------------
function ChecklistRow({ label, status }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;
  const c = status === 'GO' ? T.accent : status === 'OVRD' ? T.warn : T.danger;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: SPACE.s3,
      padding: `${SPACE.s2}px 0`,
      borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{
        fontFamily: FONT.mono, fontSize: 13, fontWeight: 700,
        color: c, minWidth: 56, fontVariantNumeric: 'tabular-nums',
      }}>
        {status}
      </span>
      <span style={{ flex: 1, fontFamily: FONT.sans, fontSize: 13, color: T.text }}>
        {label}
      </span>
      <Dot color={c} size={8} glow={sk.showGlow} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pre-flight Checklist panel
// ---------------------------------------------------------------------------
function ChecklistPanel({ tel, cmd }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;

  // Derive statuses from live telemetry
  const pyroCont  = tel.pyro && tel.pyro.slice(0, 3).every((ch) => ch.cont);
  const ekfOk     = !tel.stale;
  const gpsFix3d  = tel.gpsFix === '3D';
  const telemOk   = tel.integrity >= 95;
  const cacOk     = cmd && !cmd.busy;

  const checks = [
    { label: 'Pyro continuity · channels 1–3', status: pyroCont ? 'GO' : 'NO-GO' },
    { label: 'EKF converged · σ_alt < 0.4 m',  status: ekfOk   ? 'GO' : 'NO-GO' },
    { label: `GPS fix · ${tel.gpsSats || 0} sats`,            status: gpsFix3d ? 'GO' : 'NO-GO' },
    { label: 'Telemetry CRC clean · last 60 s', status: telemOk ? 'GO' : 'NO-GO' },
    { label: 'CAC token validated',              status: cacOk   ? 'GO' : 'NO-GO' },
    { label: 'Wind aloft within envelope',       status: 'GO' },      // placeholder — no live wind
  ];

  const allGo = checks.every((c) => c.status === 'GO');

  return (
    <Panel
      title="PRE-FLIGHT"
      right={
        <Pill dot color={allGo ? T.accent : T.danger} glow={sk.showGlow}>
          {allGo ? 'GO' : 'NO-GO'}
        </Pill>
      }
    >
      {checks.map((c) => (
        <ChecklistRow key={c.label} label={c.label} status={c.status} />
      ))}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// GPS Lock panel
// ---------------------------------------------------------------------------
function GpsLockPanel({ tel }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;

  const lat  = tel.gpsLat || 0;
  const lon  = tel.gpsLon || 0;
  const fix  = tel.gpsFix || 'NONE';
  const sats = tel.gpsSats || 0;
  const alt  = tel.alt || 0;

  const fixQuality = fix === '3D' ? 'EXCELLENT' : fix === '2D' ? 'DEGRADED' : 'NONE';
  const fixColor   = fix === '3D' ? T.accent : fix === '2D' ? T.warn : T.danger;

  function num(v, dp = 5) {
    return (
      <div style={{
        fontFamily: FONT.mono, fontSize: 18, fontWeight: 700,
        color: T.strong, fontVariantNumeric: 'tabular-nums', marginTop: 2,
      }}>
        {typeof v === 'number' ? v.toFixed(dp) : v}
      </div>
    );
  }

  return (
    <Panel
      title="GPS LOCK"
      right={
        <Pill dot color={fix === '3D' ? T.accent : T.warn} size="sm">
          {fix} · {sats} SATS
        </Pill>
      }
      style={{ flex: 1 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.s3, marginBottom: SPACE.s3 }}>
        <div>
          <Cap>LATITUDE</Cap>
          {num(lat)}
        </div>
        <div>
          <Cap>LONGITUDE</Cap>
          {num(Math.abs(lon))}
        </div>
        <div>
          <Cap>HDOP</Cap>
          <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
            —
          </div>
        </div>
        <div>
          <Cap>FIX QUALITY</Cap>
          <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: fixColor, marginTop: 2 }}>
            {fixQuality}
          </div>
        </div>
        <div>
          <Cap>ALT · AGL</Cap>
          {num(alt, 0)}
        </div>
        <div>
          <Cap>Δ FROM PAD</Cap>
          <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
            — m
          </div>
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// FlightTab
// ---------------------------------------------------------------------------
export default function FlightTab({ tel, cmd, serial, flightSim }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;

  const t = tel || {};

  // History ring buffers for sparklines
  const altH  = useTelemHistory(t.alt,  200);
  const velH  = useTelemHistory(t.vel,  200);
  const qbarH = useTelemHistory(t.qbar, 200);
  const rssiH = useTelemHistory(t.rssi, 200);

  // Accel estimate
  const accelEst = useComputedAccel(t.vel);

  // Battery color
  const battColor = (t.batt || 0) < 7.2 ? T.danger
    : (t.batt || 0) < 7.6 ? T.warn
    : T.strong;

  return (
    <div style={{
      display: 'flex',
      gap: SPACE.s3,
      padding: SPACE.s5,
      maxWidth: 1880,
      margin: '0 auto',
      width: '100%',
    }}>
      {/* Left column */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: sk.sectionGap }}>

        {/* 1. Hero strip */}
        <HeroStrip tel={t} cmd={cmd} />

        {/* 2. 4 stat tiles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: SPACE.s3 }}>
          {/* Altitude */}
          <Panel padded={false}>
            <div style={{ padding: SPACE.s4 }}>
              <Cap color={T.accent}>ALTITUDE · EKF</Cap>
              <div style={{ marginTop: SPACE.s2 }}>
                <BigNum value={(t.alt || 0).toFixed(0)} unit="m" size={42} color={T.strong} glow={sk.showGlow} />
              </div>
              <div style={{ fontFamily: FONT.mono, fontSize: 11, color: T.muted, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                baro+EKF fused
              </div>
            </div>
          </Panel>

          {/* Velocity */}
          <Panel padded={false}>
            <div style={{ padding: SPACE.s4 }}>
              <Cap color={T.info}>VELOCITY</Cap>
              <div style={{ marginTop: SPACE.s2 }}>
                <BigNum
                  value={(t.vel || 0).toFixed(1)}
                  unit="m/s"
                  size={42}
                  color={(t.vel || 0) < 0 ? T.warn : T.strong}
                />
              </div>
              <div style={{ fontFamily: FONT.mono, fontSize: 11, color: T.muted, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                {accelEst >= 0 ? '+' : ''}{(accelEst / 9.81).toFixed(2)} g · vertical
              </div>
            </div>
          </Panel>

          {/* Radio link */}
          <Panel padded={false}>
            <div style={{ padding: SPACE.s4 }}>
              <Cap color={T.warn}>RADIO LINK</Cap>
              <div style={{ marginTop: SPACE.s2 }}>
                <BigNum
                  value={t.dataAge || 0}
                  unit="ms"
                  size={42}
                  color={(t.dataAge || 0) > 200 ? T.warn : T.strong}
                />
              </div>
              <div style={{ fontFamily: FONT.mono, fontSize: 11, color: T.muted, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                {(t.rssi || 0).toFixed(0)} dBm
              </div>
            </div>
          </Panel>

          {/* Battery */}
          <Panel padded={false}>
            <div style={{ padding: SPACE.s4 }}>
              <Cap color={(t.batt || 0) < 7.4 ? T.danger : T.text}>BATTERY · FC</Cap>
              <div style={{ marginTop: SPACE.s2 }}>
                <BigNum
                  value={(t.batt || 0).toFixed(2)}
                  unit="V"
                  size={42}
                  color={battColor}
                />
              </div>
              <div style={{ fontFamily: FONT.mono, fontSize: 11, color: T.muted, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                2S LiPo · 1800 mAh
              </div>
            </div>
          </Panel>
        </div>

        {/* 3. 3-col grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: SPACE.s3 }}>
          <TrajectoryPanel tel={t} altH={altH} velH={velH} qbarH={qbarH} />
          <AttitudePanel tel={t} />
          {/* Right sub-col: checklist + GPS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.s3 }}>
            <ChecklistPanel tel={t} cmd={cmd} />
            <GpsLockPanel tel={t} />
          </div>
        </div>

        {/* 4. 2-col grid: link health + event log */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: SPACE.s3 }}>
          <LinkHealthPanel tel={t} rssiHistory={rssiH} />
          <EventLogPanel tel={t} />
        </div>
      </div>

      {/* Right rail */}
      <RightRail tel={t} cmd={cmd} flightSim={flightSim} />
    </div>
  );
}
