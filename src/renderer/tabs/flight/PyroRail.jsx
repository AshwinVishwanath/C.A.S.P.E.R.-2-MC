/**
 * PyroRail — vertical strip of 3 pyro channel cards.
 *
 * Renders channels 0–2 (hwCh 1–3) from tel.pyro.  Channel 4 (hwCh 4) is
 * intentionally excluded because the pyro editor only covers 3 channels.
 *
 * Each card shows: CH label, role, continuity voltage + threshold pill,
 * status pill, ARM/DISARM button, FIRE button.
 *
 * tel.toggleArm(i)  — arms or disarms channel i (0-based).
 * tel.firePyro(i)   — fires channel i (0-based) for 1200 ms.
 */
import React from 'react';
import { useTheme, useTweaksValue } from '../../design/ThemeContext';
import { Cap, Pill, Btn } from '../../design/components';
import { FONT, SPACE, SCHEME_PROPS } from '../../design/tokens.js';

function PyroCard({ ch, index, toggleArm, firePyro, disabled }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;

  const fired   = ch.firing;
  const armed   = ch.armed && !fired;
  const hasCont = ch.cont;
  const statusColor = fired ? T.danger
    : armed ? T.warn
    : hasCont ? T.accent
    : T.danger;
  const statusLabel = fired ? 'FIRED'
    : armed ? 'ARMED'
    : hasCont ? 'SAFE'
    : 'NO CONT';

  return (
    <div style={{
      padding: `${SPACE.s3}px`,
      background: T.bgPanel,
      border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${statusColor}`,
      borderRadius: sk.panelRadius,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: 10, color: T.muted, fontWeight: 600 }}>
          CH{ch.hwCh || index + 1}
        </span>
        <Pill dot color={statusColor} glow={armed && sk.showGlow} size="sm">
          {statusLabel}
        </Pill>
      </div>

      {/* Role */}
      <div style={{
        fontFamily: FONT.cond, fontSize: 14, fontWeight: 700,
        color: T.strong, letterSpacing: 0.5, textTransform: 'uppercase',
      }}>
        {ch.role || '—'}
      </div>

      {/* Continuity voltage */}
      <div style={{
        fontFamily: FONT.mono, fontSize: 11, color: T.muted,
        fontVariantNumeric: 'tabular-nums', marginTop: 2,
      }}>
        {hasCont ? `${(ch.contV || 0).toFixed(2)} V cont` : '— no continuity'}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: SPACE.s2, marginTop: SPACE.s2 }}>
        <Btn
          kind={armed ? 'warn' : 'secondary'}
          size="sm"
          full
          disabled={disabled || fired}
          onClick={() => toggleArm && toggleArm(index)}
        >
          {armed ? 'DISARM' : 'ARM'}
        </Btn>
        <Btn
          kind="dangerSolid"
          size="sm"
          full
          disabled={disabled || !armed || fired}
          onClick={() => firePyro && firePyro(index)}
        >
          FIRE
        </Btn>
      </div>
    </div>
  );
}

export default function PyroRail({ tel }) {
  const T = useTheme();
  const channels = (tel.pyro || []).slice(0, 3); // only 3 channels match pyro editor
  const disabled = !tel || !tel.pyro;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.s2 }}>
      {channels.map((ch, i) => (
        <PyroCard
          key={ch.hwCh || i}
          ch={ch}
          index={i}
          toggleArm={tel.toggleArm}
          firePyro={tel.firePyro}
          disabled={disabled}
        />
      ))}
      {channels.length === 0 && (
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: T.faint, textAlign: 'center', padding: SPACE.s4 }}>
          No pyro data
        </div>
      )}
    </div>
  );
}
