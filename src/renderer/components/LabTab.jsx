// LAB tab — design taster for the new "Cinematic Obsidian + Brushed Pearl"
// language. Self-contained: no production hooks, no IPC, no shared state with
// the rest of the app. Renders representative widgets from every existing tab
// so the user can react to typography, palette, motion, and density.
//
// Each section ends with a "// TUNING:" annotation that surfaces next to the
// content as a faint mono caption — speak to me about those.

import { useEffect, useMemo, useRef, useState } from "react";
import LiquidMetalCanvas from "./lab/LiquidMetalCanvas.jsx";
import { TOKENS, FONT, TYPE, SPACE, RADIUS, TRACK } from "../design/lab-tokens.js";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function fmtTime(t) {
  const sign = t < 0 ? "-" : "+";
  const abs = Math.abs(t);
  const m = Math.floor(abs / 60);
  const s = Math.floor(abs % 60);
  const ms = Math.floor((abs - Math.floor(abs)) * 10);
  return "T" + sign + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + "." + ms;
}

function useDemoMet() {
  const [t, setT] = useState(-12.4);
  useEffect(() => {
    const id = setInterval(() => setT((v) => v + 0.1), 100);
    return () => clearInterval(id);
  }, []);
  return t;
}

// Synth a smooth telemetry-ish trace.
function useTrace(seed, len, freq, amp, baseline) {
  const [arr, setArr] = useState(() => Array(len).fill(baseline));
  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      setArr((prev) => {
        const next = prev.slice(1);
        const v = baseline
          + Math.sin((i + seed) * freq) * amp
          + Math.sin((i + seed) * freq * 0.27) * amp * 0.4
          + (Math.random() - 0.5) * amp * 0.08;
        next.push(v);
        i++;
        return next;
      });
    }, 80);
    return () => clearInterval(id);
  }, [seed, freq, amp, baseline]);
  return arr;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function Btn({ T, kind = "ghost", disabled, onClick, children, full, mono, size = "md" }) {
  const sizes = {
    sm: { fs: 9.5,  px: 10, py: 4 },
    md: { fs: 10.5, px: 14, py: 6 },
    lg: { fs: 12,   px: 18, py: 9 },
  };
  const sz = sizes[size];
  const base = {
    fontFamily: mono ? FONT.mono : FONT.cond,
    fontSize: sz.fs,
    fontWeight: 700,
    letterSpacing: mono ? 0 : 1.4,
    textTransform: mono ? "none" : "uppercase",
    padding: `${sz.py}px ${sz.px}px`,
    borderRadius: RADIUS.sm,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    transition: "all 160ms ease",
    width: full ? "100%" : undefined,
    border: "1px solid transparent",
  };
  const styles = {
    primary: {
      background: T.accent,
      color: T.armedText,
      border: "1px solid " + T.accent,
      boxShadow: T.glowSoft(T.accent),
    },
    secondary: {
      background: "transparent",
      color: T.text,
      border: "1px solid " + T.border,
    },
    ghost: {
      background: "transparent",
      color: T.muted,
      border: "1px solid transparent",
    },
    danger: {
      background: T.dangerBg,
      color: T.danger,
      border: "1px solid " + T.danger,
    },
    accent: {
      background: T.accentBg,
      color: T.accent,
      border: "1px solid " + T.accentRing,
    },
  };
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{ ...base, ...styles[kind] }}>
      {children}
    </button>
  );
}

function Pill({ T, dot, color, children, glow }) {
  const c = color || T.muted;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 8px",
      borderRadius: RADIUS.pill,
      border: "1px solid " + T.border,
      background: T.bgEl,
      fontFamily: FONT.mono, fontSize: TYPE.micro, fontWeight: 600,
      color: c, letterSpacing: 0.4,
    }}>
      {dot && <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: c, boxShadow: glow ? T.glowSoft(c) : "none",
      }} />}
      {children}
    </span>
  );
}

function Cap({ T, children, color }) {
  return (
    <div style={{
      fontFamily: FONT.cond, fontSize: TYPE.cap, fontWeight: 700,
      color: color || T.muted, letterSpacing: 1.8,
      textTransform: "uppercase",
    }}>{children}</div>
  );
}

function Section({ T, eyebrow, title, hint, tuning, children, contentStyle }) {
  return (
    <section style={{ marginBottom: SPACE.s8 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: SPACE.s3 }}>
        <div>
          <Cap T={T} color={T.accent}>{eyebrow}</Cap>
          <h2 style={{
            fontFamily: FONT.sans, fontSize: TYPE.title, fontWeight: 600,
            color: T.strong, letterSpacing: 0.2, margin: 0, marginTop: 2,
          }}>{title}</h2>
          {hint && (
            <p style={{
              fontFamily: FONT.mono, fontSize: TYPE.micro, color: T.muted,
              margin: 0, marginTop: 4, maxWidth: 720,
            }}>{hint}</p>
          )}
        </div>
        {tuning && (
          <span style={{
            fontFamily: FONT.mono, fontSize: TYPE.micro, color: T.faint,
            border: "1px dashed " + T.border, padding: "3px 8px", borderRadius: RADIUS.sm,
            whiteSpace: "nowrap", marginLeft: SPACE.s4,
          }}>↳ TUNING: {tuning}</span>
        )}
      </header>
      <div style={contentStyle}>{children}</div>
    </section>
  );
}

