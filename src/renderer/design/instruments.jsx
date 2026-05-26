import React, { useEffect, useRef, useContext } from 'react';
import { ThemeCtx } from './ThemeContext.jsx';
import { FONT, SCHEME_PROPS, TYPE } from './tokens.js';
import { Cap } from './components.jsx';

// ---------------------------------------------------------------------------
// Internal helper — resolve theme
// ---------------------------------------------------------------------------
function useT(propT) {
  const ctx = useContext(ThemeCtx);
  return propT || (ctx && ctx.theme) || null;
}

// ---------------------------------------------------------------------------
// Color utility — converts oklch / css color → rgba(r,g,b,a) for Canvas use.
// Caches resolutions. Falls back to the raw string on failure.
// ---------------------------------------------------------------------------
const _colorCache = new Map();
function _toRGBA(color, alpha) {
  const key = color + ':' + alpha;
  if (_colorCache.has(key)) return _colorCache.get(key);
  try {
    const div = document.createElement('div');
    div.style.color = color;
    document.body.appendChild(div);
    const cs = getComputedStyle(div).color;
    document.body.removeChild(div);
    const m = cs.match(/rgba?\(([^)]+)\)/);
    let out = color;
    if (m) {
      const p = m[1].split(',').map((s) => s.trim());
      out = `rgba(${p[0]},${p[1]},${p[2]},${alpha})`;
    }
    _colorCache.set(key, out);
    return out;
  } catch {
    return color;
  }
}

