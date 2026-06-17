// CASPER 2 — Shared component primitives.

import { TYPE, SPACE, RADIUS, FONT, TRACK, SCHEME_PROPS } from "./tokens.js";
import Icon from "./icons.jsx";

// Cap — small all-caps eyebrow label
export function Cap({ T, children, color, size = TYPE.cap, style }) {
  return (
    <div style={{
      fontFamily: FONT.cond, fontSize: size, fontWeight: 700,
      color: color || T.muted, letterSpacing: TRACK.cap,
      textTransform: "uppercase", lineHeight: 1.2,
      ...style,
    }}>{children}</div>
  );
}

// Pill — status pill with optional dot/glow
export function Pill({ T, dot, color, children, glow, size = "md", style }) {
  const c = color || T.muted;
  const sz = size === "sm" ? { fs: 10, py: 2, px: 7, dot: 5 } : { fs: 11, py: 4, px: 9, dot: 6 };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: `${sz.py}px ${sz.px}px`,
      borderRadius: RADIUS.pill,
      border: "1px solid " + T.border,
      background: T.bgEl,
      fontFamily: FONT.mono, fontSize: sz.fs, fontWeight: 600,
      color: c, letterSpacing: 0.4,
      lineHeight: 1.2,
      ...style,
    }}>
      {dot && <span style={{
        width: sz.dot, height: sz.dot, borderRadius: "50%",
        background: c,
        boxShadow: glow ? T.glow(c) : "none",
        flexShrink: 0,
      }} />}
      {children}
    </span>
  );
}

// Panel — main surface; varies by scheme
export function Panel({ T, title, right, children, padded = true, accentColor, style, glass, fullPad, scheme }) {
  const sk = SCHEME_PROPS[scheme || T.scheme || "obsidian"];
  const isGlass = glass !== undefined ? glass : sk.panelStyle === "glass";
  const isHairline = sk.panelStyle === "hairline";
  const isBlueprint = sk.panelStyle === "blueprint";

  const borderColor = accentColor ? T.accentRing : T.border;
  const bgColor = isGlass ? T.glassBg : T.bgPanel;

  const blueprintBg = isBlueprint
    ? { backgroundImage: `linear-gradient(${T.gridLine} 1px, transparent 1px), linear-gradient(90deg, ${T.gridLine} 1px, transparent 1px)`,
        backgroundSize: "16px 16px",
        backgroundPosition: "-1px -1px" }
    : {};

  return (
    <div style={{
      background: bgColor,
      backdropFilter: isGlass ? T.glassBlur : undefined,
      WebkitBackdropFilter: isGlass ? T.glassBlur : undefined,
      border: `1px solid ${borderColor}`,
      borderRadius: sk.panelRadius,
      boxShadow: isGlass ? T.shadow : T.shadowSoft,
      overflow: "hidden",
      ...style,
    }}>
      {(title !== undefined || right !== undefined) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: SPACE.s2,
          padding: `${SPACE.s2}px ${SPACE.s4}px`,
          borderBottom: `1px solid ${T.border}`,
          background: isHairline ? "transparent" : T.bgEl,
          minHeight: 36,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: SPACE.s2, minWidth: 0 }}>
            {typeof title === "string" ? <Cap T={T}>{title}</Cap> : title}
          </div>
          {right !== undefined && <div style={{ display: "flex", alignItems: "center", gap: SPACE.s2 }}>{right}</div>}
        </div>
      )}
      <div style={{ padding: padded ? (fullPad ? SPACE.s5 : SPACE.s4) : 0, ...blueprintBg }}>{children}</div>
    </div>
  );
}

// Btn — variants: primary / secondary / ghost / danger / accent / dangerSolid / warn
export function Btn({ T, kind = "secondary", disabled, onClick, children, full, size = "md", icon, mono = true, style }) {
  const sizes = {
    xs: { fs: 11, px: 10, py: 4 },
    sm: { fs: 12, px: 12, py: 6 },
    md: { fs: 13, px: 16, py: 9 },
    lg: { fs: 15, px: 22, py: 12 },
    xl: { fs: 18, px: 28, py: 16 },
  };
  const sz = sizes[size];
  const base = {
    fontFamily: mono ? FONT.mono : FONT.cond,
    fontSize: sz.fs,
    fontWeight: 700,
    letterSpacing: mono ? 0.5 : TRACK.caps,
    textTransform: mono ? "none" : "uppercase",
    padding: `${sz.py}px ${sz.px}px`,
    borderRadius: RADIUS.sm,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    transition: "all 160ms ease",
    width: full ? "100%" : undefined,
    border: "1px solid transparent",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
    whiteSpace: "nowrap",
    lineHeight: 1.1,
  };
  const variants = {
    primary:    { background: T.accent, color: T.accentText, border: `1px solid ${T.accent}`, boxShadow: T.glowSoft(T.accent) },
    secondary:  { background: T.bgEl, color: T.text, border: `1px solid ${T.border}` },
    ghost:      { background: "transparent", color: T.muted, border: "1px solid transparent" },
    danger:     { background: T.dangerBg, color: T.danger, border: `1px solid ${T.danger}` },
    dangerSolid:{ background: T.danger, color: "#fff", border: `1px solid ${T.danger}`, boxShadow: T.glowSoft(T.danger) },
    accent:     { background: T.accentBg, color: T.accent, border: `1px solid ${T.accentRing}` },
    warn:       { background: T.warnBg, color: T.warn, border: `1px solid ${T.warn}` },
  };
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
      style={{ ...base, ...variants[kind], ...style }}>
      {icon && <Icon name={icon} size={sz.fs + 1} />}
      {children}
    </button>
  );
}

