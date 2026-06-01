// App.jsx — CASPER 2 Mission Control v2 shell
// ---------------------------------------------------------------------------
// Outer: hooks (telemetry, serial, command, diagnostics) + ThemeProvider
// Inner: header + sidebar + tab content + TweaksPanel
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from 'react';

import useTelemetry from './hooks/use_telemetry';
import useDiagnostics from './hooks/use_diagnostics';
import useSerial from './hooks/use_serial';
import useCommand from './hooks/use_command';
import useFlightSim from './hooks/use_flight_sim';

import { useTweaks } from './design/useTweaks.js';
import { ThemeProvider, useTheme } from './design/ThemeContext.jsx';
import { FONT, SPACE, RADIUS, TRACK, SCHEME_PROPS } from './design/tokens.js';
import { TweaksPanel } from './design/TweaksPanel.jsx';
import { Cap, Pill } from './design/components.jsx';
import { Icon } from './design/icons.jsx';
import { LiquidShader } from './design/instruments.jsx';

import FlightTab from './tabs/FlightTab.jsx';
import TestTab from './tabs/TestTab.jsx';
import TrackTab from './tabs/TrackTab.jsx';
import SetupTab from './tabs/SetupTab.jsx';

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
const TABS = [
  { id: 'setup',    label: 'SETUP',  icon: 'setup'  },
  { id: 'test',     label: 'TEST',   icon: 'test'   },
  { id: 'flight',   label: 'FLIGHT', icon: 'flight' },
  { id: 'tracking', label: 'TRACK',  icon: 'track'  },
];

// ---------------------------------------------------------------------------
// Outer App — owns hooks and tweaks; ThemeProvider wraps inner shell
// ---------------------------------------------------------------------------
export default function App() {
  const { tweaks, setTweak } = useTweaks();
  const telemetry = useTelemetry();
  const serial = useSerial();
  const command = useCommand();
  const diag = useDiagnostics();
  const flightSim = useFlightSim();

  return (
    <ThemeProvider tweaks={tweaks}>
      <Shell
        tweaks={tweaks}
        setTweak={setTweak}
        telemetry={telemetry}
        serial={serial}
        command={command}
        diag={diag}
        flightSim={flightSim}
      />
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// Shell — runs inside ThemeProvider so useTheme() works
// ---------------------------------------------------------------------------
function Shell({ tweaks, setTweak, telemetry, serial, command, diag, flightSim }) {
  const T = useTheme();
  const sk = SCHEME_PROPS[T.scheme] || SCHEME_PROPS.fusion;

  // Boot a port scan once after mount so the SETUP picker can populate
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.casper && window.casper.scan_ports) {
        window.casper.scan_ports();
      }
    } catch { /* no-op */ }
  }, []);

  const [activeTab, setActiveTab] = useState('flight');

  // MET clock — re-render every second so the header clock ticks even
  // when no telemetry is arriving
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => (n + 1) % 60), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: T.bg,
        color: T.text,
        overflow: 'hidden',
        fontFamily: FONT.sans,
      }}
    >
      {/* Optional liquid shader backdrop — only in obsidian/fusion */}
      {tweaks.shader && sk.showShader && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 0,
            pointerEvents: 'none',
            opacity: 0.45,
          }}
        >
          <LiquidShader motion={tweaks.motion} intensity={0.6} />
        </div>
      )}

      <Header telemetry={telemetry} serial={serial} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        <Sidebar activeTab={activeTab} onChange={setActiveTab} />

        <main style={{ flex: 1, overflow: 'auto', position: 'relative', background: 'transparent' }}>
          {activeTab === 'setup'    && <SetupTab serial={serial} flightSim={flightSim} />}
          {activeTab === 'test'     && <TestTab tel={telemetry} diag={diag} cmd={command} />}
          {activeTab === 'flight'   && <FlightTab tel={telemetry} cmd={command} serial={serial} flightSim={flightSim} />}
          {activeTab === 'tracking' && <TrackTab tel={telemetry} serial={serial} />}
        </main>
      </div>

      {/* Floating Tweaks panel (always rendered, manages its own open/closed) */}
      <TweaksPanel tweaks={tweaks} setTweak={setTweak} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header — logomark + connection status + MET clock
