/**
 * LinkHealthPanel — GS radio link diagnostics.
 *
 * Shows 4 signal bars (RSSI, SNR placeholder, Data age, Freq err placeholder),
 * a Sparkline of RSSI history, and 3 stat tiles (CRC errors, Recovered, Loss %).
 */
import React from 'react';
import { useTheme, useTweaksValue } from '../../design/ThemeContext';
import { Cap, Pill, Panel, Sparkline } from '../../design/components';
import { FONT, SPACE, SCHEME_PROPS } from '../../design/tokens.js';

function Bar({ label, value, displayStr, min, max, color }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'baseline', marginBottom: 4,
      }}>
        <span style={{
          fontFamily: FONT.cond, fontSize: 10, color: T.muted,
          letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase',
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: FONT.mono, fontSize: 13, fontWeight: 700,
          color: T.strong, fontVariantNumeric: 'tabular-nums',
        }}>
          {displayStr}
        </span>
      </div>
      <div style={{ height: 6, background: T.gridLine, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: `${pct * 100}%`, height: '100%',
          background: color,
          boxShadow: sk.showGlow ? `0 0 8px ${color}` : 'none',
          transition: 'width 200ms',
        }} />
      </div>
    </div>
  );
}

export default function LinkHealthPanel({ tel, rssiHistory }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;

  const rssi     = tel.rssi     || 0;
  const dataAge  = tel.dataAge  || 0;
  const integrity = tel.integrity || 0;

  // Placeholder derived values (no live SNR/freqErr channels yet)
  const snrPlaceholder   = 7.4;
  const freqErrPlaceholder = 0;
  const crcErrors        = 0; // no live CRC error count yet
  const totalPkts        = 1000;
  const recovered        = 0;
  const lossPct          = ((1 - integrity / 100) * 100);

  return (
    <Panel
      title="LINK HEALTH"
      right={
        <Pill
          dot
          color={dataAge > 200 ? T.warn : T.accent}
          size="sm"
          glow={(SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion).showGlow}
        >
          {dataAge > 200 ? 'DEGRADED' : 'NOMINAL'}
        </Pill>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.s4 }}>
        <Bar
          label="RSSI"
          value={rssi}
          displayStr={`${rssi.toFixed(0)} dBm`}
          min={-120}
          max={-40}
          color={T.accent}
        />
        <Bar
          label="SNR"
          value={snrPlaceholder}
          displayStr={`${snrPlaceholder.toFixed(1)} dB`}
          min={0}
          max={12}
          color={T.info}
        />
        <Bar
          label="DATA AGE"
          value={dataAge}
          displayStr={`${dataAge} ms`}
          min={0}
          max={500}
          color={dataAge > 200 ? T.warn : T.accent}
        />
        <Bar
          label="FREQ ERR"
          value={freqErrPlaceholder}
          displayStr={`${freqErrPlaceholder} Hz`}
          min={-500}
          max={500}
          color={Math.abs(freqErrPlaceholder) > 300 ? T.warn : T.info}
        />

        {/* Stats row */}
        <div style={{
          gridColumn: '1 / -1',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: SPACE.s2,
          paddingTop: SPACE.s2,
          borderTop: `1px solid ${T.border}`,
        }}>
          <div>
            <div style={{ fontFamily: FONT.cond, fontSize: 10, color: T.muted, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>
              CRC errors
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 16, fontWeight: 700, color: crcErrors > 0 ? T.warn : T.strong, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              {crcErrors}
              <span style={{ color: T.muted, fontSize: 11, marginLeft: 4 }}>/ {totalPkts.toLocaleString()}</span>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: FONT.cond, fontSize: 10, color: T.muted, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>
              Recovered
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 16, fontWeight: 700, color: T.accent, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              {recovered}
              <span style={{ color: T.muted, fontSize: 11, marginLeft: 4 }}>1-bit</span>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: FONT.cond, fontSize: 10, color: T.muted, letterSpacing: '0.18em', fontWeight: 700, textTransform: 'uppercase' }}>
              Loss
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 16, fontWeight: 700, color: T.strong, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
              {Math.max(0, lossPct).toFixed(3)}
              <span style={{ color: T.muted, fontSize: 11, marginLeft: 2 }}>%</span>
            </div>
          </div>
        </div>

        {/* RSSI history sparkline */}
        {rssiHistory && rssiHistory.length > 1 && (
          <div style={{ gridColumn: '1 / -1', marginTop: SPACE.s2 }}>
            <Sparkline
              data={rssiHistory}
              color={T.accent}
              h={60}
              label="RSSI HISTORY"
              unit="dBm"
              value={rssi.toFixed(0)}
              scheme={scheme}
            />
          </div>
        )}
      </div>
    </Panel>
  );
}