// ---------------------------------------------------------------------------
// Radar — sweep with blip and pad pin
// Props (design API):
//   size, rocketBrg, rocketRng, padBrg, padRng, motion, scheme
//
// Extended GPS props (from App.jsx RadarScope):
//   rocketLat, rocketLon, padLat, padLon, connected
// ---------------------------------------------------------------------------
export function Radar({
  T: propT,
  size = 240,
  rocketBrg = 35, rocketRng = 0.62,
  padBrg = 305, padRng = 0.78,
  motion = true, scheme,
  // GPS real-data API (from App.jsx RadarScope)
  rocketLat, rocketLon, padLat, padLon, connected,
}) {
  const T = useT(propT);
  const ref = useRef(null);
  const sk = SCHEME_PROPS[scheme || (T && T.scheme) || 'fusion'];

  useEffect(() => {
    if (!T) return;
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf;
    let sweep = 0;
    const state = { angle: 0, trail: [], lastRecord: 0, maxRSmooth: 100 };

    const draw = () => {
      const cv = c;
      const ctx = cv.getContext('2d');
      const sz = size;
      cv.width = sz * dpr;
      cv.height = sz * dpr;
      ctx.scale(dpr, dpr);
      const r = sz / 2 - 14;
      const cx = sz / 2, cy = sz / 2;

      // ── GPS real-data mode (lat/lon supplied) ──
      const hasGPS = connected && padLat && padLon && rocketLat && rocketLon;
      let dx = 0, dy = 0, dist = 0;
      if (hasGPS) {
        dy = (rocketLat - padLat) * 111320;
        dx = (rocketLon - padLon) * 111320 * Math.cos(padLat * Math.PI / 180);
        dist = Math.sqrt(dx * dx + dy * dy);
      }

      // Dynamic range
      const ranges = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
      let targetR = 100;
      for (let i = 0; i < ranges.length; i++) {
        if (dist < ranges[i] * 0.7) { targetR = ranges[i]; break; }
        if (i === ranges.length - 1) targetR = ranges[i];
      }
      state.maxRSmooth += (targetR - state.maxRSmooth) * 0.02;
      const maxR = state.maxRSmooth;

      // Advance sweep
      state.angle = (state.angle + (motion ? 0.03 : 0)) % (Math.PI * 2);

      // Trail recording (GPS mode)
      const now = Date.now();
      if (hasGPS && dist > 0.1 && now - state.lastRecord > 300) {
        const sa = Math.atan2(dy, dx);
        state.trail.push({ x: dx, y: dy, sa: sa < 0 ? sa + Math.PI * 2 : sa, revAt: -1, br: 0 });
        state.lastRecord = now;
        if (state.trail.length > 120) state.trail.shift();
      }
      // Reveal trail blips when sweep passes
      for (let bi = 0; bi < state.trail.length; bi++) {
        const b = state.trail[bi];
        let ad = state.angle - b.sa;
        while (ad < 0) ad += Math.PI * 2;
        while (ad > Math.PI * 2) ad -= Math.PI * 2;
        if (ad < 0.1) { b.br = 1.0; b.revAt = now; }
        if (b.revAt > 0) b.br = Math.max(0, 1.0 - (now - b.revAt) / 4000);
      }
      state.trail = state.trail.filter((b) => b.revAt < 0 || b.br > 0.01);

      // ── Draw ──
      ctx.clearRect(0, 0, sz, sz);

      // Rings
      ctx.strokeStyle = T.border;
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (r * i) / 4, 0, Math.PI * 2);
        ctx.strokeStyle = i === 4 ? _toRGBA(T.accent, 0.22) : T.border;
        ctx.lineWidth = i === 4 ? 1.2 : 0.5;
        ctx.stroke();
        if (hasGPS) {
          const lbl = maxR * i / 4;
          const ls = lbl >= 1000 ? (lbl / 1000).toFixed(1) + 'km' : lbl < 10 ? lbl.toFixed(1) + 'm' : Math.round(lbl) + 'm';
          ctx.fillStyle = _toRGBA(T.accent, 0.25);
          ctx.font = `8px ${FONT.mono}`;
          ctx.textAlign = 'center';
          ctx.fillText(ls, cx, cy - (r * i / 4) + 10);
        }
      }

      // Crosshair
      ctx.strokeStyle = T.gridLine;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
      ctx.stroke();

      // Bearing labels
      ctx.fillStyle = T.muted;
      ctx.font = `bold 9px ${FONT.mono}`;
      ctx.textAlign = 'center';
      ctx.fillText('N', cx, cy - r + 14);
      ctx.fillText('S', cx, cy + r - 5);
      ctx.textAlign = 'left'; ctx.fillText('E', cx + r - 14, cy + 3);
      ctx.textAlign = 'right'; ctx.fillText('W', cx - r + 14, cy + 3);

      // Sweep cone
      if (motion && ctx.createConicGradient) {
        const grad = ctx.createConicGradient(state.angle - Math.PI / 2, cx, cy);
        grad.addColorStop(0, _toRGBA(T.accent, 0));
        grad.addColorStop(0.18, _toRGBA(T.accent, sk.showGlow ? 0.33 : 0.18));
        grad.addColorStop(0.20, _toRGBA(T.accent, 0));
        grad.addColorStop(1, _toRGBA(T.accent, 0));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      }

      // Sweep line
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(state.angle) * r, cy - Math.sin(state.angle) * r);
      ctx.strokeStyle = _toRGBA(T.accent, 0.55);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // GPS mode — trail blips
      if (hasGPS) {
        for (let j = 0; j < state.trail.length; j++) {
          const tb = state.trail[j];
          if (tb.br < 0.02) continue;
          const bx2 = cx + (tb.x / maxR) * r;
          const by2 = cy - (tb.y / maxR) * r;
          const bd = Math.sqrt((bx2 - cx) ** 2 + (by2 - cy) ** 2);
          if (bd > r) continue;
          ctx.beginPath(); ctx.arc(bx2, by2, 1.5 + tb.br * 2, 0, Math.PI * 2);
          ctx.fillStyle = _toRGBA(T.accent, tb.br * 0.5); ctx.fill();
        }
        // Current rocket position
        if (dist > 0.1) {
          const rx = cx + (dx / maxR) * r;
          const ry = cy - (dy / maxR) * r;
          if (Math.sqrt((rx - cx) ** 2 + (ry - cy) ** 2) <= r) {
            ctx.beginPath(); ctx.arc(rx, ry, 7, 0, Math.PI * 2);
            ctx.fillStyle = _toRGBA(T.accent, 0.12); ctx.fill();
            ctx.beginPath(); ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = T.accent; ctx.fill();
          }
        }
        // Distance / bearing readout
        if (dist > 0.1) {
          const brg = Math.atan2(dx, dy) * 180 / Math.PI;
          const brgN = brg < 0 ? brg + 360 : brg;
          const ds = dist >= 1000 ? (dist / 1000).toFixed(2) + 'km' : dist.toFixed(0) + 'm';
          ctx.fillStyle = _toRGBA(T.accent, 0.65);
          ctx.font = `bold 9px ${FONT.mono}`;
          ctx.textAlign = 'left';
          ctx.fillText(`${ds}  ${brgN.toFixed(0)}°`, 8, sz - 5);
        }
      } else {
        // Bearing-bearing mode (design blips)
        const drawBlip = (brg, rng, color, label, pulse) => {
          const ang = (brg * Math.PI) / 180 - Math.PI / 2;
          const x = cx + Math.cos(ang) * r * rng;
          const y = cy + Math.sin(ang) * r * rng;
          if (pulse && motion) {
            const da = Math.abs((state.angle - (ang + Math.PI / 2) + Math.PI * 2) % (Math.PI * 2));
            ctx.globalAlpha = Math.max(0.4, 1 - da / (Math.PI * 1.3));
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
          ctx.textAlign = 'left';
          ctx.fillText(label, x + 9, y - 7);
        };
        drawBlip(rocketBrg, rocketRng, T.accent, 'FC', true);
        drawBlip(padBrg, padRng, T.muted, 'PAD', false);
      }

      // Center (GS) dot
      ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = T.accent; ctx.fill();

      if (motion) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [T, size, rocketBrg, rocketRng, padBrg, padRng, motion,
      rocketLat, rocketLon, padLat, padLon, connected, sk]);

  return <canvas ref={ref} style={{ width: size, height: size, display: 'block' }} />;
}