function Panel({ T, title, right, children, padded = true, glass }) {
  return (
    <div style={{
      background: glass
        ? (T.name === "dark" ? "rgba(12,17,24,0.62)" : "rgba(255,255,255,0.7)")
        : T.bgPanel,
      backdropFilter: glass ? T.glassBlur : undefined,
      WebkitBackdropFilter: glass ? T.glassBlur : undefined,
      border: "1px solid " + T.border,
      borderRadius: RADIUS.md,
      boxShadow: T.shadowSoft,
      overflow: "hidden",
    }}>
      {(title || right) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${SPACE.s3}px ${SPACE.s4}px`,
          borderBottom: "1px solid " + T.border,
          background: T.name === "dark" ? "rgba(255,255,255,0.012)" : "rgba(15,23,42,0.025)",
        }}>
          <Cap T={T}>{title}</Cap>
          <div>{right}</div>
        </div>
      )}
      <div style={{ padding: padded ? SPACE.s4 : 0 }}>{children}</div>
    </div>
  );
}

function StatTile({ T, label, value, unit, color, accent }) {
  const c = color || T.strong;
  return (
    <div style={{
      padding: `${SPACE.s3}px ${SPACE.s4}px`,
      background: accent ? T.accentBg : T.bgHi,
      border: "1px solid " + (accent ? T.accentRing : T.border),
      borderRadius: RADIUS.md,
    }}>
      <Cap T={T}>{label}</Cap>
      <div style={{
        fontFamily: FONT.mono, fontSize: 22, fontWeight: 700,
        fontVariantNumeric: "tabular-nums", color: c, letterSpacing: -0.5,
        marginTop: 2, lineHeight: 1.05,
      }}>
        {value}
        {unit && <span style={{
          fontSize: TYPE.body, fontWeight: 500, color: T.muted, marginLeft: 4,
        }}>{unit}</span>}
      </div>
    </div>
  );
}

// Tiny sparkline (avoids depending on App.jsx's Graph()).
function Sparkline({ T, data, color, h = 64, label, unit }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pad = 6;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${pad + ((max - v) / range) * (h - pad * 2)}`)
    .join(" ");
  const id = "lab-sl-" + (color || T.accent).replace(/[^a-z0-9]/gi, "");
  const last = data[data.length - 1];
  return (
    <div style={{
      position: "relative", padding: SPACE.s3,
      background: T.bgHi, border: "1px solid " + T.border, borderRadius: RADIUS.md,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Cap T={T}>{label}</Cap>
        <span style={{
          fontFamily: FONT.mono, fontSize: TYPE.data, fontWeight: 700,
          fontVariantNumeric: "tabular-nums", color: color || T.accent,
        }}>
          {last.toFixed(1)}
          <span style={{ color: T.muted, fontSize: TYPE.micro, fontWeight: 500, marginLeft: 3 }}>{unit}</span>
        </span>
      </div>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h, display: "block", marginTop: SPACE.s1 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={color || T.accent} stopOpacity={T.name === "dark" ? 0.30 : 0.18} />
            <stop offset="100%" stopColor={color || T.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <line key={i} x1="0" y1={pad + ((h - pad * 2) / 3) * i} x2="100" y2={pad + ((h - pad * 2) / 3) * i}
            stroke={T.gridLine} strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        ))}
        <polyline points={`0,${h} ${pts} 100,${h}`} fill={`url(#${id})`} />
        <polyline points={pts} fill="none" stroke={color || T.accent} strokeWidth="1.6"
          vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini canvases — radar + rocket attitude
// ---------------------------------------------------------------------------

function MiniRadar({ T, size = 220 }) {
  const ref = useRef(null);
  const blipsRef = useRef([
    { brg:  35, rng: 0.62, label: "FC" },
    { brg: 220, rng: 0.40, label: "ECHO" },
    { brg: 305, rng: 0.78, label: "PAD" },
  ]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    let raf, sweep = 0;
    const draw = () => {
      sweep = (sweep + 0.012) % (Math.PI * 2);
      ctx.clearRect(0, 0, size, size);

      // Outer ring
      const r = size / 2 - 4;
      const cx = size / 2, cy = size / 2;
      ctx.strokeStyle = T.border;
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (r * i) / 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Crosshair
      ctx.beginPath();
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
      ctx.stroke();

      // Sweep
      const grad = ctx.createConicGradient
        ? ctx.createConicGradient(sweep - Math.PI / 2, cx, cy)
        : null;
      if (grad) {
        grad.addColorStop(0,    T.accent + "00");
        grad.addColorStop(0.18, T.accent + "55");
        grad.addColorStop(0.20, T.accent + "00");
        grad.addColorStop(1,    T.accent + "00");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Blips
      for (const b of blipsRef.current) {
        const ang = (b.brg * Math.PI) / 180 - Math.PI / 2;
        const x = cx + Math.cos(ang) * r * b.rng;
        const y = cy + Math.sin(ang) * r * b.rng;
        const da = Math.abs(((sweep - (ang + Math.PI / 2) + Math.PI * 2) % (Math.PI * 2)));
        const fade = Math.max(0.25, 1 - da / (Math.PI * 1.3));
        ctx.fillStyle = T.accent;
        ctx.globalAlpha = fade;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = fade * 0.4;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = T.muted;
        ctx.font = "9px " + FONT.mono;
        ctx.fillText(b.label, x + 8, y - 6);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [T, size]);
  return <canvas ref={ref} style={{ width: size, height: size, display: "block" }} />;
}

function MiniRocket({ T, size = 220 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);

    const verts = [
      // Body cylinder approximated by rectangle with fins + nose.
      [-0.20, -0.95, 0],   [0.20, -0.95, 0],
      [-0.20,  0.55, 0],   [0.20,  0.55, 0],
      [ 0.00, -1.15, 0],   // nose tip
      [-0.45,  0.85, 0],   [0.45, 0.85, 0],   // fin outer
    ];
    const edges = [
      [0, 1], [2, 3], [0, 2], [1, 3],
      [0, 4], [1, 4],
      [2, 5], [3, 6], [5, 2], [6, 3],
    ];

    let raf, t0 = performance.now();
    const draw = (now) => {
      const t = (now - t0) / 1000;
      // Slow drift quaternion derived from sine: roll/pitch/yaw
      const roll  = Math.sin(t * 0.6) * 0.35;
      const pitch = Math.sin(t * 0.4 + 1.0) * 0.20;
      const yaw   = Math.sin(t * 0.3 + 0.5) * 0.30;
      const cr = Math.cos(roll),  sr = Math.sin(roll);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const cy = Math.cos(yaw),   sy = Math.sin(yaw);

      ctx.clearRect(0, 0, size, size);
      const cx = size / 2, cyc = size / 2;
      const scale = size * 0.32;

      // Backdrop ring
      ctx.strokeStyle = T.border;
      ctx.beginPath();
      ctx.arc(cx, cyc, scale * 1.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = T.gridLine;
      ctx.beginPath(); ctx.moveTo(cx - scale * 1.3, cyc); ctx.lineTo(cx + scale * 1.3, cyc); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cyc - scale * 1.3); ctx.lineTo(cx, cyc + scale * 1.3); ctx.stroke();

      const proj = verts.map(([x, y, z]) => {
        // ZYX rotation
        let X = x, Y = y, Z = z;
        // yaw (Z)
        let nx = X * cy - Y * sy; let ny = X * sy + Y * cy; X = nx; Y = ny;
        // pitch (X)
        let nY = Y * cp - Z * sp; let nZ = Y * sp + Z * cp; Y = nY; Z = nZ;
        // roll (Y)
        let nX = X * cr + Z * sr; nZ = -X * sr + Z * cr; X = nX; Z = nZ;
        return [cx + X * scale, cyc + Y * scale, Z];
      });

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = T.accent;
      ctx.shadowColor = T.accent;
      ctx.shadowBlur  = T.name === "dark" ? 6 : 0;
      for (const [a, b] of edges) {
        ctx.beginPath();
        ctx.moveTo(proj[a][0], proj[a][1]);
        ctx.lineTo(proj[b][0], proj[b][1]);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // HUD
      ctx.fillStyle = T.muted;
      ctx.font = "9px " + FONT.mono;
      ctx.fillText("ROLL  " + (roll  * 57.296).toFixed(1).padStart(6, " ") + "°", 8, size - 28);
      ctx.fillText("PITCH " + (pitch * 57.296).toFixed(1).padStart(6, " ") + "°", 8, size - 16);
      ctx.fillText("YAW   " + (yaw   * 57.296).toFixed(1).padStart(6, " ") + "°", 8, size - 4);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [T, size]);
  return <canvas ref={ref} style={{ width: size, height: size, display: "block" }} />;
}

// ---------------------------------------------------------------------------
// Section bodies
// ---------------------------------------------------------------------------

function HeroStrip({ T, mode, setMode, quiet, setQuiet }) {
  const met = useDemoMet();
  return (
    <div style={{
      position: "relative",
      borderRadius: RADIUS.lg,
      overflow: "hidden",
      border: "1px solid " + T.border,
      boxShadow: T.shadow,
      isolation: "isolate",
    }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0, opacity: T.name === "dark" ? 0.95 : 0.7 }}>
        <LiquidMetalCanvas palette={T.shader} quiet={quiet} intensity={T.name === "dark" ? 1.0 : 0.85} />
      </div>
      <div style={{
        position: "absolute", inset: 0, zIndex: 1,
        background: T.name === "dark"
          ? "linear-gradient(180deg, rgba(4,6,10,0.20) 0%, rgba(4,6,10,0.65) 78%, rgba(4,6,10,0.92) 100%)"
          : "linear-gradient(180deg, rgba(243,245,248,0.20) 0%, rgba(243,245,248,0.55) 78%, rgba(243,245,248,0.85) 100%)",
        pointerEvents: "none",
      }} />
      <div style={{ position: "relative", zIndex: 2, padding: `${SPACE.s7}px ${SPACE.s7}px ${SPACE.s6}px` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: SPACE.s5 }}>
          <div>
            <Cap T={T} color={T.accent}>OBSIDIAN BUILD · MISSION CONTROL · v0</Cap>
            <h1 style={{
              fontFamily: FONT.display,
              fontSize: TYPE.display,
              fontWeight: 400,
              letterSpacing: TRACK.display,
              color: T.strong,
              textTransform: "uppercase",
              margin: 0, marginTop: SPACE.s3,
              lineHeight: 0.92,
              textShadow: T.name === "dark" ? "0 2px 30px rgba(94,234,212,0.20)" : "none",
            }}>C·A·S·P·E·R</h1>
            <p style={{
              fontFamily: FONT.sans, fontSize: TYPE.hero, fontWeight: 300,
              color: T.text, margin: 0, marginTop: SPACE.s3, maxWidth: 620, lineHeight: 1.25,
            }}>
              Control & Stability Package — telemetry as a work of instrumentation.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: SPACE.s2 }}>
            <div style={{ display: "flex", gap: SPACE.s2 }}>
              <Btn T={T} kind="secondary" size="sm" onClick={() => setQuiet((q) => !q)} mono>
                {quiet ? "▶ MOTION" : "❚❚ QUIET"}
              </Btn>
              <Btn T={T} kind="secondary" size="sm" onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))} mono>
                {mode === "dark" ? "☼ LIGHT" : "☽ DARK"}
              </Btn>
            </div>
            <div style={{
              fontFamily: FONT.mono, fontSize: 36, fontWeight: 600,
              color: T.strong, fontVariantNumeric: "tabular-nums",
              letterSpacing: 1.5, lineHeight: 1, marginTop: SPACE.s2,
              textShadow: T.name === "dark" ? "0 0 18px " + T.accent + "33" : "none",
            }}>{fmtTime(met)}</div>
            <Cap T={T}>MISSION ELAPSED</Cap>
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.s2, marginTop: SPACE.s5 }}>
          <Pill T={T} dot color="#38bdf8" glow>FC · USB · 3.0 Mbps</Pill>
          <Pill T={T} dot color={T.accent} glow>GS · LoRa · -89 dBm</Pill>
          <Pill T={T} dot color={T.warn}>CAC · SAFE</Pill>
          <Pill T={T} dot color={T.muted}>FSM · PAD</Pill>
          <Pill T={T} color={T.text}>BAT · 8.2 V</Pill>
          <Pill T={T} color={T.text}>TEMP · 22.4 °C</Pill>
          <Pill T={T} color={T.text}>CRC · 0 ERR / 12,431</Pill>
        </div>
      </div>
    </div>
  );
}

