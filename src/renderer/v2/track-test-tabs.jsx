// CASPER 2 — TRACKING + TEST tabs

import { useState } from "react";
import { TYPE, SPACE, RADIUS, FONT, SCHEME_PROPS } from "./tokens.js";
import { Cap, Pill, Panel, Btn, StatTile, Sparkline } from "./components.jsx";
import { Radar, Rocket3D } from "./instruments.jsx";

export function TrackTab({ T, sim, scheme, motion }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SCHEME_PROPS[scheme].sectionGap, padding: SPACE.s5, maxWidth: 1640, margin: "0 auto", width: "100%" }}>
      <div>
        <Cap T={T} color={T.accent}>TRACK · DOWNRANGE</Cap>
        <h2 style={{
          fontFamily: scheme === "obsidian" ? FONT.display : FONT.cond,
          fontSize: scheme === "obsidian" ? 44 : 32,
          fontWeight: scheme === "obsidian" ? 500 : 700,
          color: T.strong, letterSpacing: "0.02em", textTransform: "uppercase",
          margin: 0, marginTop: SPACE.s2, lineHeight: 1,
        }}>Live Tracking</h2>
        <div style={{ fontFamily: FONT.mono, fontSize: TYPE.body, color: T.muted, marginTop: SPACE.s2 }}>
          Bearing 035° · range 0.42 km · 11 sats locked
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.s4 }}>
        <Panel T={T} scheme={scheme} title="GPS · DELTA SCOPE" right={
          <Pill T={T} dot color={T.accent} size="sm">3D · {sim.gpsSats} SATS</Pill>
        }>
          <div style={{ display: "flex", justifyContent: "center", padding: SPACE.s3 }}>
            <Radar T={T} size={420} motion={motion} scheme={scheme}/>
          </div>
          <div style={{ borderTop: `1px solid ${T.border}`, padding: SPACE.s3, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: SPACE.s2 }}>
            <div><Cap T={T}>RANGE</Cap><div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.accent, fontVariantNumeric: "tabular-nums" }}>0.42<span style={{ fontSize: 11, color: T.muted, marginLeft: 4 }}>km</span></div></div>
            <div><Cap T={T}>BEARING</Cap><div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.accent, fontVariantNumeric: "tabular-nums" }}>035°</div></div>
            <div><Cap T={T}>HDOP</Cap><div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: "tabular-nums" }}>{sim.hdop.toFixed(2)}</div></div>
            <div><Cap T={T}>FIX</Cap><div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.accent }}>3D</div></div>
          </div>
        </Panel>
        <Panel T={T} scheme={scheme} title="ATTITUDE · QUATERNION" right={
          <Pill T={T} color={T.muted} size="sm">EKF · 200 Hz</Pill>
        }>
          <div style={{ display: "flex", justifyContent: "center", padding: SPACE.s3 }}>
            <Rocket3D T={T} size={420} quat={sim.quat} motion={motion} scheme={scheme}/>
          </div>
          <div style={{ borderTop: `1px solid ${T.border}`, padding: SPACE.s3, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: SPACE.s2 }}>
            <div><Cap T={T}>ROLL</Cap><div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: "tabular-nums" }}>{(sim.quat.roll * 57.296).toFixed(1)}°</div></div>
            <div><Cap T={T}>PITCH</Cap><div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: "tabular-nums" }}>{(sim.quat.pitch * 57.296).toFixed(1)}°</div></div>
            <div><Cap T={T}>YAW</Cap><div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: "tabular-nums" }}>{(sim.quat.yaw * 57.296).toFixed(1)}°</div></div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function TestTab({ T, sim, scheme, motion }) {
  const [testMode, setTestMode] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SCHEME_PROPS[scheme].sectionGap, padding: SPACE.s5, maxWidth: 1640, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <Cap T={T} color={T.accent}>TEST · BENCH</Cap>
          <h2 style={{
            fontFamily: scheme === "obsidian" ? FONT.display : FONT.cond,
            fontSize: scheme === "obsidian" ? 44 : 32,
            fontWeight: scheme === "obsidian" ? 500 : 700,
            color: T.strong, letterSpacing: "0.02em", textTransform: "uppercase",
            margin: 0, marginTop: SPACE.s2, lineHeight: 1,
          }}>Bench Test</h2>
          <div style={{ fontFamily: FONT.mono, fontSize: TYPE.body, color: testMode ? T.warn : T.muted, marginTop: SPACE.s2 }}>
            {testMode ? "● TEST MODE ACTIVE · 55 s timeout" : "FC ready · enter test mode to enable arm/fire"}
          </div>
        </div>
        <div style={{ display: "flex", gap: SPACE.s2 }}>
          <Btn T={T} kind={testMode ? "warn" : "secondary"} size="md" icon={testMode ? "unlock" : "lock"} onClick={() => setTestMode(!testMode)}>
            {testMode ? "TEST MODE ON" : "TEST MODE"}
          </Btn>
          <Btn T={T} kind="primary" size="md" icon="play">SIM FLIGHT</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: SPACE.s3 }}>
        <StatTile T={T} label="STATE" value={sim.phase} color={T.accent} large/>
        <StatTile T={T} label="ALTITUDE" value={sim.alt.toFixed(1)} unit="m" color={T.strong} large/>
        <StatTile T={T} label="VELOCITY" value={sim.vel.toFixed(1)} unit="m/s" color={T.strong} large/>
        <StatTile T={T} label="BATTERY" value={sim.batt.toFixed(2)} unit="V"
          color={sim.batt < 7.4 ? T.danger : T.strong} large/>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.s3 }}>
        <Panel T={T} scheme={scheme} title="ALTITUDE · LIVE">
          <Sparkline T={T} data={sim.altH} color={T.accent} h={120} unit="m" value={sim.alt.toFixed(1)} scheme={scheme}/>
        </Panel>
        <Panel T={T} scheme={scheme} title="VELOCITY · LIVE">
          <Sparkline T={T} data={sim.velH} color={T.info} h={120} unit="m/s" value={sim.vel.toFixed(1)} scheme={scheme}/>
        </Panel>
      </div>

      <Panel T={T} scheme={scheme} title="PYRO ARMING CONSOLE · CAC" right={
        <Pill T={T} dot color={testMode ? T.warn : T.muted} size="sm">{testMode ? "TEST MODE" : "SAFE"}</Pill>
      }>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: SPACE.s3 }}>
          {sim.pyro.map((p) => (
            <div key={p.ch} style={{
              padding: SPACE.s3,
              background: T.bgEl,
              border: `1px solid ${T.border}`,
              borderRadius: RADIUS.md,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: SPACE.s2 }}>
                <div>
                  <span style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, fontWeight: 600 }}>CH{p.ch}</span>
                  <div style={{ fontFamily: FONT.cond, fontSize: 18, fontWeight: 700, color: T.strong, letterSpacing: 0.5, textTransform: "uppercase" }}>{p.role}</div>
                </div>
                <Pill T={T} dot color={p.cont !== null ? T.accent : T.danger} glow={SCHEME_PROPS[scheme].showGlow}>
                  {p.cont !== null ? `CONT ${p.cont.toFixed(2)}Ω` : "NO CONT"}
                </Pill>
              </div>
              <div style={{ display: "flex", gap: SPACE.s2 }}>
                <Btn T={T} kind={p.armed ? "warn" : "secondary"} size="md" full disabled={!testMode} icon={p.armed ? "unlock" : "lock"}>
                  {p.armed ? "DISARM" : "ARM"}
                </Btn>
                <Btn T={T} kind="dangerSolid" size="md" full disabled={!testMode || !p.armed} icon="fire">
                  FIRE
                </Btn>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