// ---------------------------------------------------------------------------
// Rocket3D — wireframe rocket with quaternion attitude
//
// Props (design API): size, quat [w,x,y,z], motion, scheme
// Internally implements the full quaternion rotation from App.jsx RocketCanvas.
// ---------------------------------------------------------------------------
export function Rocket3D({ T: propT, size = 240, quat, motion = true, scheme }) {
  const T = useT(propT);
  const ref = useRef(null);
  const sk = SCHEME_PROPS[scheme || (T && T.scheme) || 'fusion'];

  useEffect(() => {
    if (!T) return;
    const c = ref.current;
    if (!c) return;
    let raf;

    const draw = (now = 0) => {
      const cv = c;
      const ctx = cv.getContext('2d');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cv.clientWidth || size;
      const H = cv.clientHeight || size;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.scale(dpr, dpr);
      const cx = W / 2, cy = H / 2, sc = Math.min(W, H) * 0.30;

      // Resolve quaternion → rotation matrix (body→NED from App.jsx)
      let qw, qx, qy, qz;
      if (quat && quat.length === 4) {
        [qw, qx, qy, qz] = quat;
      } else if (quat && typeof quat === 'object') {
        // {roll, pitch, yaw} in radians (design format)
        const r = quat.roll  || 0;
        const p = quat.pitch || 0;
        const y = quat.yaw   || 0;
        // Euler → quaternion (ZYX)
        const cr = Math.cos(r/2), sr = Math.sin(r/2);
        const cp = Math.cos(p/2), sp = Math.sin(p/2);
        const cy2 = Math.cos(y/2), sy2 = Math.sin(y/2);
        qw = cr*cp*cy2 + sr*sp*sy2;
        qx = sr*cp*cy2 - cr*sp*sy2;
        qy = cr*sp*cy2 + sr*cp*sy2;
        qz = cr*cp*sy2 - sr*sp*cy2;
      } else {
        // Idle animation
        const t = now / 1000;
        const roll  = Math.sin(t * 0.6) * 0.35;
        const pitch = Math.sin(t * 0.4 + 1.0) * 0.20;
        const y2    = Math.sin(t * 0.3 + 0.5) * 0.30;
        const cr = Math.cos(roll/2),  sr = Math.sin(roll/2);
        const cp = Math.cos(pitch/2), sp = Math.sin(pitch/2);
        const cy2 = Math.cos(y2/2),   sy2 = Math.sin(y2/2);
        qw = cr*cp*cy2 + sr*sp*sy2;
        qx = sr*cp*cy2 - cr*sp*sy2;
        qy = cr*sp*cy2 + sr*cp*sy2;
        qz = cr*cp*sy2 - sr*sp*cy2;
      }

      // Rotation matrix (body→NED)
      const r00 = 1-2*(qy*qy+qz*qz), r01 = 2*(qx*qy-qw*qz), r02 = 2*(qx*qz+qw*qy);
      const r10 = 2*(qx*qy+qw*qz),   r11 = 1-2*(qx*qx+qz*qz), r12 = 2*(qy*qz-qw*qx);
      const r20 = 2*(qx*qz-qw*qy),   r21 = 2*(qy*qz+qw*qx),   r22 = 1-2*(qx*qx+qy*qy);

      // Transform: model Y=nose, match App.jsx convention
      const xf = ([x, y, z]) => {
        const bx = x, by = z, bz = -y;
        const nx = r00*bx + r01*by + r02*bz;
        const ny = r10*bx + r11*by + r12*bz;
        const nz = r20*bx + r21*by + r22*bz;
        return [ny, -nz, nx];
      };
      const pj = ([x, y, z]) => {
        const d2 = 5, f = d2 / (d2 - z * 0.3);
        return [cx + x * sc * f, cy - y * sc * f];
      };
      const pt = (v) => pj(xf(v));

      ctx.clearRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = T.gridLine; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.4;
      for (let i = -5; i <= 5; i++) {
        const s = i / 5 * 1.5;
        const a = pt([s, -1.5, -1.5]), b = pt([s, -1.5, 1.5]);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        const c2 = pt([-1.5, -1.5, s]), d2 = pt([1.5, -1.5, s]);
        ctx.beginPath(); ctx.moveTo(c2[0], c2[1]); ctx.lineTo(d2[0], d2[1]); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Axes
      const o = pt([0, 0, 0]);
      [[1.2, 0, 0, '#ff4444'], [0, 1.2, 0, '#44ee66'], [0, 0, 1.2, '#4488ff']].forEach(([ax, ay, az, col]) => {
        const e = pt([ax, ay, az]);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(e[0], e[1]); ctx.stroke();
      });

      // Body
      const br2 = 0.12, segs = 12;
      const ring = (y, rr) => {
        const pts = [];
        for (let ii = 0; ii < segs; ii++) {
          const aa = (ii / segs) * Math.PI * 2;
          pts.push([Math.cos(aa) * rr, y, Math.sin(aa) * rr]);
        }
        return pts;
      };
      const topR = ring(1, br2), botR = ring(-1, br2);
      const bodyCol = T.name === 'dark' ? '#8899bb' : '#556688';

      // Fill
      ctx.fillStyle = bodyCol; ctx.globalAlpha = 0.12; ctx.beginPath();
      topR.forEach((p, ii) => { const q = pt(p); if (ii === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); });
      [...botR].reverse().forEach((p) => { const q = pt(p); ctx.lineTo(q[0], q[1]); });
      ctx.fill(); ctx.globalAlpha = 1;

      // Wireframe rings
      ctx.strokeStyle = bodyCol; ctx.lineWidth = 1;
      [topR, botR].forEach((rr) => {
        ctx.beginPath();
        rr.forEach((p, ii) => { const q = pt(p); if (ii === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); });
        const q0 = pt(rr[0]); ctx.lineTo(q0[0], q0[1]); ctx.stroke();
      });
      for (let ii = 0; ii < segs; ii += 2) {
        const aa = pt(topR[ii]), bb = pt(botR[ii]);
        ctx.beginPath(); ctx.moveTo(aa[0], aa[1]); ctx.lineTo(bb[0], bb[1]); ctx.stroke();
      }

      // Nose cone
      ctx.strokeStyle = T.name === 'dark' ? '#ee5533' : '#cc3311'; ctx.lineWidth = 1.2;
      const nt = pt([0, 1.5, 0]);
      for (let ii = 0; ii < segs; ii += 3) {
        const pp = pt(topR[ii]);
        ctx.beginPath(); ctx.moveTo(nt[0], nt[1]); ctx.lineTo(pp[0], pp[1]); ctx.stroke();
      }

      // Fins
      ctx.strokeStyle = T.name === 'dark' ? '#55bb88' : '#338866'; ctx.lineWidth = 1.5;
      for (let fi = 0; fi < 4; fi++) {
        const fa = (fi / 4) * Math.PI * 2;
        const fco = Math.cos(fa), fsi = Math.sin(fa);
        const f1 = pt([fco * br2, -0.6, fsi * br2]);
        const f2 = pt([fco * 0.35, -1.1, fsi * 0.35]);
        const f3 = pt([fco * br2, -1.1, fsi * br2]);
        ctx.beginPath(); ctx.moveTo(f1[0], f1[1]); ctx.lineTo(f2[0], f2[1]);
        ctx.lineTo(f3[0], f3[1]); ctx.closePath(); ctx.stroke();
      }

      // Euler angle HUD
      const R2D = 180 / Math.PI;
      const euler_x = Math.atan2(2*(qw*qx+qy*qz), 1-2*(qx*qx+qy*qy)) * R2D;
      const euler_y = Math.asin(Math.max(-1, Math.min(1, 2*(qw*qy-qz*qx)))) * R2D;
      const euler_z = Math.atan2(2*(qw*qz+qx*qy), 1-2*(qy*qy+qz*qz)) * R2D;
      ctx.fillStyle = T.muted;
      ctx.font = `9px ${FONT.mono}`;
      ctx.textAlign = 'left';
      ctx.fillText('Roll  ' + euler_z.toFixed(1) + '°', 8, H - 28);
      ctx.fillText('Pitch ' + euler_y.toFixed(1) + '°', 8, H - 16);
      ctx.fillText('Tilt  ' + euler_x.toFixed(1) + '°', 8, H - 4);

      if (motion) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [T, size, quat, motion, sk]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: size }}>
      <canvas ref={ref} style={{ width: '100%', height: '100%', minHeight: size, display: 'block' }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dial — SVG arc gauge −225° to +45° sweep, center pointer, numeric readout
// ---------------------------------------------------------------------------
export function Dial({ T: propT, size = 200, value = 0, min = 0, max = 100, label, unit, color, format, ticks = 10 }) {
  const T = useT(propT);
  if (!T) return null;
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
  const [px, py] = polar(valAng, r - 18);

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <path d={arc(startAng, endAng, r)} stroke={T.gridLine} strokeWidth="2" fill="none" strokeLinecap="round" />
        <path
          d={arc(startAng, valAng, r)}
          stroke={c} strokeWidth="3" fill="none" strokeLinecap="round"
          style={T.scheme !== 'terminal' ? { filter: `drop-shadow(0 0 4px ${c})` } : {}}
        />
        {tickArr.map((tk, i) => {
          const ang = startAng + sweep * tk;
          const [x1, y1] = polar(ang, r - 4);
          const [x2, y2] = polar(ang, r - (i % 2 === 0 ? 12 : 7));
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={T.muted} strokeWidth={i % 2 === 0 ? 1.2 : 0.6} />
          );
        })}
        <line x1={cx} y1={cy} x2={px} y2={py} stroke={c} strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill={c} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
        paddingTop: size * 0.15,
      }}>
        <div style={{
          fontFamily: FONT.mono, fontSize: size * 0.18, fontWeight: 700,
          fontVariantNumeric: 'tabular-nums', color: T.strong, lineHeight: 1,
        }}>
          {format ? format(value) : value.toFixed(1)}
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: size * 0.07, color: T.muted, marginTop: 2 }}>
          {unit}
        </div>
        <div style={{
          fontFamily: FONT.cond, fontSize: size * 0.07, color: T.muted,
          letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700, marginTop: 4,
        }}>
          {label}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LiquidShader — WebGL domain-warped fbm metallic shader