function ChromeSample({ T }) {
  const items = [
    { id: "setup", label: "SETUP", icon: "⚙", active: false },
    { id: "test",  label: "TEST",  icon: "⚡", active: false },
    { id: "flight",label: "FLIGHT",icon: "▲", active: false },
    { id: "track", label: "TRACK", icon: "◎", active: false },
    { id: "lab",   label: "LAB",   icon: "◇", active: true },
  ];
  return (
    <Panel T={T} title="SIDEBAR · TAB RAIL" right={<Cap T={T}>72 px wide</Cap>}>
      <div style={{ display: "flex", gap: SPACE.s4, alignItems: "stretch" }}>
        <div style={{
          width: 72, borderRight: "1px solid " + T.border,
          display: "flex", flexDirection: "column", paddingTop: SPACE.s2,
          background: T.bgEl, borderRadius: RADIUS.sm,
        }}>
          {items.map((t) => (
            <button key={t.id} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              padding: "12px 4px", border: "none", cursor: "pointer",
              background: t.active ? T.accentBg : "transparent",
              borderLeft: (t.active ? "3px solid " + T.accent : "3px solid transparent"),
              color: t.active ? T.accent : T.muted,
              transition: "all 160ms ease",
            }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{
                fontFamily: FONT.cond, fontSize: 8, fontWeight: 700, letterSpacing: 1.5,
              }}>{t.label}</span>
            </button>
          ))}
        </div>
        <div style={{ flex: 1, padding: SPACE.s3, color: T.muted, fontFamily: FONT.mono, fontSize: TYPE.micro }}>
          <p style={{ margin: 0 }}>The current production sidebar is rendered at App.jsx:1063.</p>
          <p style={{ margin: 0, marginTop: SPACE.s2 }}>
            Differences in this taster: tab labels use <span style={{ color: T.accent }}>IBM Plex Sans Condensed 700 / 1.5 px tracking</span>,
            active rail color shifts from emerald (#22d3a0) to mint→cyan ({T.accent}), and the active background uses a {Math.round(0.10 * 100)}% accent tint
            instead of a solid color block.
          </p>
        </div>
      </div>
    </Panel>
  );
}

