// CASPER 2 — Instrument widgets: Radar, 3D Rocket, Gauge dial, Compass.

import { useEffect, useRef } from "react";
import { FONT, SCHEME_PROPS } from "./tokens.js";

const _colorCache = new Map();
const _toRGBA = (color, alpha) => {
  const key = color + ":" + alpha;
  if (_colorCache.has(key)) return _colorCache.get(key);
  const div = document.createElement("div");
  div.style.color = color;
  document.body.appendChild(div);
  const cs = getComputedStyle(div).color;
  document.body.removeChild(div);
  const m = cs.match(/rgba?\(([^)]+)\)/);
  let out = color;
  if (m) {
    const p = m[1].split(",").map(s => s.trim());
    out = `rgba(${p[0]},${p[1]},${p[2]},${alpha})`;
  }
  _colorCache.set(key, out);
  return out;
};

export function Radar({ T, size = 240, rocketBrg = 35, rocketRng = 0.62, padBrg = 305, padRng = 0.78, motion = true, scheme }) {
  const ref = useRef(null);
  const sk = SCHEME_PROPS[scheme || T.scheme || "obsidian"];
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    let raf, sweep = 0;
    const draw = () => {
      sweep = (sweep + (motion ? 0.012 : 0)) % (Math.PI * 2);
      ctx.clearRect(0, 0, size, size);
      const r = size / 2 - 12;
      const cx = size / 2, cy = size / 2;

      ctx.strokeStyle = T.border;
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (r * i) / 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = T.gridLine;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
      ctx.stroke();

      ctx.fillStyle = T.muted;
      ctx.font = `10px ${FONT.mono}`;
      ctx.textAlign = "center";
      ctx.fillText("N", cx, cy - r - 2);
      ctx.fillText("S", cx, cy + r + 10);
      ctx.fillText("W", cx - r - 6, cy + 4);
      ctx.fillText("E", cx + r + 6, cy + 4);

      if (motion && ctx.createConicGradient) {
        const grad = ctx.createConicGradient(sweep - Math.PI / 2, cx, cy);
        grad.addColorStop(0, _toRGBA(T.accent, 0.000));
        grad.addColorStop(0.18, _toRGBA(T.accent, sk.showGlow ? 0.33 : 0.20));
        grad.addColorStop(0.20, _toRGBA(T.accent, 0.000));
        grad.addColorStop(1, _toRGBA(T.accent, 0.000));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      }

      const drawBlip = (brg, rng, color, label, pulse) => {
        const ang = (brg * Math.PI) / 180 - Math.PI / 2;
        const x = cx + Math.cos(ang) * r * rng;
        const y = cy + Math.sin(ang) * r * rng;
        if (pulse && motion) {
          const da = Math.abs(((sweep - (ang + Math.PI / 2) + Math.PI * 2) % (Math.PI * 2)));
          const fade = Math.max(0.4, 1 - da / (Math.PI * 1.3));
          ctx.globalAlpha = fade;
        }
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
        if (sk.showGlow) {
          ctx.globalAlpha = (ctx.globalAlpha || 1) * 0.4;
          ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = T.strong;
        ctx.font = `bold 10px ${FONT.mono}`;
        ctx.textAlign = "left";
        ctx.fillText(label, x + 9, y - 7);
      };
      drawBlip(rocketBrg, rocketRng, T.accent, "FC", true);
      drawBlip(padBrg, padRng, T.muted, "PAD", false);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [T, size, rocketBrg, rocketRng, padBrg, padRng, motion, sk.showGlow]);
  return <canvas ref={ref} style={{ width: size, height: size, display: "block" }} />;
}

export function Rocket3D({ T, size = 240, quat, motion = true, scheme }) {
  const ref = useRef(null);
  const sk = SCHEME_PROPS[scheme || T.scheme || "obsidian"];
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = size * dpr; c.height = size * dpr;
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);

    const verts = [
      [-0.16, -0.85, 0.16],  [0.16, -0.85, 0.16],
      [-0.16, -0.85,-0.16],  [0.16, -0.85,-0.16],
      [-0.16,  0.45, 0.16],  [0.16,  0.45, 0.16],
      [-0.16,  0.45,-0.16],  [0.16,  0.45,-0.16],
      [ 0.00, -1.10, 0.00],
      [-0.40,  0.78, 0.00],  [0.40, 0.78, 0.00],
      [ 0.00,  0.78,-0.40],  [0.00, 0.78, 0.40],
    ];
    const edges = [
      [0,1],[1,3],[3,2],[2,0],
      [4,5],[5,7],[7,6],[6,4],
      [0,4],[1,5],[2,6],[3,7],
      [0,8],[1,8],[2,8],[3,8],
      [4,9],[6,9],[5,10],[7,10],
      [6,11],[7,11],[4,12],[5,12],
    ];

    let raf;
    const draw = (now) => {
      const t = now / 1000;
      const roll  = quat ? quat.roll  : Math.sin(t * 0.6) * 0.35;
      const pitch = quat ? quat.pitch : Math.sin(t * 0.4 + 1.0) * 0.20;
      const yaw   = quat ? quat.yaw   : Math.sin(t * 0.3 + 0.5) * 0.30;
      const cr = Math.cos(roll),  sr = Math.sin(roll);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const cy = Math.cos(yaw),   sy = Math.sin(yaw);

      ctx.clearRect(0, 0, size, size);
      const cx = size / 2, cyc = size / 2;
      const scale = size * 0.30;

      ctx.strokeStyle = T.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cyc, scale * 1.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = T.gridLine;
      ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(cx - scale * 1.4, cyc); ctx.lineTo(cx + scale * 1.4, cyc); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cyc - scale * 1.4); ctx.lineTo(cx, cyc + scale * 1.4); ctx.stroke();
      ctx.setLineDash([]);

      const proj = verts.map(([x, y, z]) => {
        let X = x, Y = y, Z = z;
        let nx = X * cy - Y * sy; let ny = X * sy + Y * cy; X = nx; Y = ny;
        let nY = Y * cp - Z * sp; let nZ = Y * sp + Z * cp; Y = nY; Z = nZ;
        let nX = X * cr + Z * sr; nZ = -X * sr + Z * cr; X = nX; Z = nZ;
        return [cx + X * scale, cyc + Y * scale, Z];
      });

      ctx.lineWidth = 1.7;
      ctx.strokeStyle = T.accent;
      if (sk.showGlow) {
        ctx.shadowColor = T.accent;
        ctx.shadowBlur  = T.name === "dark" ? 6 : 0;
      }
      for (const [a, b] of edges) {
        ctx.beginPath();
        ctx.moveTo(proj[a][0], proj[a][1]);
        ctx.lineTo(proj[b][0], proj[b][1]);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      ctx.fillStyle = T.muted;
      ctx.font = `10px ${FONT.mono}`;
      ctx.textAlign = "left";
      ctx.fillText("ROL " + (roll  * 57.296).toFixed(1).padStart(6, " ") + "°", 8, size - 28);
      ctx.fillText("PIT " + (pitch * 57.296).toFixed(1).padStart(6, " ") + "°", 8, size - 16);
      ctx.fillText("YAW " + (yaw   * 57.296).toFixed(1).padStart(6, " ") + "°", 8, size - 4);
      if (motion) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => raf && cancelAnimationFrame(raf);
  }, [T, size, quat, motion, sk.showGlow]);
  return <canvas ref={ref} style={{ width: size, height: size, display: "block" }} />;
}