//
// Ported from LiquidMetalCanvas (feat/lab-design-taster) into the instruments
// design system. Reads theme colours from T.shader [deep, accent1, accent2]
// and derives a 4th mid-tone from T.bgEl. Falls back to a Canvas2D gradient
// fill when WebGL is unavailable.
//
// Props: T (theme), motion (bool), intensity (0..1)
// ---------------------------------------------------------------------------

// --- WebGL shader sources ---------------------------------------------------

const _VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const _FRAG = `
precision highp float;
varying vec2 v_uv;
uniform vec2  u_res;
uniform float u_time;
uniform vec3  u_a;         // deep background
uniform vec3  u_b;         // mid tone (bgEl-derived)
uniform vec3  u_c;         // accent 1
uniform vec3  u_d;         // accent 2
uniform float u_grain;     // 0..0.03 film grain amount
uniform float u_intensity; // 0..1 intensity fade

// 2D hash + value noise.
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  vec2 p  = uv * vec2(u_res.x / u_res.y, 1.0) * 1.6;
  float t  = u_time * 0.05;

  // Domain warp — gives the liquid / flowing feel.
  vec2 q = vec2(fbm(p + vec2(0.0, t)),
                fbm(p + vec2(5.2, -t * 1.3)));
  vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + t),
                fbm(p + 4.0 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p + 4.0 * r);

  // Sharpen flow into metallic ridges.
  float ridge = smoothstep(0.40, 0.85, f);
  float flow  = pow(f, 1.6);

  // Color ramp: deep -> mid -> accent1 -> accent2.
  vec3 col = mix(u_a, u_b, smoothstep(0.0, 0.5, flow));
  col = mix(col, u_c, smoothstep(0.45, 0.78, flow) * 0.7);
  col = mix(col, u_d, ridge * 0.85);

  // Specular streak that drifts horizontally.
  float spec = smoothstep(0.86, 1.0, fbm(p * 1.4 + vec2(t * 1.4, 0.0)));
  col += u_d * spec * 0.32;

  // Subtle film grain.
  float g = (hash(uv * u_res + t) - 0.5) * u_grain;
  col += g;

  // Vignette toward edges so the shader sits naturally behind UI chrome.
  float edge = smoothstep(0.95, 0.4, length(uv - 0.5) * 1.4);

  // Intensity fade lets us soften the shader behind dense panels.
  col = mix(u_a, col, u_intensity * edge);

  gl_FragColor = vec4(col, 1.0);
}
`;