function PyroCard({ T, ch, role, status }) {
  const isArmed = status === "ARMED";
  const isFiring = status === "FIRING";
  const c = isFiring ? T.firingBg : isArmed ? T.danger : T.accent;
  return (
    <Panel T={T} title={<span style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{
        fontFamily: FONT.mono, fontSize: TYPE.micro, color: T.muted,
      }}>HW{ch}</span>
      <span style={{ color: T.text, fontFamily: FONT.cond, letterSpacing: 1.5 }}>{role}</span>
    </span>} right={<Pill T={T} dot color={c} glow={isArmed || isFiring}>{status}</Pill>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.s3 }}>
        <div>
          <Cap T={T}>Continuity</Cap>
          <div style={{ fontFamily: FONT.mono, fontSize: TYPE.data, fontWeight: 700, color: T.accent }}>
            ●●● 2.18 Ω
          </div>
        </div>
        <div>
          <Cap T={T}>Threshold</Cap>
          <div style={{ fontFamily: FONT.mono, fontSize: TYPE.data, fontWeight: 700, color: T.text }}>
            {role === "Main" ? "300 m AGL" : role === "Apogee" ? "T+APOGEE" : role === "Ignition" ? "T+0.8 s" : "—"}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function SetupSection({ T }) {
  return (
    <Section T={T}
      eyebrow="SETUP · CONFIG"
      title="Pyro channels and flight log"
      hint="A re-skin of the SETUP tab's two heaviest panels: pyro role grid and the flight-log download. Same data shape; refreshed type, density, and accent."
      tuning="density of pyro grid; mono numeric weight"
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: SPACE.s3, marginBottom: SPACE.s4 }}>
        <PyroCard T={T} ch={1} role="Apogee"   status="SAFE" />
        <PyroCard T={T} ch={2} role="Main"     status="SAFE" />
        <PyroCard T={T} ch={3} role="Ignition" status="ARMED" />
        <PyroCard T={T} ch={4} role="Custom"   status="SAFE" />
      </div>

      <Panel T={T} title="FLIGHT LOG · readout"
        right={<div style={{ display: "flex", gap: SPACE.s2 }}>
          <Btn T={T} kind="primary" size="sm" mono>▼ DOWNLOAD</Btn>
          <Btn T={T} kind="secondary" size="sm" mono>EXPORT CSV</Btn>
          <Btn T={T} kind="danger" size="sm" mono>ERASE</Btn>
        </div>}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: SPACE.s1 }}>
          <Cap T={T} color={T.accent}>HARVESTING · HIGH-RATE</Cap>
          <span style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, fontVariantNumeric: "tabular-nums" }}>67%</span>
        </div>
        <div style={{ height: 6, background: T.bgEl, borderRadius: RADIUS.pill, overflow: "hidden", border: "1px solid " + T.border }}>
          <div style={{
            height: "100%", width: "67%",
            background: `linear-gradient(90deg, ${T.accent} 0%, ${T.accent2} 100%)`,
            borderRadius: RADIUS.pill,
            boxShadow: T.glowSoft(T.accent),
          }} />
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: TYPE.micro, color: T.muted, marginTop: SPACE.s1 }}>
          0x00C32A0 · 8,431 / 12,580 frames · CRC 0 errors · ~14 s remaining
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: SPACE.s2, marginTop: SPACE.s3 }}>
          <StatTile T={T} label="High-Rate" value="8,431" unit="entries" />
          <StatTile T={T} label="Low-Rate"  value="2,134" unit="entries" />
          <StatTile T={T} label="Summary"   value="42"    unit="events" accent />
        </div>
        <div style={{
          marginTop: SPACE.s3, maxHeight: 140, overflowY: "auto",
          background: T.bgEl, border: "1px solid " + T.border, borderRadius: RADIUS.md,
        }}>
          {[
            { t: 0.000, m: "PAD ARMED" },
            { t: 0.114, m: "BOOST detected · accel 8.2 G" },
            { t: 4.220, m: "BURNOUT · velocity 248 m/s" },
            { t: 21.430, m: "APOGEE · 1,847 m AGL" },
            { t: 21.612, m: "DROGUE deploy · channel 1" },
            { t: 84.910, m: "MAIN deploy · 300 m AGL · channel 2" },
            { t: 142.330, m: "LANDED · battery 7.9 V" },
          ].map((e, i) => (
            <div key={i} style={{
              display: "flex", gap: 12, padding: "4px 12px",
              fontFamily: FONT.mono, fontSize: TYPE.cap,
              borderBottom: i < 6 ? "1px solid " + T.border : "none",
            }}>
              <span style={{ color: T.accent, minWidth: 64, fontVariantNumeric: "tabular-nums" }}>
                {e.t.toFixed(3)}s
              </span>
              <span style={{ color: T.text }}>{e.m}</span>
            </div>
          ))}
        </div>
      </Panel>
    </Section>
  );
}

