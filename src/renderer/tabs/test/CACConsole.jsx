/**
 * CACConsole — CAC Arming Console for bench test.
 *
 * 2-col grid of 3 pyro channel cards (same channels as PyroRail / pyro editor).
 * All ARM/FIRE buttons are disabled unless testMode is true.
 *
 * tel.toggleArm(i)  — arm/disarm channel i (0-based)
 * tel.firePyro(i)   — fire channel i (0-based)
 */
import React from 'react';
import { useTheme, useTweaksValue } from '../../design/ThemeContext';
import { Cap, Pill, Btn, Panel } from '../../design/components';
import { Dot } from '../../design/components';
import { FONT, SPACE, SCHEME_PROPS, RADIUS } from '../../design/tokens.js';

export default function CACConsole({ tel, testMode }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;

  // Only first 3 channels match the pyro editor
  const channels = (tel.pyro || []).slice(0, 3);

  return (
    <Panel
      title="PYRO ARMING CONSOLE · CAC"
      right={
        <Pill dot color={testMode ? T.warn : T.muted} size="sm">
          {testMode ? 'TEST MODE' : 'SAFE'}
        </Pill>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: SPACE.s3 }}>
        {channels.map((ch, i) => {
          const hasCont = ch.cont;
          return (
            <div key={ch.hwCh || i} style={{
              padding: SPACE.s3,
              background: T.bgEl,
              border: `1px solid ${T.border}`,
              borderRadius: RADIUS.md,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', marginBottom: SPACE.s2,
              }}>
                <div>
                  <span style={{
                    fontFamily: FONT.mono, fontSize: 10,
                    color: T.muted, fontWeight: 600,
                  }}>
                    CH{ch.hwCh || i + 1}
                  </span>
                  <div style={{
                    fontFamily: FONT.cond, fontSize: 18, fontWeight: 700,
                    color: T.strong, letterSpacing: 0.5, textTransform: 'uppercase',
                  }}>
                    {ch.role || '—'}
                  </div>
                </div>
                <Pill
                  dot
                  color={hasCont ? T.accent : T.danger}
                  glow={sk.showGlow}
                  size="sm"
                >
                  {hasCont ? `CONT ${(ch.contV || 0).toFixed(2)}V` : 'NO CONT'}
                </Pill>
              </div>
              <div style={{ display: 'flex', gap: SPACE.s2 }}>
                <Btn
                  kind={ch.armed ? 'warn' : 'secondary'}
                  size="md"
                  full
                  disabled={!testMode || ch.firing}
                  onClick={() => tel.toggleArm && tel.toggleArm(i)}
                >
                  {ch.armed ? 'DISARM' : 'ARM'}
                </Btn>
                <Btn
                  kind="dangerSolid"
                  size="md"
                  full
                  disabled={!testMode || !ch.armed || ch.firing}
                  onClick={() => tel.firePyro && tel.firePyro(i)}
                >
                  FIRE
                </Btn>
              </div>
            </div>
          );
        })}

        {channels.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            padding: SPACE.s4,
            fontFamily: FONT.mono, fontSize: 11,
            color: T.faint, textAlign: 'center',
          }}>
            No pyro channel data
          </div>
        )}
      </div>
    </Panel>
  );
}