// StatTile — big number + caption
export function StatTile({ T, label, value, unit, color, accent, sub, large, style }) {
  const c = color || T.strong;
  return (
    <div style={{
      padding: `${SPACE.s3}px ${SPACE.s4}px`,
      background: accent ? T.accentBg : T.bgHi,
      border: "1px solid " + (accent ? T.accentRing : T.border),
      borderRadius: RADIUS.md,
      ...style,
    }}>
      <Cap T={T}>{label}</Cap>
      <div style={{
        fontFamily: FONT.mono, fontSize: large ? TYPE.dataLg : TYPE.data, fontWeight: 700,
        fontVariantNumeric: "tabular-nums", color: c, letterSpacing: -0.5,
        marginTop: 4, lineHeight: 1.05,
      }}>
        {value}
        {unit && <span style={{
          fontSize: TYPE.body, fontWeight: 500, color: T.muted, marginLeft: 5,
        }}>{unit}</span>}
      </div>
      {sub && <div style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{sub}</div>}
    </div>
  );
}

// Sparkline — area chart
export function Sparkline({ T, data, color, h = 80, label, unit, value, scheme, showGrid = true }) {
  const sk = SCHEME_PROPS[scheme || T.scheme || "obsidian"];
  if (!data || data.length < 2) return (
    <div style={{ height: h, display:"flex", alignItems:"center", justifyContent:"center", color: T.faint, fontFamily: FONT.mono, fontSize: TYPE.cap }}>
      AWAITING DATA
    </div>
  );
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const pad = 6;
  const c = color || T.accent;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${pad + ((max - v) / range) * (h - pad * 2)}`).join(" ");
  const id = "sl-" + Math.random().toString(36).slice(2, 8);
  const last = value !== undefined ? value : data[data.length - 1];

  return (
    <div style={{ position:"relative", width:"100%" }}>
      {(label || last !== undefined) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          {label && <Cap T={T}>{label}</Cap>}
          <span style={{
            fontFamily: FONT.mono, fontSize: TYPE.body, fontWeight: 700,
            fontVariantNumeric: "tabular-nums", color: c,
          }}>
            {typeof last === "number" ? last.toFixed(1) : last}
            {unit && <span style={{ color: T.muted, fontSize: TYPE.cap, fontWeight: 500, marginLeft: 4 }}>{unit}</span>}
          </span>
        </div>
      )}
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h, display: "block" }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"  stopColor={c} stopOpacity={T.name === "dark" ? 0.32 : 0.18} />
            <stop offset="100%" stopColor={c} stopOpacity={0} />
          </linearGradient>
        </defs>
        {showGrid && [0, 1, 2, 3].map((i) => (
          <line key={i} x1="0" y1={pad + ((h - pad * 2) / 3) * i} x2="100" y2={pad + ((h - pad * 2) / 3) * i}
            stroke={T.gridLine} strokeWidth="0.4" vectorEffect="non-scaling-stroke" strokeDasharray={i === 1.5 ? "0" : "2 3"} />
        ))}
        <polyline points={`0,${h} ${pts} 100,${h}`} fill={`url(#${id})`} />
        <polyline points={pts} fill="none" stroke={c} strokeWidth={sk.showGlow ? 2 : 1.4}
          vectorEffect="non-scaling-stroke" strokeLinejoin="round"
          style={sk.showGlow ? { filter: `drop-shadow(0 0 4px ${c})` } : {}} />
      </svg>
    </div>
  );
}

// Dot — small connection / status indicator
export function Dot({ T, color, size = 8, glow = true, pulse = false }) {
  const c = color || T.muted;
  return <span style={{
    display: "inline-block",
    width: size, height: size, borderRadius: "50%",
    background: c,
    boxShadow: glow ? T.glow(c) : "none",
    animation: pulse ? "cmcPulse 1.6s infinite" : "none",
    flexShrink: 0,
  }} />;
}

// Big numeric — display readout
export function BigNum({ T, value, unit, size = TYPE.dataLg, color, mono = true, weight = 700, glow }) {
  const c = color || T.strong;
  return (
    <span style={{
      fontFamily: mono ? FONT.mono : FONT.display,
      fontSize: size,
      fontWeight: weight,
      fontVariantNumeric: "tabular-nums",
      color: c,
      letterSpacing: -0.5,
      lineHeight: 1,
      textShadow: glow ? `0 0 24px ${c}55` : "none",
    }}>
      {value}
      {unit && <span style={{
        fontSize: Math.max(11, size * 0.32), fontWeight: 500, color: T.muted, marginLeft: 6,
        letterSpacing: 0,
      }}>{unit}</span>}
    </span>
  );
}

// Toggle — switch
export function Toggle({ T, on, onChange, label }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: SPACE.s2, cursor: "pointer", userSelect: "none" }}>
      <button onClick={() => onChange(!on)} style={{
        width: 40, height: 20, borderRadius: 10,
        background: on ? T.accent : T.bgEl,
        border: `1px solid ${on ? T.accent : T.border}`,
        cursor: "pointer", padding: 1, position: "relative",
        transition: "all 160ms ease",
      }}>
        <span style={{
          position: "absolute", top: 2, left: on ? 22 : 2,
          width: 14, height: 14, borderRadius: "50%",
          background: on ? T.accentText : T.muted,
          transition: "left 160ms ease",
        }} />
      </button>
      {label && <span style={{ fontFamily: FONT.mono, fontSize: TYPE.body, color: T.text }}>{label}</span>}
    </label>
  );
}