function TestSection({ T }) {
  const alt = useTrace(0.0, 80, 0.18,  140,   720);
  const vel = useTrace(1.7, 80, 0.20,   45,    32);
  const qbar= useTrace(3.4, 80, 0.13, 1200,  4200);
  const itg = useTrace(5.1, 80, 0.09,    8,    96);
  return (
    <Section T={T}
      eyebrow="TEST · BENCH"
      title="Live sparklines & arming console"
      hint="Bench-mode telemetry quad and the safety-critical command row. ARM/DISARM/FIRE follows the existing CAC two-step flow."
      tuning="sparkline grid contrast · button hierarchy strength"
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: SPACE.s3 }}>
        <Sparkline T={T} data={alt}  color={T.accent}  label="ALTITUDE"  unit="m" />
        <Sparkline T={T} data={vel}  color={T.accent2} label="VELOCITY"  unit="m/s" />
        <Sparkline T={T} data={qbar} color={T.warn}    label="DYN PRESS" unit="Pa" />
        <Sparkline T={T} data={itg}  color={T.info}    label="LINK INT." unit="%" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: SPACE.s3, marginTop: SPACE.s4 }}>
        <Panel T={T} title="ARMING CONSOLE · CAC" right={<Pill T={T} dot color={T.warn}>SAFE</Pill>}>
          <div style={{ display: "flex", gap: SPACE.s3, alignItems: "center" }}>
            <Btn T={T} kind="accent" size="lg" mono>ARM</Btn>
            <Btn T={T} kind="secondary" size="lg" mono>DISARM</Btn>
            <Btn T={T} kind="danger" size="lg" mono disabled>● FIRE</Btn>
            <span style={{
              fontFamily: FONT.mono, fontSize: TYPE.micro, color: T.muted,
              flex: 1, lineHeight: 1.5, marginLeft: SPACE.s3,
            }}>
              Two-step confirmation required. CAC challenge token 0x4F2A · 7-second window · backup latch on hold.
            </span>
          </div>
        </Panel>
        <Panel T={T} title="SENSOR BUS">
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", rowGap: SPACE.s2, columnGap: SPACE.s3, fontFamily: FONT.mono, fontSize: TYPE.cap }}>
            <span style={{ color: T.muted }}>LSM6DSO32</span>
            <span style={{ color: T.text }}>SPI2 · 833 Hz · ±32 g</span>
            <Pill T={T} dot color={T.accent}>OK</Pill>
            <span style={{ color: T.muted }}>ADXL372</span>
            <span style={{ color: T.text }}>SPI3 · 6.4 kHz · ±200 g</span>
            <Pill T={T} dot color={T.accent}>OK</Pill>
            <span style={{ color: T.muted }}>MS5611</span>
            <span style={{ color: T.text }}>SPI4 · OSR 1024</span>
            <Pill T={T} dot color={T.accent}>OK</Pill>
            <span style={{ color: T.muted }}>W25Q512JV</span>
            <span style={{ color: T.text }}>QSPI · 64 MB · 38% used</span>
            <Pill T={T} dot color={T.warn}>WARN</Pill>
          </div>
        </Panel>
      </div>
    </Section>
  );
}

