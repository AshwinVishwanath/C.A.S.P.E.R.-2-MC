/**
 * HeroStrip — flight tab hero panel.
 *
 * Contains:
 *   - Left: "FLIGHT STATE" cap + current phase BigNum + subtitle
 *   - Centre: TerminalCount / MET clock
 *   - Right: pre-launch GO/HOLD/ABORT or in-flight apogee projection
 *   - Bottom: FSMBar across full width
 *   - Optional LiquidShader behind for obsidian/fusion schemes
 */
import React from 'react';
import { useTheme, useTweaksValue } from '../../design/ThemeContext';
import { Cap, Pill, Btn, BigNum, Panel } from '../../design/components';
import { FSMBar, LiquidShader } from '../../design/instruments';
import { FONT, SPACE, SCHEME_PROPS } from '../../design/tokens.js';

const FSM_STAGES = ['PAD', 'BOOST', 'COAST', 'APOGEE', 'DROGUE', 'MAIN', 'LANDED'];

// Descriptive subtitle for each FSM state
const STATE_SUBTITLE = {
  PAD:      'Standing by · awaiting commit',
  BOOST:    'Motor burning · max thrust',
  COAST:    'Unpowered ascent · drag-dominated',
  COAST_1:  'First coast phase',
  SUSTAIN:  'Sustained burn phase',
  COAST_2:  'Second coast phase',
  APOGEE:   'Peak altitude · drogue charge armed',
  DROGUE:   'Drogue under canopy · descending',
  MAIN:     'Main deployed · gentle descent',
  RECOVERY: 'Recovery descent in progress',
  TUMBLE:   'Tumbling · attitude unstable',
  LANDED:   'Touchdown · recovery in progress',
};

function fmtMET(sec) {
  const sign = sec < 0 ? '-' : '+';
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `T${sign}${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

function isGlassy(scheme) {
  return scheme === 'obsidian' || scheme === 'fusion';
}

// TerminalCount — MET / T-minus clock with optional launch buttons
function TerminalCount({ tel }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;
  const glassy = isGlassy(scheme);

  const met = (tel.t || 0) / 1000; // seconds
  const inCount = met < 0;
  const display = fmtMET(met);

  const bigFs = scheme === 'terminal' ? 56 : scheme === 'instrument' ? 64 : glassy ? 72 : 72;

  return (
    <div style={{
      padding: `${SPACE.s5}px ${SPACE.s5}px`,
      textAlign: 'center',
      background: glassy
        ? `radial-gradient(ellipse at center, ${T.accent}11 0%, transparent 70%)`
        : 'transparent',
    }}>
      <Cap color={inCount ? T.accent : T.text}>
        {inCount ? 'TERMINAL COUNT' : 'MISSION ELAPSED'}
      </Cap>
      <div style={{
        fontFamily: glassy ? FONT.display : FONT.mono,
        fontSize: bigFs,
        fontWeight: glassy ? 500 : 700,
        color: inCount ? T.accent : T.strong,
        fontVariantNumeric: 'tabular-nums',
        letterSpacing: glassy ? 4 : 1,
        lineHeight: 1,
        marginTop: SPACE.s2,
        textShadow: sk.showGlow && inCount ? `0 0 30px ${T.accent}` : 'none',
      }}>
        {display}
      </div>
    </div>
  );
}

export default function HeroStrip({ tel, cmd }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const motion = tweaks.motion;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;
  const glassy = isGlassy(scheme);

  const met = (tel.t || 0) / 1000;
  const inPad = tel.state === 'PAD';
  const inFlight = !inPad && tel.state !== 'LANDED';
  const goForLaunch = inPad;

  const dispFs = glassy ? 64 : 48;

  return (
    <Panel padded={false} style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Liquid shader background for glass schemes */}
      {glassy && tweaks.shader && (
        <div style={{ position: 'absolute', inset: 0, opacity: T.name === 'dark' ? 0.85 : 0.20, pointerEvents: 'none' }}>
          <LiquidShader motion={motion} />
          <div style={{
            position: 'absolute', inset: 0,
            background: T.name === 'dark'
              ? `linear-gradient(180deg, ${T.bg}33 0%, ${T.bg}88 100%)`
              : `linear-gradient(180deg, ${T.bg}cc 0%, ${T.bg}ee 100%)`,
          }} />
        </div>
      )}

      {/* 3-col grid */}
      <div style={{
        position: 'relative',
        padding: `${SPACE.s5}px ${SPACE.s6}px`,
        display: 'grid',
        gridTemplateColumns: '1.6fr 1fr 1.6fr',
        gap: SPACE.s5,
        alignItems: 'center',
      }}>
        {/* Left: state */}
        <div>
          <Cap color={T.accent}>FLIGHT STATE</Cap>
          <div style={{
            fontFamily: glassy ? FONT.display : FONT.cond,
            fontSize: dispFs,
            fontWeight: glassy ? 500 : 700,
            color: T.strong,
            letterSpacing: glassy ? '0.04em' : '0.02em',
            textTransform: 'uppercase',
            lineHeight: 1,
            marginTop: SPACE.s2,
          }}>
            {tel.state || 'PAD'}
          </div>
          <div style={{
            fontFamily: FONT.mono, fontSize: 13, color: T.muted, marginTop: SPACE.s2,
          }}>
            {STATE_SUBTITLE[tel.state] || 'Awaiting data'}
          </div>
        </div>

        {/* Centre: clock */}
        <TerminalCount tel={tel} />

        {/* Right: launch status or apogee */}
        <div style={{ textAlign: 'right' }}>
          {goForLaunch ? (
            <>
              <Cap color={T.accent}>RANGE STATUS</Cap>
              <div style={{
                fontFamily: glassy ? FONT.display : FONT.cond,
                fontSize: glassy ? 56 : 40,
                fontWeight: glassy ? 500 : 700,
                color: T.accent,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                lineHeight: 1,
                marginTop: SPACE.s2,
                textShadow: sk.showGlow ? T.glow(T.accent) : 'none',
              }}>
                GO FOR LAUNCH
              </div>
              <div style={{ display: 'flex', gap: SPACE.s2, marginTop: SPACE.s3, justifyContent: 'flex-end' }}>
                <Btn kind="secondary" size="md">HOLD</Btn>
                <Btn kind="danger" size="md" onClick={() => window.casper && window.casper.cmd_abort()}>ABORT</Btn>
              </div>
            </>
          ) : (
            <>
              <Cap>APOGEE PROJECTION</Cap>
              <div style={{ marginTop: SPACE.s2 }}>
                <BigNum
                  value={(tel.apogee || 0).toFixed(0)}
                  unit="m"
                  size={40}
                  color={T.strong}
                  glow={sk.showGlow}
                />
              </div>
              <div style={{
                fontFamily: FONT.mono, fontSize: 11, color: T.muted,
                marginTop: 4, fontVariantNumeric: 'tabular-nums',
              }}>
                Δ {((tel.apogee || 0) - (tel.alt || 0)).toFixed(0)} m from current
              </div>
            </>
          )}
        </div>
      </div>

      {/* FSM bar */}
      <div style={{
        padding: `${SPACE.s3}px ${SPACE.s6}px`,
        borderTop: `1px solid ${T.border}`,
        background: scheme === 'terminal' ? 'transparent' : T.bgEl + '88',
      }}>
        <FSMBar states={FSM_STAGES} current={tel.state || 'PAD'} />
      </div>
    </Panel>
  );
}
