// CASPER 2 — Mission Control v2 — App shell

import { useState, useMemo, useEffect } from "react";
import { TYPE, SPACE, RADIUS, FONT, TRACK, buildTheme, SCHEME_PROPS } from "./tokens.js";
import { Cap, Pill } from "./components.jsx";
import Icon from "./icons.jsx";
import { useMissionSim, fmtMET } from "./sim.jsx";
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakToggle } from "./tweaks-panel.jsx";
import { useFlightConfig } from "./flight-config.jsx";
import FlightTab from "./flight-tab.jsx";
import SetupTab from "./setup-tab.jsx";
import { TrackTab, TestTab } from "./track-test-tabs.jsx";

const TWEAK_DEFAULTS = {
  scheme:  "fusion",
  mode:    "dark",
  accent:  "auto",
  motion:  true,
  shader:  true,
};

const TABS = [
  { id: "setup",    label: "SETUP",  icon: "setup"  },
  { id: "test",     label: "TEST",   icon: "test"   },
  { id: "flight",   label: "FLIGHT", icon: "flight" },
  { id: "tracking", label: "TRACK",  icon: "track"  },
];

const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { width: 100%; height: 100%; }
  body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; overflow: hidden; }
  button { font-family: inherit; }
  input, select { font-family: inherit; }
  select { -webkit-appearance: none; appearance: none; padding-right: 18px;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1 L5 5 L9 1' stroke='currentColor' stroke-width='1.4' fill='none' stroke-linecap='round'/></svg>");
    background-repeat: no-repeat; background-position: right 4px center; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: oklch(28% 0.012 240); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: oklch(38% 0.012 240); }
  @keyframes cmcPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.55; transform: scale(0.94); } }
  @keyframes cmcSpin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes cmcFadeUp { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes cmcStripeMove { from { background-position: 0 0; } to { background-position: 22.6px 0; } }
  @keyframes cmcArmPulse { 0%, 100% { box-shadow: 0 0 14px rgba(231, 88, 88, 0.55), inset 0 0 12px rgba(0,0,0,0.25); } 50% { box-shadow: 0 0 28px rgba(231, 88, 88, 0.95), inset 0 0 12px rgba(0,0,0,0.25); } }
  main > * { animation: cmcFadeUp 240ms ease-out; }
`;

function Header({ T, scheme, met }) {
  const sk = SCHEME_PROPS[scheme];
  return (
    <header style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: `0 ${SPACE.s5}px`,
      height: 64,
      borderBottom: `1px solid ${T.border}`,
      background: T.bgPanel,
      flexShrink: 0,
      gap: SPACE.s4,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: SPACE.s3 }}>
        <div style={{
          width: 36, height: 36, borderRadius: RADIUS.sm,
          background: T.accent,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: sk.showGlow ? T.glow(T.accent) : "none",
          color: T.accentText,
          fontFamily: FONT.display, fontSize: 22, fontWeight: 600,
          letterSpacing: 1, lineHeight: 1,
        }}>C</div>
        <div>
          <div style={{
            fontFamily: FONT.display, fontSize: 22, fontWeight: 500,
            color: T.strong, letterSpacing: "0.18em",
            textTransform: "uppercase", lineHeight: 1,
          }}>CASPER 2</div>
          <div style={{
            fontFamily: FONT.cond, fontSize: 11, fontWeight: 600,
            color: T.muted, letterSpacing: "0.18em", marginTop: 4,
            textTransform: "uppercase",
          }}>Mission Control · v2.4.1</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: SPACE.s2 }}>
        <Pill T={T} dot color={T.info} glow={sk.showGlow}>FC · USB · 3.0 Mb/s</Pill>
        <Pill T={T} dot color={T.accent} glow={sk.showGlow}>GS · LoRa · -89 dBm</Pill>
        <Pill T={T} color={T.muted}>BAT 8.2 V</Pill>
        <Pill T={T} color={T.muted}>22.4 °C</Pill>
        <Pill T={T} color={T.muted}>CRC 0/12.4k</Pill>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: SPACE.s4 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontFamily: FONT.mono, fontSize: 22, fontWeight: 700,
            color: T.strong, fontVariantNumeric: "tabular-nums",
            letterSpacing: 0.5, lineHeight: 1,
          }}>{fmtMET(met)}</div>
          <div style={{
            fontFamily: FONT.cond, fontSize: 10, color: T.muted,
            letterSpacing: "0.2em", textTransform: "uppercase",
            marginTop: 4, fontWeight: 600,
          }}>MISSION ELAPSED</div>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ T, tab, setTab, scheme }) {
  const sk = SCHEME_PROPS[scheme];
  return (
    <nav style={{
      width: 84, flexShrink: 0,
      borderRight: `1px solid ${T.border}`,
      background: T.bgPanel,
      display: "flex", flexDirection: "column",
      paddingTop: SPACE.s3,
    }}>
      {TABS.map(t => {
        const active = tab === t.id;
        return (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
            padding: "16px 4px", border: "none", cursor: "pointer",
            background: active ? T.accentBg : "transparent",
            borderLeft: active ? `3px solid ${T.accent}` : "3px solid transparent",
            color: active ? T.accent : T.muted,
            transition: "all 160ms",
            position: "relative",
          }}
          onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = T.text; }}
          onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = T.muted; }}>
            <Icon name={t.icon} size={22}/>
            <span style={{
              fontFamily: FONT.cond, fontSize: 11, fontWeight: 700, letterSpacing: "0.16em",
            }}>{t.label}</span>
            {active && sk.showGlow && (
              <span style={{
                position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                width: 3, height: 32, background: T.accent,
                boxShadow: T.glow(T.accent),
                borderRadius: "0 2px 2px 0",
              }}/>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export default function MissionControlV2() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const resolvedAccent = t.accent === "auto" ? (t.mode === "dark" ? "mint" : "orange") : t.accent;

  const T = useMemo(() => buildTheme(t.mode, resolvedAccent, t.scheme), [t.mode, resolvedAccent, t.scheme]);

  const [tab, setTab] = useState("flight");
  const sim = useMissionSim();
  const [flightConfig, updateFlightConfig, resetFlightConfig] = useFlightConfig();

  useEffect(() => {
    document.body.style.background = T.bg;
    document.body.style.color = T.text;
  }, [T.bg, T.text]);

  return (
    <div style={{
      width: "100vw", height: "100vh",
      background: T.bg,
      color: T.text,
      fontFamily: FONT.sans,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      <style>{GLOBAL_CSS}</style>

      <Header T={T} scheme={t.scheme} met={sim.met}/>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar T={T} tab={tab} setTab={setTab} scheme={t.scheme}/>

        <main style={{ flex: 1, overflow: "auto", position: "relative" }}>
          {tab === "setup"    && <SetupTab    T={T} scheme={t.scheme} motion={t.motion} flightConfig={flightConfig} updateFlightConfig={updateFlightConfig} resetFlightConfig={resetFlightConfig}/>}
          {tab === "test"     && <TestTab     T={T} sim={sim} scheme={t.scheme} motion={t.motion}/>}
          {tab === "flight"   && <FlightTab   T={T} sim={sim} scheme={t.scheme} motion={t.motion} flightConfig={flightConfig}/>}
          {tab === "tracking" && <TrackTab    T={T} sim={sim} scheme={t.scheme} motion={t.motion}/>}
        </main>
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Visual scheme">
          <TweakRadio label="Scheme" value={t.scheme}
            options={["fusion", "obsidian", "terminal", "instrument"]}
            onChange={(v) => setTweak("scheme", v)}/>
        </TweakSection>

        <TweakSection label="Theme">
          <TweakRadio label="Mode" value={t.mode} options={["dark", "light"]}
            onChange={(v) => setTweak("mode", v)}/>
        </TweakSection>

        <TweakSection label="Accent">
          <TweakRadio label="Color" value={t.accent}
            options={["auto", "mint", "orange", "amber", "red"]}
            onChange={(v) => setTweak("accent", v)}/>
        </TweakSection>

        <TweakSection label="Motion">
          <TweakToggle label="Animations" value={t.motion} onChange={(v) => setTweak("motion", v)}/>
          <TweakToggle label="Liquid shader" value={t.shader} onChange={(v) => setTweak("shader", v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}