function FlightSection({ T }) {
  const checks = [
    { id: "pyro",   label: "Pyro continuity all 4 channels",  status: "GO"  },
    { id: "ekf",    label: "EKF converged · σ_alt < 0.4 m",   status: "GO"  },
    { id: "gps",    label: "GPS fix · 8+ sats · HDOP < 1.2",  status: "GO"  },
    { id: "telem",  label: "Telemetry CRC clean · last 60 s", status: "GO"  },
    { id: "cac",    label: "CAC token validated",             status: "OVRD" },
    { id: "wx",     label: "Wind aloft within envelope",      status: "NO-GO" },
  ];
  const allGo = checks.every((c) => c.status === "GO" || c.status === "OVRD");
  return (
    <Section T={T}
      eyebrow="FLIGHT · LAUNCH OPS"
      title="Pre-flight checklist & terminal count"
      hint="The single most-scrutinized screen. Tries to keep functional density, large readable countdown, and the visible state timeline. FLIGHT will be the *last* tab to receive the new language in production."
      tuning="terminal-count weight & glow · checklist row density"
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: SPACE.s4 }}>
        <Panel T={T} title="PRE-FLIGHT CHECKLIST"
          right={<Pill T={T} dot color={allGo ? T.accent : T.danger} glow={allGo}>
            {allGo ? "GO FOR LAUNCH" : "NO-GO"}
          </Pill>}>
          {checks.map((c, i) => {
            const color = c.status === "GO" ? T.accent : c.status === "OVRD" ? T.warn : T.danger;
            return (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: SPACE.s3,
                padding: `${SPACE.s2}px 0`,
                borderBottom: i < checks.length - 1 ? "1px solid " + T.border : "none",
              }}>
                <span style={{
                  fontFamily: FONT.mono, fontSize: TYPE.data, fontWeight: 700,
                  color, minWidth: 56,
                }}>{c.status}</span>
                <span style={{ flex: 1, fontFamily: FONT.sans, fontSize: TYPE.body, color: T.text }}>
                  {c.label}
                </span>
                {c.status === "NO-GO" && (
                  <Btn T={T} kind="danger" size="sm" mono>OVERRIDE</Btn>
                )}
              </div>
            );
          })}
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s3 }}>
          <Panel T={T} title="TERMINAL COUNT" right={<Cap T={T}>HOLDABLE</Cap>}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: `${SPACE.s4}px 0` }}>
              <div style={{
                fontFamily: FONT.mono, fontSize: 72, fontWeight: 700,
                fontVariantNumeric: "tabular-nums", color: T.accent,
                letterSpacing: 4, lineHeight: 1,
                textShadow: T.name === "dark" ? "0 0 30px " + T.accent + "55" : "none",
              }}>T-00:08</div>
              <Cap T={T}>VOICE CALLOUTS · ON</Cap>
              <div style={{ display: "flex", gap: SPACE.s2, marginTop: SPACE.s3 }}>
                <Btn T={T} kind="primary" size="md" mono>HOLD</Btn>
                <Btn T={T} kind="secondary" size="md" mono>ABORT</Btn>
              </div>
            </div>
          </Panel>
          <Panel T={T} title="FSM TIMELINE">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              {["PAD", "BOOST", "COAST", "APOGEE", "DROGUE", "MAIN", "LANDED"].map((s, i) => {
                const passed = i === 0;
                const current = i === 0;
                const c = passed ? T.accent : current ? T.accent : T.faint;
                return (
                  <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: c,
                      boxShadow: current ? T.glowSoft(c) : "none",
                      animation: current ? "pulse 1.6s infinite" : "none",
                    }} />
                    <span style={{
                      fontFamily: FONT.mono, fontSize: 9, marginTop: 4,
                      color: c, letterSpacing: 0.6,
                    }}>{s}</span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </Section>
  );
}

function TrackSection({ T }) {
  const alt = useTrace(7.0, 100, 0.10, 800, 1200);
  const vel = useTrace(8.7, 100, 0.16,  90,   60);
  return (
    <Section T={T}
      eyebrow="TRACK · DOWNRANGE"
      title="Radar, attitude & live graphs"
      hint="The visual headliner of the new language. Mini canvases reuse the same primitives as the production RadarScope and RocketCanvas, recolored to the obsidian/pearl palette."
      tuning="radar sweep saturation · 3D rocket stroke weight"
    >
      <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: SPACE.s3 }}>
        <Panel T={T} title="GPS · DELTA SCOPE">
          <MiniRadar T={T} size={220} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.s2, marginTop: SPACE.s2 }}>
            <div><Cap T={T}>RANGE</Cap><span style={{ fontFamily: FONT.mono, fontSize: TYPE.data, color: T.accent, fontWeight: 700 }}>0.42 km</span></div>
            <div><Cap T={T}>BEARING</Cap><span style={{ fontFamily: FONT.mono, fontSize: TYPE.data, color: T.accent, fontWeight: 700 }}>035°</span></div>
          </div>
        </Panel>
        <Panel T={T} title="ATTITUDE · QUAT">
          <MiniRocket T={T} size={220} />
        </Panel>
        <div style={{ display: "grid", gridTemplateRows: "1fr 1fr", gap: SPACE.s3 }}>
          <Sparkline T={T} data={alt} color={T.accent}  label="ALTITUDE"  unit="m"   h={90} />
          <Sparkline T={T} data={vel} color={T.accent2} label="VELOCITY"  unit="m/s" h={90} />
        </div>
      </div>
    </Section>
  );
}