// --- Helpers ----------------------------------------------------------------

/** Compile a single WebGL shader. Returns the shader object or throws. */
function _compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('shader compile: ' + log);
  }
  return s;
}

/**
 * Resolve a CSS color string (e.g. oklch(...)) to a [r, g, b] float triple
 * in [0, 1] by reusing the existing _toRGBA helper.
 */
function _cssToVec3(colorStr) {
  // _toRGBA returns "rgba(r,g,b,a)" — parse the r,g,b components.
  const resolved = _toRGBA(colorStr, 1);
  const m = resolved.match(/rgba?\(([^)]+)\)/);
  if (!m) return [0, 0, 0];
  const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
}

// --- Canvas2D fallback (used when WebGL is unavailable) --------------------

function _drawFallback(canvas, colors) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = colors[0];
  ctx.fillRect(0, 0, w, h);
  const grad = ctx.createRadialGradient(w * 0.4, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.7);
  grad.addColorStop(0, _toRGBA(colors[1], 0.28));
  grad.addColorStop(1, _toRGBA(colors[1], 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// --- LiquidShader component -------------------------------------------------

export function LiquidShader({ T: propT, motion = true, intensity = 1 }) {
  const T = useT(propT);
  const ref = useRef(null);

  // --- WebGL init / teardown (runs once on mount) ---------------------------
  useEffect(() => {
    if (!T) return;
    const canvas = ref.current;
    if (!canvas) return;

    // Attempt to acquire a WebGL context.
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, alpha: false });

    if (!gl) {
      // No WebGL — paint a static Canvas2D gradient as fallback.
      canvas.width  = Math.max(1, canvas.clientWidth  | 0);
      canvas.height = Math.max(1, canvas.clientHeight | 0);
      const colors = T.shader || [T.bg, T.accent, T.bg];
      _drawFallback(canvas, colors);
      return;
    }

    // Build shader program.
    let prog;
    try {
      const vs = _compileShader(gl, gl.VERTEX_SHADER,   _VERT);
      const fs = _compileShader(gl, gl.FRAGMENT_SHADER, _FRAG);
      prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('link: ' + gl.getProgramInfoLog(prog));
      }
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    } catch (e) {
      console.warn('[LiquidShader] WebGL program failed:', e);
      return;
    }

    // Upload a full-screen quad (two triangles covering NDC space).
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1,
    ]), gl.STATIC_DRAW);

    const aPos = gl.getAttribLocation(prog, 'a_pos');
    const locs = {
      uRes:       gl.getUniformLocation(prog, 'u_res'),
      uTime:      gl.getUniformLocation(prog, 'u_time'),
      uA:         gl.getUniformLocation(prog, 'u_a'),
      uB:         gl.getUniformLocation(prog, 'u_b'),
      uC:         gl.getUniformLocation(prog, 'u_c'),
      uD:         gl.getUniformLocation(prog, 'u_d'),
      uGrain:     gl.getUniformLocation(prog, 'u_grain'),
      uIntensity: gl.getUniformLocation(prog, 'u_intensity'),
    };

    gl.useProgram(prog);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Store WebGL state on a ref so the animation-loop effect can access it.
    ref.current._wgl = { gl, prog, locs, buf, raf: 0 };

    // ResizeObserver — keeps canvas pixels matched to CSS layout size (dpr-aware).
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const W = Math.max(1, (canvas.clientWidth  * dpr) | 0);
      const H = Math.max(1, (canvas.clientHeight * dpr) | 0);
      if (canvas.width !== W || canvas.height !== H) {
        canvas.width  = W;
        canvas.height = H;
      }
      gl.viewport(0, 0, W, H);
      gl.uniform2f(locs.uRes, W, H);
    };
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      // Cancel any pending animation frame.
      const wgl = ref.current && ref.current._wgl;
      if (wgl) cancelAnimationFrame(wgl.raf);

      ro.disconnect();

      try {
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
      } catch (_) {}

      if (ref.current) ref.current._wgl = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once — theme/motion/intensity handled by the loop effect below

  // --- Animation loop (re-runs when theme, motion, or intensity change) -----
  useEffect(() => {
    if (!T) return;
    const canvas = ref.current;
    if (!canvas) return;

    const wgl = canvas._wgl;

    // Fallback path: if WebGL init didn't succeed, repaint Canvas2D static frame.
    if (!wgl) {
      canvas.width  = Math.max(1, canvas.clientWidth  | 0);
      canvas.height = Math.max(1, canvas.clientHeight | 0);
      const colors = T.shader || [T.bg, T.accent, T.bg];
      _drawFallback(canvas, colors);
      return;
    }

    const { gl, locs } = wgl;
    gl.useProgram(wgl.prog);

    // Resolve theme colours → vec3 float triples.
    const shaderColors = T.shader || [T.bg, T.accent, T.bg];
    const cA = _cssToVec3(shaderColors[0]);              // deep
    // In dark mode T.bgEl is oklch(16% ...) — nearly as black as u_a — so the
    // mid-tone ramp step produces zero visible signal.  Instead blend accent1
    // and accent2 at 50/50 to give the mid zone real chroma.
    const _cC = _cssToVec3(shaderColors[1]);
    const _cD = _cssToVec3(shaderColors[2]);
    const cB = T.name === 'dark'
      ? [(_cC[0] + _cD[0]) * 0.5, (_cC[1] + _cD[1]) * 0.5, (_cC[2] + _cD[2]) * 0.5]
      : _cssToVec3(T.bgEl || shaderColors[0]);           // light mode: keep bgEl (off-white)
    const cC = _cC;                                      // accent1
    const cD = _cD;                                      // accent2

    gl.uniform3f(locs.uA, cA[0], cA[1], cA[2]);
    gl.uniform3f(locs.uB, cB[0], cB[1], cB[2]);
    gl.uniform3f(locs.uC, cC[0], cC[1], cC[2]);
    gl.uniform3f(locs.uD, cD[0], cD[1], cD[2]);
    gl.uniform1f(locs.uGrain, 0.022);
    gl.uniform1f(locs.uIntensity, Math.max(0, Math.min(1, intensity)));

    // Honour prefers-reduced-motion.
    const prefersReduced = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    cancelAnimationFrame(wgl.raf);

    const isFrozen = !motion || prefersReduced;
    const start = performance.now();

    const draw = (now) => {
      const elapsed = (now - start) / 1000;
      gl.uniform1f(locs.uTime, isFrozen ? 0.0 : elapsed);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (!isFrozen) wgl.raf = requestAnimationFrame(draw);
    };
    wgl.raf = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(wgl.raf);
  }, [T, motion, intensity]);

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}