// ---------------------------------------------------------------------------
function Header({ telemetry, serial }) {
  const T = useTheme();
  const sk = SCHEME_PROPS[T.scheme] || SCHEME_PROPS.fusion;

  const fcLive = !!serial.fc_connected;
  const gsLive = !!serial.gs_connected;
  const linkLive = fcLive || gsLive;
  const metStr = fmtMET((telemetry && telemetry.t) || 0);

  return (
    <header
      style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: `1px solid ${T.border}`,
        background: T.bgPanel,
        gap: SPACE.s5,
        flexShrink: 0,
        position: 'relative',
        zIndex: 2,
      }}
    >
      {/* Left: logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.s3 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: RADIUS.sm,
            background: T.accent,
            color: T.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONT.display,
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: 0.5,
            boxShadow: T.glow ? T.glow(T.accent) : 'none',
          }}
        >
          C
        </div>
        <div>
          <div
            style={{
              fontFamily: sk.glassyType ? FONT.display : FONT.cond,
              fontSize: sk.glassyType ? 20 : 18,
              fontWeight: 700,
              color: T.strong,
              letterSpacing: sk.glassyType ? TRACK.display : '0.04em',
              lineHeight: 1.0,
              textTransform: sk.glassyType ? 'none' : 'uppercase',
            }}
          >
            CASPER 2
          </div>
          <div
            style={{
              fontFamily: FONT.cond,
              fontSize: 10,
              color: T.muted,
              letterSpacing: TRACK.cap,
              textTransform: 'uppercase',
              marginTop: 2,
            }}
          >
            Mission Control · v2.4
          </div>
        </div>
      </div>

      {/* Center: connection pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.s3, flex: 1, justifyContent: 'center' }}>
        <Pill dot color={fcLive ? T.accent : T.muted}>
          FC · {fcLive ? 'USB' : '--'}
        </Pill>
        <Pill dot color={gsLive ? T.info : T.muted}>
          GS · {gsLive
            ? `LoRa · ${(telemetry && telemetry.rssi != null) ? telemetry.rssi.toFixed(0) : '--'} dBm`
            : 'OFFLINE'}
        </Pill>
        <Pill color={linkLive ? T.accent : T.muted}>
          {telemetry && telemetry.batt != null ? `${telemetry.batt.toFixed(2)} V` : '-- V'}
        </Pill>
        <Pill color={T.muted}>
          INTEGRITY {telemetry && telemetry.integrity != null ? telemetry.integrity.toFixed(0) : '--'}%
        </Pill>
      </div>

      {/* Right: MET clock */}
      <div style={{ textAlign: 'right' }}>
        <Cap color={T.muted}>MISSION ELAPSED</Cap>
        <div
          style={{
            fontFamily: FONT.mono,
            fontSize: 22,
            fontWeight: 700,
            color: linkLive ? T.strong : T.muted,
            letterSpacing: 0.5,
            marginTop: 2,
          }}
        >
          {metStr}
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Sidebar — vertical nav rail
// ---------------------------------------------------------------------------
function Sidebar({ activeTab, onChange }) {
  const T = useTheme();
  const sk = SCHEME_PROPS[T.scheme] || SCHEME_PROPS.fusion;
  return (
    <nav
      style={{
        width: 84,
        flexShrink: 0,
        background: T.bgPanel,
        borderRight: `1px solid ${T.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        paddingTop: 8,
        position: 'relative',
        zIndex: 1,
      }}
    >
      {TABS.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              border: 'none',
              background: active ? T.accentBg : 'transparent',
              borderLeft: `3px solid ${active ? T.accent : 'transparent'}`,
              padding: '14px 0 12px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              color: active ? T.accent : T.muted,
              transition: 'background 120ms, color 120ms',
              fontFamily: FONT.cond,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: TRACK.cap,
              textTransform: 'uppercase',
              boxShadow: active && sk.showGlow ? `inset 3px 0 8px ${T.accent}33` : 'none',
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = T.text; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = T.muted; }}
          >
            <Icon name={tab.icon} size={22} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// fmtMET — design's T±MM:SS.S format
// ---------------------------------------------------------------------------
function fmtMET(ms) {
  if (!Number.isFinite(ms)) return 'T-00:00.0';
  const t = ms / 1000;
  const sign = t < 0 ? 'T-' : 'T+';
  const a = Math.abs(t);
  const m = Math.floor(a / 60);
  const s = a - m * 60;
  const mm = String(m).padStart(2, '0');
  const ss = s.toFixed(1).padStart(4, '0');
  return `${sign}${mm}:${ss}`;
}