function PrimitivesSection({ T }) {
  const [toggleOn, setToggleOn] = useState(true);
  const [seg, setSeg] = useState("hr");
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const showToast = () => {
    setToast({ msg: "Config uploaded · 2.4 KB · CRC 0xA9F3" });
    setTimeout(() => setToast(null), 3500);
  };
  return (
    <Section T={T}
      eyebrow="PRIMITIVES · KIT"
      title="Buttons, inputs, states"
      hint="The atomic kit that every other section is built from. If something here looks wrong, the rest of the app will too."
      tuning="button corner radius · focus ring saturation"
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.s3 }}>
        <Panel T={T} title="BUTTONS · HIERARCHY">
          <div style={{ display: "flex", flexWrap: "wrap", gap: SPACE.s2 }}>
            <Btn T={T} kind="primary" mono>UPLOAD TO FC</Btn>
            <Btn T={T} kind="accent" mono>ARM</Btn>
            <Btn T={T} kind="secondary" mono>DEFAULTS</Btn>
            <Btn T={T} kind="danger" mono>ABORT</Btn>
            <Btn T={T} kind="ghost" mono>CANCEL</Btn>
            <Btn T={T} kind="primary" mono disabled>DISABLED</Btn>
          </div>
          <div style={{ marginTop: SPACE.s3, display: "flex", gap: SPACE.s2 }}>
            <Btn T={T} kind="secondary" size="sm" mono>SM</Btn>
            <Btn T={T} kind="secondary" size="md" mono>MD</Btn>
            <Btn T={T} kind="secondary" size="lg" mono>LG</Btn>
          </div>
        </Panel>

        <Panel T={T} title="INPUTS · FORMS">
          <Cap T={T}>Threshold (m AGL)</Cap>
          <input defaultValue="300" style={{
            width: "100%", marginTop: 4,
            background: T.bgEl, border: "1px solid " + T.border, borderRadius: RADIUS.sm,
            color: T.strong, fontFamily: FONT.mono, fontSize: TYPE.body, fontWeight: 600,
            padding: "8px 10px", outline: "none",
          }} onFocus={(e) => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = "0 0 0 3px " + T.accentRing; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }} />
          <div style={{ display: "flex", gap: SPACE.s3, marginTop: SPACE.s3, alignItems: "center" }}>
            <Cap T={T}>Voice callouts</Cap>
            <button onClick={() => setToggleOn((v) => !v)} style={{
              width: 44, height: 22, borderRadius: 11,
              background: toggleOn ? T.accent : T.bgEl,
              border: "1px solid " + (toggleOn ? T.accent : T.border),
              cursor: "pointer", padding: 1, position: "relative",
              transition: "all 160ms ease",
            }}>
              <span style={{
                position: "absolute", top: 2, left: toggleOn ? 24 : 2,
                width: 16, height: 16, borderRadius: "50%",
                background: toggleOn ? T.armedText : T.muted,
                transition: "left 160ms ease",
              }} />
            </button>
          </div>
          <div style={{ display: "flex", marginTop: SPACE.s3, border: "1px solid " + T.border, borderRadius: RADIUS.sm, overflow: "hidden" }}>
            {[["hr", "HR"], ["lr", "LR"], ["sum", "SUM"]].map(([id, label], i) => (
              <button key={id} onClick={() => setSeg(id)} style={{
                flex: 1, padding: "6px 0",
                fontFamily: FONT.mono, fontSize: TYPE.cap, fontWeight: 700, letterSpacing: 1,
                background: seg === id ? T.accent : "transparent",
                color: seg === id ? T.armedText : T.muted,
                border: "none", borderRight: i < 2 ? "1px solid " + T.border : "none",
                cursor: "pointer", transition: "all 160ms ease",
              }}>{label}</button>
            ))}
          </div>
        </Panel>

        <Panel T={T} title="EMPTY · LOADING · ERROR">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.s3 }}>
            <div style={{ padding: SPACE.s4, textAlign: "center", border: "1px dashed " + T.border, borderRadius: RADIUS.md }}>
              <div style={{ fontSize: 28, color: T.faint }}>◇</div>
              <Cap T={T}>NO DATA YET</Cap>
              <div style={{ fontFamily: FONT.mono, fontSize: TYPE.micro, color: T.muted, marginTop: 4 }}>
                Connect FC to begin readout.
              </div>
            </div>
            <div>
              <div style={{ height: 12, background: T.bgEl, borderRadius: RADIUS.sm, marginBottom: 6, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: "40%",
                  background: `linear-gradient(90deg, transparent 0%, ${T.accent}66 50%, transparent 100%)`,
                  animation: "stripeMove 1.4s linear infinite",
                }} />
              </div>
              <div style={{ height: 12, width: "82%", background: T.bgEl, borderRadius: RADIUS.sm, marginBottom: 6 }} />
              <div style={{ height: 12, width: "63%", background: T.bgEl, borderRadius: RADIUS.sm }} />
              <Cap T={T}>SKELETON</Cap>
            </div>
          </div>
          <div style={{
            marginTop: SPACE.s3, padding: "8px 12px",
            background: T.dangerBg, border: "1px solid " + T.danger, borderRadius: RADIUS.md,
          }}>
            <span style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.danger, fontWeight: 600 }}>
              ✕ CRC mismatch · frame 0x2840 · retransmit requested
            </span>
          </div>
        </Panel>

        <Panel T={T} title="MODAL · TOAST">
          <Btn T={T} kind="secondary" mono onClick={() => setModalOpen(true)}>OPEN MODAL</Btn>
          <span style={{ marginLeft: SPACE.s2 }} />
          <Btn T={T} kind="primary" mono onClick={showToast}>FIRE TOAST</Btn>
          {modalOpen && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 20,
              background: T.name === "dark" ? "rgba(4,6,10,0.7)" : "rgba(15,23,42,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(4px)",
            }} onClick={() => setModalOpen(false)}>
              <div onClick={(e) => e.stopPropagation()} style={{
                width: 380, padding: SPACE.s5,
                background: T.bgPanel, border: "1px solid " + T.border, borderRadius: RADIUS.md,
                boxShadow: T.shadow,
              }}>
                <Cap T={T} color={T.accent}>CONFIRM</Cap>
                <h3 style={{ fontFamily: FONT.sans, fontSize: TYPE.title, fontWeight: 600, color: T.strong, margin: 0, marginTop: 4 }}>
                  Erase flight log?
                </h3>
                <p style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, marginTop: SPACE.s2, lineHeight: 1.55 }}>
                  This permanently zeroes the W25Q512JV flash. The action cannot be undone — and the FC must be re-armed before next flight.
                </p>
                <div style={{ display: "flex", gap: SPACE.s2, marginTop: SPACE.s4, justifyContent: "flex-end" }}>
                  <Btn T={T} kind="ghost" mono onClick={() => setModalOpen(false)}>CANCEL</Btn>
                  <Btn T={T} kind="danger" mono>ERASE</Btn>
                </div>
              </div>
            </div>
          )}
        </Panel>
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 30,
          padding: "10px 14px",
          background: T.bgPanel, border: "1px solid " + T.accentRing, borderRadius: RADIUS.md,
          boxShadow: T.shadow,
          display: "flex", alignItems: "center", gap: SPACE.s2,
          animation: "fadeUp 220ms ease-out",
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, boxShadow: T.glowSoft(T.accent) }} />
          <span style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.text }}>{toast.msg}</span>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------------------

