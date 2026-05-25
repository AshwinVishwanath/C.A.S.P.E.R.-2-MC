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
 *     ATTITUDE · QUATERNION  (420px Rocket3D + 3 stat tiles: roll/pitch/yaw)
 *   Flight log readout (wraps FlightLogPanel)
 */
import React, { useState, useEffect } from 'react';
import { useTheme, useTweaksValue } from '../design/ThemeContext';
import { Cap, Pill, Panel } from '../design/components';
import { Radar, Rocket3D } from '../design/instruments';
import { FONT, SPACE, TYPE, SCHEME_PROPS } from '../design/tokens.js';
import FlightLogReadout from './track/FlightLogReadout.jsx';

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

  // Latch pad origin on first valid GPS fix
  const [padLat, setPadLat] = useState(null);
  const [padLon, setPadLon] = useState(null);

  useEffect(() => {
    if (padLat === null && t.gpsLat && t.gpsLat !== 0) {
      setPadLat(t.gpsLat);
      setPadLon(t.gpsLon);
    }
  }, [t.gpsLat, t.gpsLon, padLat]);

  const rocketLat = t.gpsLat || 0;
  const rocketLon = t.gpsLon || 0;
  const pLat = padLat || rocketLat;
  const pLon = padLon || rocketLon;
  const connected = serial && serial.gs_connected;

  const range_m   = gpsRange(pLat, pLon, rocketLat, rocketLon);
  const bearing   = gpsBearing(pLat, pLon, rocketLat, rocketLon);
  const rangeStr  = range_m >= 1000
    ? `${(range_m / 1000).toFixed(2)} km`
    : `${range_m.toFixed(0)} m`;

  const roll  = t.roll  || 0;
  const pitch = t.pitch || 0;
  const yaw   = t.yaw   || 0;

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
          right={<Pill color={T.muted} size="sm">EKF · 200 Hz</Pill>}
        >
          <div style={{ display: 'flex', justifyContent: 'center', padding: SPACE.s3 }}>
            <Rocket3D
              size={420}
              quat={t.quat || [1, 0, 0, 0]}
              motion={motion}
              scheme={scheme}
            />
          </div>
          <div style={{
            borderTop: `1px solid ${T.border}`,
            padding: SPACE.s3,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: SPACE.s2,
          }}>
            <div>
              <Cap>ROLL</Cap>
              <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {roll.toFixed(1)}°
              </div>
            </div>
            <div>
              <Cap>PITCH</Cap>
              <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {pitch.toFixed(1)}°
              </div>
            </div>
            <div>
              <Cap>YAW</Cap>
              <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
                {yaw.toFixed(1)}°
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Flight log readout */}
      <FlightLogReadout serial={serial} />
    </div>
  );
}
