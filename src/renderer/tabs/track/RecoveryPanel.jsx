// RecoveryPanel.jsx — "after it lands in a field, help a human walk to it."
//
// Composes the three ROCKET RECOVERY pieces (ground track, copy-coordinates,
// QR-to-phone) into one Panel, matching TrackTab's existing panel/grid
// conventions. See GroundTrack.jsx, CopyCoordsButton.jsx, RecoveryQr.jsx and
// recovery_geo.js for the pieces themselves.
import React, { useState, useEffect } from 'react';
import { Cap, Pill, Panel, StatTile } from '../../design/components.jsx';
import { FONT, SPACE, TYPE } from '../../design/tokens.js';
import { GroundTrack } from './GroundTrack.jsx';
import { CopyCoordsButton } from './CopyCoordsButton.jsx';
import { RecoveryQr } from './RecoveryQr.jsx';
import { formatCoordPair, isValidFix, pickStableFix, STABLE_FIX_HYSTERESIS_M } from './recovery_geo.js';

/**
 * Props:
 *   T, scheme, motion — design-system conventions, forwarded to GroundTrack
 *   lat, lon  — latest GPS fix, decimal degrees
 *   gpsFix    — 'NONE' | '2D' | '3D' (from telemetry) — the honest fix gate
 *   gpsSats   — satellite count, shown in the header pill
 */
export default function RecoveryPanel({ T, scheme, motion, lat, lon, gpsFix, gpsSats }) {
  const fixOk = isValidFix(gpsFix, lat, lon);

  // The coordinate readout, copy button and QR code all target the same
  // hysteresis-locked fix (pickStableFix), not the raw live one -- ordinary
  // stationary GPS jitter otherwise regenerates the QR code on every single
  // update, which cannot practically be scanned. GroundTrack still gets the
  // raw lat/lon below, unfiltered, so the jitter itself stays visible there
  // as a diagnostic of fix quality.
  const [lockedFix, setLockedFix] = useState(null);
  useEffect(() => {
    if (!fixOk) return;
    setLockedFix((prev) => pickStableFix(prev, lat, lon));
  }, [fixOk, lat, lon]);
  const targetLat = lockedFix ? lockedFix.lat : lat;
  const targetLon = lockedFix ? lockedFix.lon : lon;

  // Distance/bearing from launch is computed by GroundTrack internally
  // (it owns the launch latch); this panel only needs the raw fix for
  // GroundTrack's own trail — the coordinate readout, copy button, and QR
  // use the locked target above instead, and do not duplicate a second
  // "reference point" concept.

  return (
    <Panel
      title="RECOVERY · WALK TO IT"
      right={
        <Pill dot color={fixOk ? T.accent : T.warn} size="sm">
          {gpsFix || 'NONE'} · {gpsSats || 0} SATS
        </Pill>
      }
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(280px, 380px) 1fr',
        gap: SPACE.s5,
        alignItems: 'start',
      }}>
        {/* Ground track */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <GroundTrack size={340} scheme={scheme} motion={motion} lat={lat} lon={lon} fixOk={fixOk} />
        </div>

        {/* Coordinates + copy + QR */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.s4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.s3 }}>
            <StatTile
              label="RECOVERY TARGET"
              value={fixOk ? formatCoordPair(targetLat, targetLon) : 'NO FIX'}
              color={fixOk ? T.strong : T.warn}
              style={{ gridColumn: '1 / -1' }}
            />
          </div>

          <div style={{ display: 'flex', gap: SPACE.s3, alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: SPACE.s3 }}>
              <CopyCoordsButton lat={targetLat} lon={targetLon} disabled={!fixOk} />
              <div style={{
                fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, lineHeight: 1.5,
              }}>
                Copies "lat, lon" — paste directly into Google Maps' search box.
                Scan the QR with a phone (needs cell data) to open Maps there
                directly. Holds steady through ordinary GPS jitter (~
                {STABLE_FIX_HYSTERESIS_M} m) — only moves on a real fix change.
              </div>
            </div>

            <div style={{ flexShrink: 0 }}>
              <RecoveryQr lat={targetLat} lon={targetLon} disabled={!fixOk} size={132} />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
