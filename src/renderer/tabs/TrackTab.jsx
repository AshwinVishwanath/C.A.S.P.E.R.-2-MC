/**
 * TrackTab — downrange tracking tab.
 *
 * Props:
 *   tel    — useTelemetry() object
 *   serial — useSerial() object (passed through to FlightLogReadout)
 *
 * Layout:
 *   Header (bearing / range / sats status)
 *   2-col grid:
 *     GPS · Delta Scope  (420px Radar + 4 stat tiles)
 *     ATTITUDE · QUATERNION  (420px Rocket3D + roll/tilt + pad-gated upright reset)
 *   Recovery · Walk To It (ground track + copy-coordinates + QR — see track/RecoveryPanel.jsx)
 *   Flight log readout (wraps FlightLogPanel)
 */
import React, { useState } from 'react';
import { useTheme, useTweaksValue } from '../design/ThemeContext';
import { Cap, Pill, Panel, Btn } from '../design/components';
import { Radar, Rocket3D } from '../design/instruments';
import { FONT, SPACE, TYPE, SCHEME_PROPS } from '../design/tokens.js';
import FlightLogReadout from './track/FlightLogReadout.jsx';
import RecoveryPanel from './track/RecoveryPanel.jsx';
import { GsStatusPanel } from '../components/GsStatusPanel.jsx';

// Angle between the nose (body +Y) and nav-frame vertical (+Z), in degrees.
// 0 deg = upright, 90 deg = horizontal. Unlike a full roll/pitch/yaw Euler
// decomposition this is a single dot-product angle, so it stays well-behaved
// (no gimbal-lock jump) exactly where a rocket spends most of its flight:
// pointing near-vertical. See ORIENTATION_SPEC.md sec 7.2-7.3 for the frame
// convention (body +Y = nose, nav frame Z-up).
function quatTiltDeg(q) {
  const [w, x, y, z] = q || [1, 0, 0, 0];
  const cosTilt = Math.max(-1, Math.min(1, 2 * (w * x + y * z)));
  return Math.acos(cosTilt) * (180 / Math.PI);
}

