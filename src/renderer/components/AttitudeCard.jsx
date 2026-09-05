/**
 * AttitudeCard — the "ATTITUDE · QUATERNION" display: Rocket3D fed the raw
 * FC body->nav quaternion, a roll/tilt readout, and a pad-gated "reset to
 * upright" tare.
 *
 * Single shared implementation so the Track tab and the Flight tab show the
 * exact same attitude display (previously the Flight tab had its own,
 * older copy that reconstructed a synthetic quaternion from roll/pitch/yaw
 * degrees instead of using the FC's real quaternion, and never got last
 * session's orientation fix). `size` controls the Rocket3D's pixel size so
 * callers can fit it into different card layouts.
 *
 * Props:
 *   t          — telemetry object (useTelemetry() shape): quat [w,x,y,z], roll (deg), state
 *   size       — Rocket3D pixel size (default 420, matches the Track tab)
 *   showGraphs — show roll/tilt history strip charts instead of the plain
 *                numeric tiles (the Flight tab's old attitude card had this
 *                in the same spot, for roll/pitch/yaw; default false, so
 *                the Track tab is unaffected)
 */
import React, { useState } from 'react';
import { useTheme, useTweaksValue } from '../design/ThemeContext';
import { Cap, Pill, Panel, Btn, Sparkline } from '../design/components';
import { Rocket3D } from '../design/instruments';
import { FONT, SPACE } from '../design/tokens.js';
import useTelemHistory from '../tabs/flight/useTelemHistory.js';

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

export function AttitudeCard({ t, size = 420, showGraphs = false }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const tel = t || {};

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
  const onPad = tel.state === 'PAD';

  const liveQuat = tel.quat || [1, 0, 0, 0];
  const roll     = tel.roll || 0;
  const dispQuat = applyUprightTare(liveQuat, tareOffset);
  const tilt     = quatTiltDeg(dispQuat);

  // History for the strip-chart view. Hooks run unconditionally regardless
  // of showGraphs (Rules of Hooks) -- cheap, and keeps the buffers warm if
  // a caller flips the prop at runtime.
  const rollH = useTelemHistory(roll, 200);
  const tiltH = useTelemHistory(tilt, 200);

  return (
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
        <Rocket3D size={size} quat={dispQuat} motion={tweaks.motion} scheme={tweaks.scheme} />
      </div>
      {!onPad && (
        <div style={{
          padding: `0 ${SPACE.s3}px`,
          fontFamily: FONT.mono, fontSize: 11, color: T.muted,
        }}>
          {tareOffset
            ? `Tare applied on the pad is still in effect (current state: ${tel.state || '—'})`
            : `Upright reset only available on the pad (current state: ${tel.state || '—'})`}
        </div>
      )}
      {showGraphs ? (
        <div style={{
          borderTop: `1px solid ${T.border}`,
          padding: SPACE.s3,
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE.s3,
        }}>
          <Sparkline data={rollH} color={T.accent} h={56} label="ROLL" unit="°" value={roll} />
          <Sparkline data={tiltH} color={tareOffset ? T.accent : T.info} h={56} label="TILT" unit="°" value={tilt} />
        </div>
      ) : (
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
      )}
    </Panel>
  );
}
