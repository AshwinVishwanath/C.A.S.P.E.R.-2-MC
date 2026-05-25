/**
 * RightRail — sticky right sidebar (280px wide).
 *
 * Composes:
 *   1. Master ARM button — calls tel.toggleArm(0) for ch1 as a "master arm".
 *      If ANY channel is armed, disarms all; otherwise arms channel 1.
 *      (See comment block below for rationale.)
 *   2. PYRO CHANNELS panel — PyroRail (3 channels)
 *   3. FLIGHT CONFIG panel — placeholder key/value rows
 *   4. RECOVERY · BEACON panel — placeholder key/value rows + ghost buttons
 */
import React from 'react';
import { useTheme, useTweaksValue } from '../../design/ThemeContext';
import { Cap, Pill, Btn, Panel } from '../../design/components';
import { FONT, SPACE, SCHEME_PROPS } from '../../design/tokens.js';
import PyroRail from './PyroRail.jsx';

// ---------------------------------------------------------------------------
// ARM BUTTON BEHAVIOUR
// ---------------------------------------------------------------------------
// The right rail only shows a single master ARM button rather than per-channel
// ARM buttons.  The simplest safe behaviour for this prototype is:
//   - If ANY pyro channel is currently armed → disarm all 3 by calling
//     tel.toggleArm(i) for each armed channel.
//   - If NO channel is armed → arm channel 1 (index 0) only.
// The per-channel ARM/DISARM buttons in PyroRail provide fine-grained control.
// ---------------------------------------------------------------------------

function KVRow({ label, value }) {
  const T = useTheme();
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      paddingBottom: 4, borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ fontFamily: FONT.mono, fontSize: 12, color: T.muted, letterSpacing: 0.3 }}>
        {label}
      </span>
      <span style={{ fontFamily: FONT.mono, fontSize: 12, color: T.strong, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

export default function RightRail({ tel, cmd }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;

  const anyArmed = tel.pyro && tel.pyro.slice(0, 3).some((ch) => ch.armed);
  const disabled = !tel || !tel.pyro;

  function handleMasterArm() {
    if (!tel.toggleArm || disabled) return;
    if (anyArmed) {
      // Disarm all armed channels
      (tel.pyro || []).slice(0, 3).forEach((ch, i) => {
        if (ch.armed) tel.toggleArm(i);
      });
    } else {
      // Arm channel 1 only
      tel.toggleArm(0);
    }
  }

  return (
    <aside style={{
      width: 280,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: sk.sectionGap,
      position: 'sticky',
      top: 0,
      alignSelf: 'flex-start',
      maxHeight: '100vh',
      overflowY: 'auto',
    }}>
      {/* Master ARM button */}
      <button
        disabled={disabled}
        onClick={handleMasterArm}
        style={{
          width: '100%',
          padding: `${SPACE.s5}px ${SPACE.s4}px`,
          background: anyArmed ? T.warn : T.danger,
          color: '#fff',
          border: `2px solid ${anyArmed ? T.warn : T.danger}`,
          borderRadius: sk.panelRadius,
          fontFamily: FONT.display,
          fontSize: 38,
          fontWeight: 600,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          boxShadow: sk.showGlow
            ? `0 0 24px ${anyArmed ? T.warn : T.danger}, inset 0 0 12px rgba(0,0,0,0.25)`
            : 'inset 0 -3px 0 rgba(0,0,0,0.25)',
          textShadow: '0 1px 2px rgba(0,0,0,0.4)',
          position: 'relative',
          animation: sk.showGlow ? 'cmcArmPulse 2.4s ease-in-out infinite' : 'none',
        }}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.filter = 'brightness(1.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
      >
        <div style={{
          fontFamily: FONT.cond, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.24em', opacity: 0.7, marginBottom: 4,
        }}>
          HOLD 2 S · CAC
        </div>
        {anyArmed ? 'DISARM' : 'ARM'}
      </button>

      {/* Pyro channel strip */}
      <Panel
        title="PYRO CHANNELS"
        right={
          <Pill dot color={anyArmed ? T.warn : T.muted} size="sm" glow={sk.showGlow}>
            {anyArmed ? 'ARMED' : 'CAC SAFE'}
          </Pill>
        }
      >
        <PyroRail tel={tel} />
        <div style={{
          marginTop: SPACE.s3, paddingTop: SPACE.s3,
          borderTop: `1px solid ${T.border}`,
          display: 'flex', gap: SPACE.s2,
        }}>
          <Btn kind="ghost" size="xs" full>SAFETY</Btn>
          <Btn kind="ghost" size="xs" full>VERIFY</Btn>
        </div>
      </Panel>

      {/* Flight config */}
      <Panel
        title="FLIGHT CONFIG"
        right={<Pill color={T.muted} size="sm">v1.4.2</Pill>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.s2, fontFamily: FONT.mono, fontSize: 12 }}>
          {[
            ['Profile',       'L1 single-stage'],
            ['Motor',         'AeroTech J350W'],
            ['Mass (wet)',    '3.84 kg'],
            ['Apogee target', '1,850 m'],
            ['Drogue at',     'T+APOGEE'],
            ['Main at',       '300 m AGL'],
            ['CRC hash',      '0x4F2A8C'],
          ].map(([k, v]) => <KVRow key={k} label={k} value={v} />)}
        </div>
      </Panel>

      {/* Recovery beacon */}
      <Panel
        title="RECOVERY · BEACON"
        right={<Pill dot color={T.accent} size="sm" glow={sk.showGlow}>ACTIVE</Pill>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.s2, fontFamily: FONT.mono, fontSize: 12 }}>
          {[
            ['Beacon',         'GS-LoRa 433 MHz'],
            ['Burst rate',     '1 / 5 s'],
            ['TX power',       '+20 dBm'],
            ['Last fix',       tel.gpsLat ? `${tel.gpsLat.toFixed(4)}°N` : '—'],
            ['Predicted zone', '0.62 km NW'],
            ['Wind aloft',     '260° · 7.4 m/s'],
            ['Vehicle ID',     'CASPER-2 / 0x7F12'],
          ].map(([k, v]) => <KVRow key={k} label={k} value={v} />)}
        </div>
        <div style={{
          marginTop: SPACE.s3, paddingTop: SPACE.s3,
          borderTop: `1px solid ${T.border}`,
          display: 'flex', gap: SPACE.s2,
        }}>
          {/* LOCATE and PING are no-op ghost buttons — future IPC hook */}
          <Btn kind="ghost" size="xs" full>LOCATE</Btn>
          <Btn kind="ghost" size="xs" full>PING</Btn>
        </div>
      </Panel>
    </aside>
  );
}
