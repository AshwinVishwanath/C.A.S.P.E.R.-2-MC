// CASPER 2 — FLIGHT TAB

import React, { useState, useRef, useEffect } from "react";
import { TYPE, SPACE, RADIUS, FONT, TRACK, SCHEME_PROPS } from "./tokens.js";
import { Cap, Pill, Panel, Btn, StatTile, Sparkline, Dot, BigNum } from "./components.jsx";
import { Radar, Rocket3D, Dial, LiquidShader } from "./instruments.jsx";
import { fmtMET } from "./sim.jsx";
import { FLIGHT_CONFIG_DEFAULTS, flightConfigHash, formatMassKg, formatAltM } from "./flight-config.jsx";

function FSMBar({ T, current, scheme }) {
  const states = ["PAD", "BOOST", "COAST", "APOGEE", "DROGUE", "MAIN", "LANDED"];
  const idx = states.indexOf(current);
  const sk = SCHEME_PROPS[scheme];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, width: "100%" }}>
      {states.map((s, i) => {
        const passed = i < idx;
        const active = i === idx;
        const c = passed || active ? T.accent : T.faint;
        return (
          <div key={s} style={{ display: "flex", alignItems: "center", flex: i < states.length - 1 ? 1 : 0 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: active ? 14 : 10, height: active ? 14 : 10,
                borderRadius: "50%",
                background: passed ? T.accent : active ? T.accent : "transparent",
                border: `2px solid ${c}`,
                boxShadow: active && sk.showGlow ? T.glow(T.accent) : "none",
                animation: active ? "cmcPulse 1.6s infinite" : "none",
                transition: "all 200ms",
              }}/>
              <span style={{
                fontFamily: FONT.mono, fontSize: 11, fontWeight: 700,
                color: passed || active ? T.text : T.faint,
                fontVariantNumeric: "tabular-nums", letterSpacing: 0.5,
              }}>{s}</span>
            </div>
            {i < states.length - 1 && (
              <div style={{ flex: 1, height: 2, background: passed ? T.accent : T.gridLine, marginBottom: 18 }}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PyroStrip({ T, pyro, scheme, vertical = false, onArm, onFire, disabled = false }) {
  const sk = SCHEME_PROPS[scheme];
  // Only channels 1–3 are operator-controllable (matches the pyro editor & FC).
  const controllable = vertical && (onArm || onFire);
  return (
    <div style={{
      display: vertical ? "flex" : "grid",
      flexDirection: vertical ? "column" : undefined,
      gridTemplateColumns: vertical ? undefined : "repeat(4, 1fr)",
      gap: SPACE.s2,
    }}>
      {pyro.map((p, idx) => {
        const fired = p.status === "FIRED";
        const armed = p.armed && !fired;
        const ok = p.cont !== null;
        const c = fired ? T.muted : armed ? T.warn : ok ? T.accent : T.danger;
        const showControls = controllable && idx < 3;
        return (
          <div key={p.ch} style={{
            padding: vertical ? `${SPACE.s3}px ${SPACE.s3}px` : `${SPACE.s2}px ${SPACE.s3}px`,
            background: T.bgPanel,
            border: `1px solid ${T.border}`,
            borderLeft: `3px solid ${c}`,
            borderRadius: sk.panelRadius,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: FONT.mono, fontSize: 10, color: T.muted, fontWeight: 600 }}>CH{p.ch}</span>
              <Pill T={T} dot color={c} glow={armed && sk.showGlow} size="sm">
                {fired ? "FIRED" : armed ? "ARMED" : ok ? "SAFE" : "NO CONT"}
              </Pill>
            </div>
            <div style={{ fontFamily: FONT.cond, fontSize: 14, fontWeight: 700, color: T.strong, letterSpacing: 0.5, textTransform: "uppercase" }}>
              {p.role}
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: 11, color: T.muted, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
              {p.cont !== null ? `${p.cont.toFixed(2)} V · ${p.threshold}` : "— · " + p.threshold}
            </div>
            {showControls && (
              <div style={{ display: "flex", gap: SPACE.s2, marginTop: SPACE.s2 }}>
                <Btn T={T} kind={armed ? "warn" : "secondary"} size="sm" full
                  disabled={disabled || fired}
                  onClick={() => onArm && onArm(idx)}>
                  {armed ? "DISARM" : "ARM"}
                </Btn>
                <Btn T={T} kind="dangerSolid" size="sm" full
                  disabled={disabled || !armed || fired}
                  onClick={() => onFire && onFire(idx)}>
                  FIRE
                </Btn>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChecklistRow({ T, label, status, scheme }) {
  const c = status === "GO" ? T.accent : status === "OVRD" ? T.warn : T.danger;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: SPACE.s3,
      padding: `${SPACE.s2}px 0`,
      borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{
        fontFamily: FONT.mono, fontSize: TYPE.body, fontWeight: 700,
        color: c, minWidth: 56, fontVariantNumeric: "tabular-nums",
      }}>{status}</span>
      <span style={{ flex: 1, fontFamily: FONT.sans, fontSize: TYPE.body, color: T.text }}>{label}</span>
      <Dot T={T} color={c} size={8} glow={SCHEME_PROPS[scheme].showGlow}/>
    </div>
  );
}

const DEFAULT_CHECKS = [
  { label: "Pyro continuity · all channels",  status: "GO" },
  { label: "EKF converged · σ_alt < 0.4 m",   status: "GO" },
  { label: "GPS fix",                          status: "GO" },
  { label: "Telemetry CRC clean · last 60 s",  status: "GO" },
  { label: "CAC token validated",              status: "GO" },
  { label: "Wind aloft within envelope",       status: "GO" },
];

function Checklist({ T, scheme, checks = DEFAULT_CHECKS }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {checks.map((c, i) => <ChecklistRow key={c.id || c.label || i} T={T} label={c.label} status={c.status} scheme={scheme}/>)}
    </div>
  );
}

const isGlassy = (s) => s === "obsidian" || s === "fusion";

function SegIcon({ name, color = "currentColor" }) {
  if (name === "sparkline") {
    return (
      <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
        <path d="M1 7 L4 4 L7 6 L10 2 L13 5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (name === "dial") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M2 9 A 5 5 0 0 1 10 9" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
        <line x1="6" y1="9" x2="9" y2="4" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
        <circle cx="6" cy="9" r="1.2" fill={color}/>
      </svg>
    );
  }
  return null;
}

function SegToggle({ T, scheme, value, options, onChange }) {
  const sk = SCHEME_PROPS[scheme];
  return (
    <div style={{
      display: "inline-flex",
      padding: 2,
      background: T.bgEl,
      border: `1px solid ${T.border}`,
      borderRadius: sk.panelRadius === 2 ? 2 : 6,
    }}>
      {options.map(o => {
        const active = o.id === value;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 10px", border: "none", cursor: "pointer",
            background: active ? T.accent : "transparent",
            color: active ? T.accentText : T.muted,
            fontFamily: FONT.cond, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.16em", textTransform: "uppercase",
            borderRadius: sk.panelRadius === 2 ? 0 : 4,
            boxShadow: active && sk.showGlow ? T.glowSoft(T.accent) : "none",
            transition: "all 140ms",
          }}
          onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = T.text; }}
          onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = T.muted; }}>
            <SegIcon name={o.icon} active={active} color={active ? T.accentText : "currentColor"}/>
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TerminalCount({ T, met, scheme }) {
  const sk = SCHEME_PROPS[scheme];
  const inCount = met < 0;
  const display = inCount ? `T-${Math.floor(Math.abs(met) / 60).toString().padStart(2,"0")}:${(Math.abs(met) % 60).toFixed(1).padStart(4,"0")}` : fmtMET(met);
  const big = scheme === "terminal" ? 56 : scheme === "instrument" ? 64 : scheme === "fusion" ? 76 : 84;
  const glassy = isGlassy(scheme);
  return (
    <div style={{
      padding: scheme === "instrument" ? `${SPACE.s4}px ${SPACE.s5}px` : `${SPACE.s5}px ${SPACE.s5}px`,
      textAlign: "center",
      background: glassy
        ? `radial-gradient(ellipse at center, ${T.accent}11 0%, transparent 70%)`
        : "transparent",
    }}>
      <Cap T={T} color={inCount ? T.accent : T.text}>{inCount ? "TERMINAL COUNT" : "MISSION ELAPSED"}</Cap>
      <div style={{
        fontFamily: glassy ? FONT.display : FONT.mono,
        fontSize: big,
        fontWeight: glassy ? 500 : 700,
        color: inCount ? T.accent : T.strong,
        fontVariantNumeric: "tabular-nums",
        letterSpacing: glassy ? 4 : 1,
        lineHeight: 1,
        marginTop: SPACE.s2,
        textShadow: sk.showGlow && inCount ? `0 0 30px ${T.accent}` : "none",
      }}>{display}</div>
    </div>
  );
}

function useEventLog(sim) {
  const [events, setEvents] = useState([]);
  const lastPhaseRef = useRef(sim.phase);
  const lastFiredRef = useRef({});
  useEffect(() => {
    const push = (ev) => setEvents(prev => [{...ev, id: prev.length + Math.random()}, ...prev].slice(0, 24));
    if (lastPhaseRef.current !== sim.phase) {
      push({ t: sim.met, type: "STATE", code: "0x01", text: `FSM → ${sim.phase}`, level: "info" });
      lastPhaseRef.current = sim.phase;
    }
    sim.pyro.forEach(p => {
      const key = `ch${p.ch}`;
      if (p.status === "FIRED" && lastFiredRef.current[key] !== "FIRED") {
        push({ t: sim.met, type: "PYRO", code: "0x02", text: `Pyro CH${p.ch} · ${(p.role || "").toUpperCase()} fired`, level: "ok" });
      }
      lastFiredRef.current[key] = p.status;
    });
  }, [sim.phase, sim.pyro, sim.met]);
  return events;
}

function EventLog({ T, events }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", maxHeight: 300, overflowY: "auto" }}>
      {events.map(e => {
        const c = e.level === "ok" ? T.accent : e.level === "warn" ? T.warn : e.level === "err" ? T.danger : T.info;
        return (
          <div key={e.id} style={{
            display: "grid",
            gridTemplateColumns: "68px 64px 1fr",
            gap: SPACE.s2, alignItems: "baseline",
            padding: `${SPACE.s2}px 0`,
            borderBottom: `1px solid ${T.border}`,
            fontFamily: FONT.mono, fontSize: 12,
            fontVariantNumeric: "tabular-nums",
          }}>
            <span style={{ color: T.muted, fontWeight: 600 }}>{fmtMET(e.t)}</span>
            <span style={{ color: c, fontWeight: 700, letterSpacing: 0.5 }}>{e.type}</span>
            <span style={{ color: T.text }}>{e.text}</span>
          </div>
        );
      })}
      {events.length === 0 && (
        <div style={{ padding: SPACE.s4, fontFamily: FONT.mono, color: T.muted, fontSize: 12, textAlign: "center" }}>
          — no events yet —
        </div>
      )}
    </div>
  );
}

function LinkHealth({ T, scheme, sim }) {
  const sk = SCHEME_PROPS[scheme];
  const rssi = sim.rssi;
  const snr = sim.snr || 0;
  const freqErr = sim.freqErr || 0;
  const dataAge = sim.dataAge;
  const recovered = sim.recovered || 0;
  const total = sim.crc.total;
  const lost = sim.crc.lost || 0;
  const lossPct = (total + lost) > 0 ? (lost / (total + lost)) * 100 : 0;
  const Bar = ({ value, min, max, color, label }) => {
    const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontFamily: FONT.cond, fontSize: 10, color: T.muted, letterSpacing: "0.18em", fontWeight: 700, textTransform: "uppercase" }}>{label}</span>
          <span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 700, color: T.strong, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        </div>
        <div style={{ height: 6, background: T.gridLine, borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            width: `${pct * 100}%`, height: "100%",
            background: color,
            boxShadow: sk.showGlow ? `0 0 8px ${color}` : "none",
            transition: "width 200ms",
          }}/>
        </div>
      </div>
    );
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.s4 }}>
      <Bar value={`${rssi.toFixed(0)} dBm`} min={-110} max={-60} color={T.accent} label="RSSI"/>
      <Bar value={`${snr.toFixed(1)} dB`}   min={0}    max={12}  color={T.info}   label="SNR"/>
      <Bar value={`${dataAge} ms`}          min={0}    max={500} color={dataAge > 200 ? T.warn : T.accent} label="Data age"/>
      <Bar value={`${freqErr} Hz`}          min={-500} max={500} color={Math.abs(freqErr) > 300 ? T.warn : T.info} label="Freq err"/>
      <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: SPACE.s2, paddingTop: SPACE.s2, borderTop: `1px solid ${T.border}` }}>
        <div>
          <div style={{ fontFamily: FONT.cond, fontSize: 10, color: T.muted, letterSpacing: "0.18em", fontWeight: 700, textTransform: "uppercase" }}>CRC errors</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 16, fontWeight: 700, color: sim.crc.errors > 0 ? T.warn : T.strong, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{sim.crc.errors}<span style={{ color: T.muted, fontSize: 11, marginLeft: 4 }}>/ {total.toLocaleString()}</span></div>
        </div>
        <div>
          <div style={{ fontFamily: FONT.cond, fontSize: 10, color: T.muted, letterSpacing: "0.18em", fontWeight: 700, textTransform: "uppercase" }}>Recovered</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 16, fontWeight: 700, color: T.accent, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{recovered}<span style={{ color: T.muted, fontSize: 11, marginLeft: 4 }}>1-bit</span></div>
        </div>
        <div>
          <div style={{ fontFamily: FONT.cond, fontSize: 10, color: T.muted, letterSpacing: "0.18em", fontWeight: 700, textTransform: "uppercase" }}>Loss</div>
          <div style={{ fontFamily: FONT.mono, fontSize: 16, fontWeight: 700, color: T.strong, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{lossPct.toFixed(3)}<span style={{ color: T.muted, fontSize: 11, marginLeft: 2 }}>%</span></div>
        </div>
      </div>
    </div>
  );
}

function RPYGraph({ T, scheme, sim, h = 140, fill = false }) {
  const sk = SCHEME_PROPS[scheme];
  const ref = useRef(null);
  const histRef = useRef([]);
  useEffect(() => {
    histRef.current.push({
      r: sim.quat.roll * 57.296,
      p: sim.quat.pitch * 57.296,
      y: sim.quat.yaw * 57.296,
    });
    if (histRef.current.length > 200) histRef.current.shift();
    const c = ref.current; if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, hh = c.clientHeight;
    c.width = w * dpr; c.height = hh * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, hh);
    ctx.strokeStyle = T.gridLine; ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach(f => {
      ctx.beginPath(); ctx.moveTo(0, hh * f); ctx.lineTo(w, hh * f); ctx.stroke();
    });
    ctx.strokeStyle = T.border;
    ctx.beginPath(); ctx.moveTo(0, hh / 2); ctx.lineTo(w, hh / 2); ctx.stroke();
    const data = histRef.current;
    if (data.length < 2) return;
    const range = 90;
    const pts = (sel) => data.map((d, i) => [
      (i / (data.length - 1)) * w,
      hh / 2 - (Math.max(-range, Math.min(range, sel(d))) / range) * (hh / 2 - 4),
    ]);
    const draw = (sel, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1.6;
      if (sk.showGlow) { ctx.shadowColor = color; ctx.shadowBlur = T.name === "dark" ? 4 : 0; }
      ctx.beginPath();
      pts(sel).forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    draw(d => d.r, T.accent);
    draw(d => d.p, T.info);
    draw(d => d.y, T.warn);
  }, [sim.quat, T, sk.showGlow]);
  const Legend = ({ color, label, value }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, boxShadow: sk.showGlow ? `0 0 6px ${color}` : "none", display: "inline-block" }}/>
      <span style={{ fontFamily: FONT.cond, fontSize: 10, color: T.muted, letterSpacing: "0.16em", fontWeight: 700 }}>{label}</span>
      <span style={{ fontFamily: FONT.mono, fontSize: 12, fontWeight: 700, color: T.strong, fontVariantNumeric: "tabular-nums" }}>{value}°</span>
    </div>
  );
  return (
    <div style={fill
      ? { position: "relative", display: "flex", flexDirection: "column", height: "100%", width: "100%" }
      : { position: "relative" }}>
      <div style={{ display: "flex", gap: SPACE.s3, marginBottom: 6, flexShrink: 0 }}>
        <Legend color={T.accent} label="ROLL"  value={(sim.quat.roll * 57.296).toFixed(1)}/>
        <Legend color={T.info}   label="PITCH" value={(sim.quat.pitch * 57.296).toFixed(1)}/>
        <Legend color={T.warn}   label="YAW"   value={(sim.quat.yaw * 57.296).toFixed(1)}/>
      </div>
      <canvas ref={ref} style={fill
        ? { width: "100%", flex: 1, minHeight: 0, display: "block" }
        : { width: "100%", height: h, display: "block" }}/>
      <div style={{ position: "absolute", left: 0, top: 22, fontFamily: FONT.mono, fontSize: 9, color: T.faint, pointerEvents: "none" }}>+90°</div>
      <div style={{ position: "absolute", left: 0, bottom: 0, fontFamily: FONT.mono, fontSize: 9, color: T.faint, pointerEvents: "none" }}>-90°</div>
    </div>
  );
}

export default function FlightTab({ T, sim, scheme, motion, flightConfig = FLIGHT_CONFIG_DEFAULTS, commands = {}, checklist }) {
  const sk = SCHEME_PROPS[scheme];
  const [imperial, setImperial] = useState(false);
  const [trajectoryView, setTrajectoryView] = useState(scheme === "instrument" ? "dials" : "graph");
  useEffect(() => {
    setTrajectoryView(scheme === "instrument" ? "dials" : "graph");
  }, [scheme]);
  const events = useEventLog(sim);
  const altU = imperial ? "ft" : "m";
  const altVal = (m) => imperial ? m * 3.28084 : m;
  const velU = imperial ? "ft/s" : "m/s";
  const velVal = (m) => imperial ? m * 3.28084 : m;

  const { onMasterArm, onArmChannel, onFireChannel, onAbort, anyArmed = false, armDisabled = false } = commands;
  const allGo = !checklist || checklist.every((c) => c.status === "GO");
  // On the pad → show the GO/HOLD/ABORT controls; otherwise apogee projection.
  const goForLaunch = sim.phase === "PAD";

  return (
    <div style={{ display: "flex", gap: SPACE.s3, padding: SPACE.s5, maxWidth: 1880, margin: "0 auto", width: "100%" }}>
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: sk.sectionGap }}>

      {/* HERO STRIP */}
      <Panel T={T} scheme={scheme} padded={false} style={{ position: "relative", overflow: "hidden" }}>
        {isGlassy(scheme) && (
          <div style={{ position: "absolute", inset: 0, opacity: 0.45, pointerEvents: "none" }}>
            <LiquidShader T={T} motion={motion}/>
            <div style={{
              position: "absolute", inset: 0,
              background: T.name === "dark"
                ? `linear-gradient(180deg, ${T.bg}66 0%, ${T.bg}cc 100%)`
                : `linear-gradient(180deg, ${T.bg}44 0%, ${T.bg}aa 100%)`,
            }}/>
          </div>
        )}
        <div style={{ position: "relative", padding: `${SPACE.s5}px ${SPACE.s6}px`, display: "grid", gridTemplateColumns: "1.6fr 1fr 1.6fr", gap: SPACE.s5, alignItems: "center" }}>
          <div>
            <Cap T={T} color={T.accent}>FLIGHT STATE</Cap>
            <div style={{
              fontFamily: isGlassy(scheme) ? FONT.display : FONT.cond,
              fontSize: isGlassy(scheme) ? 64 : 48,
              fontWeight: isGlassy(scheme) ? 500 : 700,
              color: T.strong,
              letterSpacing: isGlassy(scheme) ? "0.04em" : "0.02em",
              textTransform: "uppercase",
              lineHeight: 1,
              marginTop: SPACE.s2,
            }}>{sim.phase}</div>
            <div style={{ fontFamily: FONT.mono, fontSize: TYPE.body, color: T.muted, marginTop: SPACE.s2 }}>
              {sim.phase === "PAD" ? "Standing by · awaiting commit" :
               sim.phase === "BOOST" ? "Motor burning · max thrust" :
               sim.phase === "COAST" ? "Unpowered ascent · drag-dominated" :
               sim.phase === "APOGEE" ? "Peak altitude · drogue charge armed" :
               sim.phase === "DROGUE" ? "Drogue under canopy · descending" :
               sim.phase === "MAIN" ? "Main deployed · gentle descent" :
               "Touchdown · recovery in progress"}
            </div>
          </div>

          <TerminalCount T={T} met={sim.met} scheme={scheme}/>

          <div style={{ textAlign: "right" }}>
            {goForLaunch ? <>
              <Cap T={T} color={T.accent}>RANGE STATUS</Cap>
              <div style={{
                fontFamily: isGlassy(scheme) ? FONT.display : FONT.cond,
                fontSize: isGlassy(scheme) ? 56 : 40,
                fontWeight: isGlassy(scheme) ? 500 : 700,
                color: T.accent,
                letterSpacing: "0.03em", textTransform: "uppercase", lineHeight: 1, marginTop: SPACE.s2,
                textShadow: sk.showGlow ? T.glow(T.accent) : "none",
              }}>GO FOR LAUNCH</div>
              <div style={{ display: "flex", gap: SPACE.s2, marginTop: SPACE.s3, justifyContent: "flex-end" }}>
                <Btn T={T} kind="secondary" size="md" icon="pause">HOLD</Btn>
                <Btn T={T} kind="danger" size="md" icon="abort" onClick={onAbort}>ABORT</Btn>
              </div>
            </> : <>
              <Cap T={T}>APOGEE PROJECTION</Cap>
              <div style={{
                fontFamily: FONT.mono, fontSize: 40, fontWeight: 700,
                color: T.strong, fontVariantNumeric: "tabular-nums",
                letterSpacing: -1, lineHeight: 1, marginTop: SPACE.s2,
              }}>{altVal(sim.apogee || 0).toFixed(0)}<span style={{ fontSize: 16, color: T.muted, fontWeight: 500, marginLeft: 6 }}>{altU}</span></div>
              <div style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                Δ {(altVal(sim.apogee || 0) - altVal(sim.alt)).toFixed(0)}{altU} from current
              </div>
            </>}
          </div>
        </div>
        <div style={{
          padding: `${SPACE.s3}px ${SPACE.s6}px`,
          borderTop: `1px solid ${T.border}`,
          background: scheme === "terminal" ? "transparent" : T.bgEl + "88",
        }}>
          <FSMBar T={T} current={sim.phase} scheme={scheme}/>
        </div>
      </Panel>

      {/* PRIMARY READOUTS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: SPACE.s3 }}>
        <Panel T={T} scheme={scheme} padded={false}>
          <div style={{ padding: SPACE.s4 }}>
            <Cap T={T} color={T.accent}>ALTITUDE · EKF</Cap>
            <div style={{ marginTop: SPACE.s2, display: "flex", alignItems: "baseline", gap: SPACE.s2 }}>
              <BigNum T={T} value={altVal(sim.alt).toFixed(0)} unit={altU} size={42} color={T.strong} glow={sk.showGlow}/>
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
              baro + EKF fused
            </div>
          </div>
        </Panel>
        <Panel T={T} scheme={scheme} padded={false}>
          <div style={{ padding: SPACE.s4 }}>
            <Cap T={T} color={T.info}>VELOCITY</Cap>
            <div style={{ marginTop: SPACE.s2, display: "flex", alignItems: "baseline", gap: SPACE.s2 }}>
              <BigNum T={T} value={velVal(sim.vel).toFixed(1)} unit={velU} size={42} color={sim.vel < 0 ? T.warn : T.strong}/>
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
              {sim.accel >= 0 ? "+" : ""}{sim.accel.toFixed(2)} g · vertical
            </div>
          </div>
        </Panel>
        <Panel T={T} scheme={scheme} padded={false}>
          <div style={{ padding: SPACE.s4 }}>
            <Cap T={T} color={T.warn}>RADIO LINK</Cap>
            <div style={{ marginTop: SPACE.s2, display: "flex", alignItems: "baseline", gap: SPACE.s2 }}>
              <BigNum T={T} value={sim.dataAge} unit="ms" size={42} color={sim.dataAge > 200 ? T.warn : T.strong}/>
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
              {sim.rssi.toFixed(0)} dBm · CRC {sim.crc.errors}/{sim.crc.total.toLocaleString()}
            </div>
          </div>
        </Panel>
        <Panel T={T} scheme={scheme} padded={false}>
          <div style={{ padding: SPACE.s4 }}>
            <Cap T={T} color={sim.batt < 7.4 ? T.danger : T.text}>BATTERY · FC</Cap>
            <div style={{ marginTop: SPACE.s2, display: "flex", alignItems: "baseline", gap: SPACE.s2 }}>
              <BigNum T={T} value={sim.batt.toFixed(2)} unit="V" size={42}
                color={sim.batt < 7.2 ? T.danger : sim.batt < 7.6 ? T.warn : T.strong}/>
            </div>
            <div style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
              {sim.temp.toFixed(1)}°C · 2S LiPo · 1800 mAh
            </div>
          </div>
        </Panel>
      </div>

      {/* MAIN GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: SPACE.s3 }}>
        <Panel T={T} scheme={scheme} title={
          <span style={{ display: "flex", alignItems: "center", gap: SPACE.s2 }}>
            <Cap T={T}>TRAJECTORY</Cap>
            <Pill T={T} color={T.muted} size="sm">{trajectoryView === "dials" ? "4 channels · live" : "200 frames · 100 Hz"}</Pill>
          </span>
        } right={
          <SegToggle T={T} scheme={scheme} value={trajectoryView}
            options={[{ id: "graph", label: "GRAPH", icon: "sparkline" }, { id: "dials", label: "DIALS", icon: "dial" }]}
            onChange={setTrajectoryView}/>
        }>
          {trajectoryView === "dials" ? (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: SPACE.s3, padding: SPACE.s3,
              justifyItems: "center", alignItems: "center",
            }}>
              <Dial T={T} size={200} value={altVal(sim.alt)} min={0} max={altVal(2200)}
                label="ALTITUDE" unit={altU} color={T.accent}
                format={(v) => v.toFixed(0)} ticks={11}/>
              <Dial T={T} size={200} value={velVal(Math.abs(sim.vel))} min={0} max={velVal(280)}
                label="VELOCITY" unit={velU} color={T.info}
                format={(v) => v.toFixed(0)} ticks={14}/>
              <Dial T={T} size={200} value={sim.qbar / 1000} min={0} max={6}
                label="Q-BAR" unit="kPa" color={T.warn}
                format={(v) => v.toFixed(2)} ticks={6}/>
              <Dial T={T} size={200} value={Math.abs(sim.accel)} min={0} max={12}
                label="ACCEL" unit="g" color={T.accent}
                format={(v) => v.toFixed(1)} ticks={12}/>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s4 }}>
              <Sparkline T={T} data={sim.altH.map(altVal)} color={T.accent} h={140} label="ALTITUDE" unit={altU} value={altVal(sim.alt).toFixed(1)} scheme={scheme}/>
              <Sparkline T={T} data={sim.velH.map(velVal)} color={T.info}   h={120} label="VELOCITY" unit={velU} value={velVal(sim.vel).toFixed(1)} scheme={scheme}/>
              <Sparkline T={T} data={sim.qbarH.map(v => v/1000)} color={T.warn} h={80} label="DYNAMIC PRESSURE" unit="kPa" value={(sim.qbar/1000).toFixed(2)} scheme={scheme}/>
            </div>
          )}
        </Panel>

        <Panel T={T} scheme={scheme} title="ATTITUDE · QUATERNION" padded={false}>
          <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 540 }}>
            <div style={{ flex: "0 0 75%", display: "flex", alignItems: "center", justifyContent: "center", padding: SPACE.s2 }}>
              <Rocket3D T={T} size={300} quat={sim.quat} motion={motion} scheme={scheme}/>
            </div>
            <div style={{ flex: "0 0 25%", borderTop: `1px solid ${T.border}`, padding: SPACE.s3, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <RPYGraph T={T} scheme={scheme} sim={sim} fill/>
            </div>
          </div>
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s3 }}>
          <Panel T={T} scheme={scheme} title="PRE-FLIGHT" right={
            <Pill T={T} dot color={allGo ? T.accent : T.danger} glow={sk.showGlow}>
              {allGo ? "GO" : "NO-GO"}
            </Pill>
          }>
            <Checklist T={T} scheme={scheme} checks={checklist}/>
          </Panel>
          <Panel T={T} scheme={scheme} title="GPS LOCK" right={
            <Pill T={T} dot color={sim.gpsFix === "3D" ? T.accent : sim.gpsFix === "2D" ? T.warn : T.danger} size="sm">{sim.gpsFix} · {sim.gpsSats} SATS</Pill>
          } style={{ flex: 1 }}>
            {(() => {
              // tel reports GPS as a delta in degrees from the pad origin.
              const dlatM = sim.gpsLat * 111320;
              const dlonM = sim.gpsLon * 111320;
              const distM = Math.hypot(dlatM, dlonM);
              const bearing = (Math.atan2(dlonM, dlatM) * 180 / Math.PI + 360) % 360;
              const fixQuality = sim.gpsFix === "3D" ? "EXCELLENT" : sim.gpsFix === "2D" ? "DEGRADED" : "NO FIX";
              const fixColor = sim.gpsFix === "3D" ? T.accent : sim.gpsFix === "2D" ? T.warn : T.danger;
              return (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.s3, marginBottom: SPACE.s3 }}>
                    <div>
                      <Cap T={T}>Δ LATITUDE</Cap>
                      <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{sim.gpsLat.toFixed(5)}°</div>
                    </div>
                    <div>
                      <Cap T={T}>Δ LONGITUDE</Cap>
                      <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{sim.gpsLon.toFixed(5)}°</div>
                    </div>
                    <div>
                      <Cap T={T}>HDOP</Cap>
                      <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.muted, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>—</div>
                    </div>
                    <div>
                      <Cap T={T}>FIX QUALITY</Cap>
                      <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: fixColor, marginTop: 2 }}>{fixQuality}</div>
                    </div>
                    <div>
                      <Cap T={T}>ALT · AGL</Cap>
                      <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{sim.alt.toFixed(0)} m</div>
                    </div>
                    <div>
                      <Cap T={T}>Δ FROM PAD</Cap>
                      <div style={{ fontFamily: FONT.mono, fontSize: 18, fontWeight: 700, color: T.strong, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{distM.toFixed(1)} m</div>
                    </div>
                  </div>
                  <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: SPACE.s3, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <Cap T={T}>BEARING TO PAD</Cap>
                    <span style={{ fontFamily: FONT.mono, fontSize: 13, fontWeight: 700, color: T.strong, fontVariantNumeric: "tabular-nums" }}>{bearing.toFixed(0)}° · {(distM / 1000).toFixed(2)} km</span>
                  </div>
                </>
              );
            })()}
          </Panel>
        </div>
      </div>

      {/* SECONDARY GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: SPACE.s3 }}>
        <Panel T={T} scheme={scheme} title="LINK HEALTH" right={
          <Pill T={T} dot color={sim.dataAge > 200 ? T.warn : T.accent} size="sm" glow={sk.showGlow}>
            {sim.dataAge > 200 ? "DEGRADED" : "NOMINAL"}
          </Pill>
        }>
          <LinkHealth T={T} scheme={scheme} sim={sim}/>
        </Panel>
        <Panel T={T} scheme={scheme} title="EVENT LOG" right={
          <div style={{ display: "flex", gap: SPACE.s2, alignItems: "center" }}>
            <Pill T={T} color={T.muted} size="sm">{events.length} events</Pill>
            <Btn T={T} kind="ghost" size="xs" icon="download">EXPORT</Btn>
          </div>
        }>
          <EventLog T={T} events={events}/>
        </Panel>
      </div>
    </div>

    {/* RIGHT RAIL */}
    <aside style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: sk.sectionGap, position: "sticky", top: 0, alignSelf: "flex-start" }}>
      <button
        disabled={armDisabled}
        onClick={onMasterArm}
        style={{
        width: "100%",
        padding: `${SPACE.s5}px ${SPACE.s4}px`,
        background: anyArmed ? T.warn : T.danger,
        color: "#fff",
        border: `2px solid ${anyArmed ? T.warn : T.danger}`,
        borderRadius: sk.panelRadius,
        fontFamily: FONT.display, fontSize: 38, fontWeight: 600,
        letterSpacing: "0.18em", textTransform: "uppercase",
        cursor: armDisabled ? "not-allowed" : "pointer",
        opacity: armDisabled ? 0.4 : 1,
        boxShadow: sk.showGlow ? `0 0 24px ${anyArmed ? T.warn : T.danger}, inset 0 0 12px rgba(0,0,0,0.25)` : "inset 0 -3px 0 rgba(0,0,0,0.25)",
        textShadow: "0 1px 2px rgba(0,0,0,0.4)",
        position: "relative",
        animation: sk.showGlow ? "cmcArmPulse 2.4s ease-in-out infinite" : "none",
      }}
      onMouseEnter={(e) => { if (!armDisabled) e.currentTarget.style.filter = "brightness(1.1)"; }}
      onMouseLeave={(e) => e.currentTarget.style.filter = "none"}>
        <div style={{ fontFamily: FONT.cond, fontSize: 10, fontWeight: 700, letterSpacing: "0.24em", opacity: 0.7, marginBottom: 4 }}>HOLD 2 S · CAC</div>
        {anyArmed ? "DISARM" : "ARM"}
      </button>

      <Panel T={T} scheme={scheme} title="PYRO CHANNELS" right={
        <Pill T={T} dot color={anyArmed ? T.warn : T.accent} size="sm" glow={sk.showGlow}>{anyArmed ? "ARMED" : "CAC SAFE"}</Pill>
      }>
        <PyroStrip T={T} pyro={sim.pyro} scheme={scheme} vertical onArm={onArmChannel} onFire={onFireChannel} disabled={armDisabled}/>
        <div style={{ marginTop: SPACE.s3, paddingTop: SPACE.s3, borderTop: `1px solid ${T.border}`, display: "flex", gap: SPACE.s2 }}>
          <Btn T={T} kind="ghost" size="xs" icon="lock" full>SAFETY</Btn>
          <Btn T={T} kind="ghost" size="xs" icon="check" full>VERIFY</Btn>
        </div>
      </Panel>

      <Panel T={T} scheme={scheme} title="FLIGHT CONFIG" right={
        <Pill T={T} color={T.muted} size="sm">v1.4.2</Pill>
      }>
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s2, fontFamily: FONT.mono, fontSize: 12 }}>
          {[
            ["Profile",        flightConfig.profile],
            ["Motor",          flightConfig.motor],
            ["Mass (wet)",     formatMassKg(flightConfig.massWetKg)],
            ["Apogee target",  formatAltM(flightConfig.apogeeTargetM)],
            ["Drogue at",      flightConfig.drogueAt],
            ["Main at",        formatAltM(flightConfig.mainAtM) + " AGL"],
            ["CRC hash",       flightConfigHash(flightConfig)],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 4, borderBottom: `1px solid ${T.border}` }}>
              <span style={{ color: T.muted, letterSpacing: 0.3 }}>{k}</span>
              <span style={{ color: T.strong, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel T={T} scheme={scheme} title="RECOVERY · BEACON" right={
        <Pill T={T} dot color={T.accent} size="sm" glow={sk.showGlow}>ACTIVE</Pill>
      }>
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s2, fontFamily: FONT.mono, fontSize: 12 }}>
          {[
            ["Beacon",         "GS-LoRa 433 MHz"],
            ["Burst rate",     "1 / 5 s"],
            ["TX power",       "+20 dBm"],
            ["Last fix",       sim.gpsLat.toFixed(4) + "°N"],
            ["Predicted zone", "0.62 km NW"],
            ["Wind aloft",     "260° · 7.4 m/s"],
            ["Vehicle ID",     flightConfig.vehicleId],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 4, borderBottom: `1px solid ${T.border}` }}>
              <span style={{ color: T.muted, letterSpacing: 0.3 }}>{k}</span>
              <span style={{ color: T.strong, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: SPACE.s3, paddingTop: SPACE.s3, borderTop: `1px solid ${T.border}`, display: "flex", gap: SPACE.s2 }}>
          <Btn T={T} kind="ghost" size="xs" icon="satellite" full>LOCATE</Btn>
          <Btn T={T} kind="ghost" size="xs" icon="wave" full>PING</Btn>
        </div>
      </Panel>
    </aside>
  </div>
  );
}
