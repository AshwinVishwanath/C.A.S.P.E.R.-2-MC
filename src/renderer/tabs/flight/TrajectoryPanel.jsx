/**
 * TrajectoryPanel — TRAJECTORY panel with graph/dials toggle.
 *
 * Graph mode: 3 stacked Sparklines (alt, vel, qbar).
 * Dials mode: 2×2 grid of Dial widgets (Altitude, Velocity, Q-Bar, Mach).
 *
 * Receives pre-built history arrays from the parent via props to avoid
 * duplicating the ring-buffer logic.
 */
import React, { useState, useEffect } from 'react';
import { useTheme, useTweaksValue } from '../../design/ThemeContext';
import { Cap, Pill, Panel, SegToggle, Sparkline } from '../../design/components';
import { Dial } from '../../design/instruments';

export default function TrajectoryPanel({ tel, altH, velH, qbarH }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;

  // Default to dials for instrument scheme, graph otherwise
  const [view, setView] = useState(scheme === 'instrument' ? 'dials' : 'graph');
  useEffect(() => {
    setView(scheme === 'instrument' ? 'dials' : 'graph');
  }, [scheme]);

  const alt  = tel.alt  || 0;
  const vel  = tel.vel  || 0;
  const qbar = tel.qbar || 0;
  const mach = tel.mach || 0;

  return (
    <Panel
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Cap>TRAJECTORY</Cap>
          <Pill color={T.muted} size="sm">
            {view === 'dials' ? '4 channels · live' : '200 frames · 100 Hz'}
          </Pill>
        </span>
      }
      right={
        <SegToggle
          value={view}
          options={[
            { id: 'graph', label: 'GRAPH' },
            { id: 'dials', label: 'DIALS' },
          ]}
          onChange={setView}
          size="sm"
        />
      }
    >
      {view === 'dials' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 4 }}>
          <Dial
            size={200}
            value={alt}
            min={0}
            max={2200}
            label="ALTITUDE"
            unit="m"
            color={T.accent}
            format={(v) => v.toFixed(0)}
            ticks={11}
          />
          <Dial
            size={200}
            value={Math.abs(vel)}
            min={0}
            max={280}
            label="VELOCITY"
            unit="m/s"
            color={T.info}
            format={(v) => v.toFixed(0)}
            ticks={14}
          />
          <Dial
            size={200}
            value={qbar / 1000}
            min={0}
            max={6}
            label="Q-BAR"
            unit="kPa"
            color={T.warn}
            format={(v) => v.toFixed(2)}
            ticks={6}
          />
          <Dial
            size={200}
            value={Math.abs(mach)}
            min={0}
            max={1.2}
            label="MACH"
            unit=""
            color={T.accent}
            format={(v) => v.toFixed(2)}
            ticks={12}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Sparkline
            data={altH}
            color={T.accent}
            h={140}
            label="ALTITUDE"
            unit="m"
            value={alt.toFixed(1)}
            scheme={scheme}
          />
          <Sparkline
            data={velH}
            color={T.info}
            h={120}
            label="VELOCITY"
            unit="m/s"
            value={vel.toFixed(1)}
            scheme={scheme}
          />
          <Sparkline
            data={qbarH.map((v) => v / 1000)}
            color={T.warn}
            h={80}
            label="DYNAMIC PRESSURE"
            unit="kPa"
            value={(qbar / 1000).toFixed(2)}
            scheme={scheme}
          />
        </div>
      )}
    </Panel>
  );
}