export function Dial({ T, size = 200, value, min = 0, max = 100, label, unit, color, format, ticks = 10 }) {
  const c = color || T.accent;
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const startAng = -225;
  const endAng = 45;
  const sweep = endAng - startAng;
  const valAng = startAng + sweep * ratio;
  const r = size / 2 - 12;
  const cx = size / 2, cy = size / 2;
  const polar = (ang, rad) => {
    const a = (ang * Math.PI) / 180;
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
  };
  const arc = (start, end, rad) => {
    const [x1, y1] = polar(start, rad);
    const [x2, y2] = polar(end, rad);
    const large = end - start > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${rad} ${rad} 0 ${large} 1 ${x2} ${y2}`;
  };
  const tickArr = Array.from({ length: ticks + 1 }, (_, i) => i / ticks);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size}>
        <path d={arc(startAng, endAng, r)} stroke={T.gridLine} strokeWidth="2" fill="none" strokeLinecap="round"/>
        <path d={arc(startAng, valAng, r)} stroke={c} strokeWidth="3" fill="none" strokeLinecap="round"
          style={T.scheme !== "terminal" ? { filter: `drop-shadow(0 0 4px ${c})` } : {}}/>
        {tickArr.map((tk, i) => {
          const ang = startAng + sweep * tk;
          const [x1, y1] = polar(ang, r - 4);
          const [x2, y2] = polar(ang, r - (i % 2 === 0 ? 12 : 7));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.muted} strokeWidth={i % 2 === 0 ? 1.2 : 0.6}/>;
        })}
        {(() => {
          const [px, py] = polar(valAng, r - 18);
          return <>
            <line x1={cx} y1={cy} x2={px} y2={py} stroke={c} strokeWidth="2" strokeLinecap="round"/>
            <circle cx={cx} cy={cy} r="4" fill={c}/>
          </>;
        })()}
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", pointerEvents: "none",
        paddingTop: size * 0.15,
      }}>
        <div style={{
          fontFamily: FONT.mono, fontSize: size * 0.18, fontWeight: 700,
          fontVariantNumeric: "tabular-nums", color: T.strong, lineHeight: 1,
        }}>{format ? format(value) : value.toFixed(1)}</div>
        <div style={{
          fontFamily: FONT.mono, fontSize: size * 0.07, color: T.muted, marginTop: 2,
        }}>{unit}</div>
        <div style={{
          fontFamily: FONT.cond, fontSize: size * 0.07, color: T.muted,
          letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginTop: 4,
        }}>{label}</div>
      </div>
    </div>
  );
}

export function LiquidShader({ T, motion = true }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    let raf;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const r = c.getBoundingClientRect();
      c.width = r.width * dpr; c.height = r.height * dpr;
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(c);
    const ctx = c.getContext("2d");

    const colors = T.shader || [T.bg, T.accent, T.bg];
    let t = 0;
    const draw = () => {
      const w = c.width, h = c.height;
      ctx.clearRect(0, 0, w, h);
      const blobs = [
        { x: 0.3 + Math.sin(t * 0.0006) * 0.18, y: 0.4 + Math.cos(t * 0.0008) * 0.20, r: 0.7, c: colors[1] },
        { x: 0.7 + Math.cos(t * 0.0005) * 0.16, y: 0.3 + Math.sin(t * 0.0007) * 0.18, r: 0.55, c: colors[2] },
        { x: 0.5 + Math.sin(t * 0.0004) * 0.20, y: 0.7 + Math.cos(t * 0.0009) * 0.14, r: 0.6, c: colors[1] },
      ];
      ctx.fillStyle = colors[0];
      ctx.fillRect(0, 0, w, h);
      blobs.forEach((b) => {
        const cx = b.x * w, cy = b.y * h, rr = b.r * Math.max(w, h);
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
        grad.addColorStop(0, _toRGBA(b.c, T.name === "dark" ? 0.33 : 0.27));
        grad.addColorStop(1, _toRGBA(b.c, 0.000));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      });
      if (motion) {
        t += 16;
        raf = requestAnimationFrame(draw);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { obs.disconnect(); raf && cancelAnimationFrame(raf); };
  }, [T, motion]);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}