// ---------------------------------------------------------------------------
// RPYGraph — 3-trace overlay: roll / pitch / yaw
// data: [{ roll, pitch, yaw }]  (values in degrees)
// ---------------------------------------------------------------------------
export function RPYGraph({ T: propT, data, h = 120, motion = true }) {
  const T = useT(propT);
  if (!T) return null;

  if (!data || data.length < 2) {
    return (
      <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.faint, fontFamily: FONT.mono, fontSize: TYPE.cap }}>
        AWAITING DATA
      </div>
    );
  }

  const traces = [
    { key: 'roll',  color: '#ff6655', label: 'ROLL' },
    { key: 'pitch', color: '#55ee88', label: 'PITCH' },
    { key: 'yaw',   color: '#5588ff', label: 'YAW' },
  ];
  const range = 90;
  const pad = 6;
  const n = data.length;

  const mkPath = (key) =>
    data.map((d, i) => {
      const x = (i / (n - 1)) * 100;
      const y = pad + ((range - (d[key] || 0)) / (range * 2)) * (h - pad * 2);
      return `${x},${y}`;
    }).join(' ');

  return (
    <div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
        {traces.map((tr) => (
          <span key={tr.key} style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: FONT.mono, fontSize: TYPE.cap, color: tr.color,
          }}>
            <span style={{ width: 16, height: 2, background: tr.color, display: 'inline-block', borderRadius: 1 }} />
            {tr.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 100 ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
        {/* Zero line */}
        <line x1="0" y1={h / 2} x2="100" y2={h / 2}
          stroke={T.gridLine} strokeWidth="0.4" vectorEffect="non-scaling-stroke" strokeDasharray="2 3" />
        {traces.map((tr) => (
          <polyline
            key={tr.key}
            points={mkPath(tr.key)}
            fill="none"
            stroke={tr.color}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FSMBar — horizontal flight state machine bar
// states: string[]
// current: string
// ---------------------------------------------------------------------------
export function FSMBar({ T: propT, states, current }) {
  const T = useT(propT);
  if (!T || !states) return null;

  const idx = states.indexOf(current);
  const stateColors = {
    PAD: T.muted, BOOST: T.danger,
    'COAST': T.info, 'COAST 1': T.info, 'COAST 2': T.info,
    SUSTAIN: T.warn, APOGEE: T.accent,
    DROGUE: T.accent, TUMBLE: T.danger,
    RECOVERY: T.accent, MAIN: T.warn, LANDED: T.accent,
  };

  return (
    <div style={{
      display: 'flex',
      background: T.bgPanel,
      border: `1px solid ${T.border}`,
      borderRadius: 5,
      overflow: 'hidden',
    }}>
      {states.map((s, i) => {
        const active = i === idx;
        const past = i < idx;
        const c = stateColors[s] || T.muted;
        return (
          <div key={s} style={{
            flex: 1,
            padding: '8px 4px',
            textAlign: 'center',
            position: 'relative',
            background: active ? c + '20' : past ? c + '08' : 'transparent',
            borderRight: i < states.length - 1 ? `1px solid ${T.border}` : 'none',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: active ? c : past ? c + '60' : 'transparent',
            }} />
            <div style={{
              fontFamily: FONT.cond, fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
              color: active ? c : past ? c + '88' : T.muted,
            }}>
              {s}
            </div>
          </div>
        );
      })}
    </div>
  );
}