export default function LabTab() {
  const [mode, setMode] = useState("dark");
  const [quiet, setQuiet] = useState(false);
  const T = TOKENS[mode];

  const css = useMemo(() => `
    .lab-scope ::-webkit-scrollbar{width:6px}
    .lab-scope ::-webkit-scrollbar-track{background:transparent}
    .lab-scope ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
    .lab-scope button:focus-visible{outline:none;box-shadow:0 0 0 2px ${T.accentRing}}
  `, [T]);

  return (
    <div className="lab-scope" style={{
      animation: "fadeUp 0.18s ease-out",
      minHeight: "100%",
      padding: SPACE.s4,
      background: T.bg,
      color: T.text,
      fontFamily: FONT.sans,
      // Bleed full width over the parent's padding so the hero feels cinematic.
      margin: -14, paddingTop: 14,
    }}>
      <style>{css}</style>

      <div style={{ maxWidth: 1480, margin: "0 auto", padding: `0 ${SPACE.s2}px` }}>
        {/* Page header — the ONLY meta UI for the LAB tab itself. */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: `${SPACE.s3}px 0`,
          marginBottom: SPACE.s3,
        }}>
          <div>
            <Cap T={T} color={T.accent}>DESIGN TASTER · v1</Cap>
            <p style={{
              fontFamily: FONT.mono, fontSize: TYPE.micro, color: T.muted,
              margin: 0, marginTop: 4, maxWidth: 720,
            }}>
              Single-page sample of the proposed visual language. All widgets here are decoupled from production telemetry.
              Tell me what to tune (palette · type · density · motion) and I'll iterate before touching the live tabs.
            </p>
          </div>
          <div style={{ display: "flex", gap: SPACE.s2 }}>
            <Btn T={T} kind="secondary" size="sm" mono onClick={() => setQuiet((q) => !q)}>
              {quiet ? "▶ MOTION" : "❚❚ QUIET"}
            </Btn>
            <Btn T={T} kind="secondary" size="sm" mono onClick={() => setMode((m) => (m === "dark" ? "light" : "dark"))}>
              {mode === "dark" ? "☼ LIGHT" : "☽ DARK"}
            </Btn>
          </div>
        </div>

        <Section T={T}
          eyebrow="HERO · LANGUAGE"
          title="The mark, the count, and the link"
          hint="Editorial NEVERA wordmark, IBM Plex Mono mission-elapsed clock, link/CAC/FSM pills, behind a subtle WebGL liquid-metal canvas. The shader pauses on QUIET or under prefers-reduced-motion."
          tuning="display tracking · shader saturation · MET clock weight"
        >
          <HeroStrip T={T} mode={mode} setMode={setMode} quiet={quiet} setQuiet={setQuiet} />
        </Section>

        <Section T={T}
          eyebrow="CHROME · NAVIGATION"
          title="Sidebar tab rail"
          hint="The persistent vertical rail. Compare against the existing one rendered at App.jsx:1063 by switching to any other tab."
          tuning="rail width · active state weight · letter tracking"
        >
          <ChromeSample T={T} />
        </Section>

        <SetupSection T={T} />
        <TestSection T={T} />
        <FlightSection T={T} />
        <TrackSection T={T} />
        <PrimitivesSection T={T} />

        <footer style={{
          padding: `${SPACE.s5}px 0`,
          borderTop: "1px dashed " + T.border,
          marginTop: SPACE.s7,
          textAlign: "center",
        }}>
          <Cap T={T}>END · OF TASTER</Cap>
          <p style={{
            fontFamily: FONT.mono, fontSize: TYPE.micro, color: T.muted,
            marginTop: 6, maxWidth: 640, marginInline: "auto", lineHeight: 1.6,
          }}>
            After your feedback, the next pass promotes <code style={{ color: T.accent }}>lab-tokens.js</code> to the global theme,
            replaces the existing <code style={{ color: T.accent }}>themes</code> object at App.jsx:12, then propagates the language
            into SETUP → TEST → TRACK → FLIGHT (FLIGHT last, so launch ergonomics are most-tested).
          </p>
        </footer>
      </div>
    </div>
  );
}