// Hamilton product a (x) b, both [w, x, y, z].
function qmul(a, b) {
  const [aw, ax, ay, az] = a, [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}
function qconj(q) {
  return [q[0], -q[1], -q[2], -q[3]];
}

// Pad/upright reference quaternion in the FC's raw body->nav frame
// (flight/nav/nav_config.c NAV_Q_UPRIGHT, ORIENTATION_SPEC.md sec 3.3):
// body +Y (nose) aligned with nav +Z (vertical).
const NAV_Q_UPRIGHT = [Math.SQRT1_2, Math.SQRT1_2, 0, 0];

// "Reset to upright" tare, gauge-cage style: press it once while confirmed
// upright and every later reading is corrected by the same fixed offset,
// so real motion afterward still shows live -- it does not freeze the
// picture. offset = conj(q_at_press) (x) NAV_Q_UPRIGHT, applied on the
// right of each new raw quaternion (q(t) (x) offset). Verified numerically:
// tilt reads exactly 0 deg at the press instant and exactly tracks a real
// tip angle afterward, for arbitrary tip axes, regardless of how wrong the
// quaternion was at press time.
function applyUprightTare(liveQuat, offset) {
  return offset ? qmul(liveQuat, offset) : liveQuat;
}

// Simple haversine-style range (flat-earth approx, metres)
function gpsRange(lat1, lon1, lat2, lon2) {
  const dy = (lat2 - lat1) * 111320;
  const dx = (lon2 - lon1) * 111320 * Math.cos(lat1 * Math.PI / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

function gpsBearing(lat1, lon1, lat2, lon2) {
  const dy = (lat2 - lat1) * 111320;
  const dx = (lon2 - lon1) * 111320 * Math.cos(lat1 * Math.PI / 180);
  const brg = Math.atan2(dx, dy) * 180 / Math.PI;
  return brg < 0 ? brg + 360 : brg;
}

export default function TrackTab({ tel, serial }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const motion = tweaks.motion;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;

  const t = tel || {};
  const isGlassy = scheme === 'obsidian' || scheme === 'fusion';

  // GPS now reports absolute coordinates (see FROZEN WIRE CONTRACT FC_MSG_GPS) —
  // there is no separate transmitted pad/ground reference point, so there is no
  // real "pad origin" to reconstruct or latch here any more.
  const rocketLat = t.gpsLat || 0;
  const rocketLon = t.gpsLon || 0;
  const pLat = rocketLat;
  const pLon = rocketLon;
  const connected = serial && serial.gs_connected;

  const range_m   = gpsRange(pLat, pLon, rocketLat, rocketLon);
  const bearing   = gpsBearing(pLat, pLon, rocketLat, rocketLon);
  const rangeStr  = range_m >= 1000
    ? `${(range_m / 1000).toFixed(2)} km`
    : `${range_m.toFixed(0)} m`;

  // Manual "reset to upright" tare for the 3D attitude view -- an aircraft
  // attitude-indicator "cage" knob, not a freeze. A human on the launch team
  // who can see the actual rocket presses it while it is confirmed upright;
  // every later reading is corrected by the fixed offset computed at that
  // instant, so the display keeps tracking real motion live afterward, just
  // measured from the corrected zero -- it never gets stuck showing a static
  // picture. Display-only: it never touches the FC's nav filter or any
  // logged telemetry, only what this panel draws. Applying a *new* tare is
  // gated to PAD (that's the only time a human can visually confirm
  // upright); an already-applied tare is a calibration and persists through
  // flight rather than being silently dropped the moment FSM leaves PAD.
  const [tareOffset, setTareOffset] = useState(null);
  const onPad = t.state === 'PAD';

  const liveQuat = t.quat || [1, 0, 0, 0];
  const roll     = t.roll || 0;
  const dispQuat = applyUprightTare(liveQuat, tareOffset);
  const tilt     = quatTiltDeg(dispQuat);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: sk.sectionGap,
      padding: SPACE.s5,
      maxWidth: 1880,
      margin: '0 auto',
      width: '100%',
    }}>
      {/* Header */}
      <div>
        <Cap color={T.accent}>TRACK · DOWNRANGE</Cap>
        <h2 style={{
          fontFamily: isGlassy ? FONT.display : FONT.cond,
          fontSize: isGlassy ? 44 : 32,
          fontWeight: isGlassy ? 500 : 700,
          color: T.strong,
          letterSpacing: '0.02em',
          textTransform: 'uppercase',
          margin: 0,
          marginTop: SPACE.s2,
          lineHeight: 1,
        }}>
          Live Tracking
        </h2>
        <div style={{
          fontFamily: FONT.mono, fontSize: TYPE.body, color: T.muted, marginTop: SPACE.s2,
        }}>
          {t.gpsFix === '3D'
            ? `Bearing ${bearing.toFixed(0)}° · range ${rangeStr} · ${t.gpsSats || 0} sats locked`
            : `GPS fix: ${t.gpsFix || 'NONE'} · ${t.gpsSats || 0} sats`}
        </div>
      </div>

      {/* 2-col: GPS radar | Attitude 3D */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.s4 }}>

        {/* GPS · Delta Scope */}
        <Panel
          title="GPS · DELTA SCOPE"
          right={
            <Pill dot color={t.gpsFix === '3D' ? T.accent : T.warn} size="sm">
              {t.gpsFix || 'NONE'} · {t.gpsSats || 0} SATS
            </Pill>
          }
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: SPACE.s3 }}>
            <Radar
              size={420}
              motion={motion}
              scheme={scheme}
              rocketLat={rocketLat}
              rocketLon={rocketLon}
              padLat={pLat}
              padLon={pLon}
              connected={connected}
            />
          </div>
          <div style={{
            borderTop: `1px solid ${T.border}`,
            padding: SPACE.s3,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: SPACE.s2,
          }}>
            <div>
              <Cap>RANGE</Cap>
              <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.accent, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {rangeStr}
              </div>
            </div>
            <div>
              <Cap>BEARING</Cap>
              <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.accent, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {bearing.toFixed(0)}°
              </div>
            </div>
            <div>
              <Cap>HDOP</Cap>
              <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                —
              </div>
            </div>
            <div>
              <Cap>FIX</Cap>
              <div style={{
                fontFamily: FONT.mono, fontSize: 18, fontWeight: 700,
                color: t.gpsFix === '3D' ? T.accent : T.warn, marginTop: 2,
              }}>
                {t.gpsFix || 'NONE'}
              </div>
            </div>
          </div>
        </Panel>

        {/* Attitude · Quaternion */}
        <Panel
          title="ATTITUDE · QUATERNION"
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.s2 }}>
              {tareOffset ? (
                <Pill dot color={T.accent} size="sm">TARED · LIVE</Pill>
              ) : (
                <Pill color={T.muted} size="sm">EKF · 200 Hz</Pill>
              )}
              <Btn
                size="xs"
                kind="secondary"
                disabled={!onPad}
                onClick={() => setTareOffset(qmul(qconj(liveQuat), NAV_Q_UPRIGHT))}
              >
                RESET TO UPRIGHT
              </Btn>
              {tareOffset && (
                <Btn size="xs" kind="ghost" onClick={() => setTareOffset(null)}>
                  CLEAR
                </Btn>
              )}
            </div>
          }
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: SPACE.s3 }}>
            <Rocket3D
              size={420}
              quat={dispQuat}
              motion={motion}
              scheme={scheme}
            />
          </div>
          {!onPad && (
            <div style={{
              padding: `0 ${SPACE.s3}px`,
              fontFamily: FONT.mono, fontSize: 11, color: T.muted,
            }}>
              {tareOffset
                ? `Tare applied on the pad is still in effect (current state: ${t.state || '—'})`
                : `Upright reset only available on the pad (current state: ${t.state || '—'})`}
            </div>
          )}
          <div style={{
            borderTop: `1px solid ${T.border}`,
            padding: SPACE.s3,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: SPACE.s2,
          }}>
            <div>
              <Cap>ROLL</Cap>
              <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {roll.toFixed(1)}°
              </div>
            </div>
            <div>
              <Cap>TILT</Cap>
              <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: tareOffset ? T.accent : T.strong, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {tilt.toFixed(1)}°
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Recovery — ground track, copy-coordinates, QR-to-phone */}
      <RecoveryPanel
        T={T}
        scheme={scheme}
        motion={motion}
        lat={rocketLat}
        lon={rocketLon}
        gpsFix={t.gpsFix}
        gpsSats={t.gpsSats}
      />

      {/* Ground-station status (GS_MSG_STATUS 0x13). Emitted at 1 Hz by the
          GS in COBS mode; until that firmware is flashed every cell reads
          "--" rather than showing a stale or invented value. */}
      <GsStatusPanel snapshot={t.gs} theme={T} />

      {/* Flight log readout */}
      <FlightLogReadout serial={serial} />
    </div>
  );
}
