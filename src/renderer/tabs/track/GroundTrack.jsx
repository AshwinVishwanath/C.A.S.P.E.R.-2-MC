// GroundTrack.jsx — north-up ground track for field recovery.
//
// Canvas-2D, auto-ranging, with a breadcrumb trail of recent fixes and
// distinct markers for LAUNCH (first fix latched this session) and the
// most recent fix. Deliberately modeled on design/instruments.jsx's Radar
// (same dpr/canvas setup, ring ladder, label style, theme tokens) so it
// reads as a sibling of that widget rather than a bolted-on one-off — but
// it does not sweep or rotate: this is a map, not a scope, so it stays
// literally north-up at all times.
//
// No basemap/tiles — the app is an offline portable .exe with no internet
// at the launch site, so this is intentionally just a plotted track over a
// blank grid with a scale indicator, never a map tile.
import React, { useEffect, useRef, useContext } from 'react';
import { ThemeCtx } from '../../design/ThemeContext.jsx';
import { FONT, SCHEME_PROPS } from '../../design/tokens.js';
import { offsetMeters, pickAutoRange, formatDistanceShort } from './recovery_geo.js';

function useT(propT) {
  const ctx = useContext(ThemeCtx);
  return propT || (ctx && ctx.theme) || null;
}

// Same oklch/css -> rgba(...) resolver as instruments.jsx's Radar (kept
// local rather than imported so this file has no dependency on the
// design-system module beyond tokens — see file header).
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

/**
 * GroundTrack — plots the rocket's GPS fixes relative to the first fix
 * latched this session ("LAUNCH"), north-up, auto-ranging outward as the
 * rocket (or the person carrying the laptop) moves away from it.
 *
 * Props:
 *   T, size, scheme, motion — design-system conventions (see Radar)
 *   lat, lon  — current fix, decimal degrees (ignored unless fixOk)
 *   fixOk     — true only when the FC reports an actual 2D/3D fix
 *               (see recovery_geo.isValidFix) — gates everything, including
 *               whether LAUNCH gets latched, so a stale 0,0 default never
 *               becomes a fake reference point.
 */
export function GroundTrack({ T: propT, size = 340, scheme, motion = true, lat, lon, fixOk }) {
  const T = useT(propT);
  const ref = useRef(null);
  const sk = SCHEME_PROPS[scheme || (T && T.scheme) || 'fusion'];
  // Session-latched state survives re-renders without re-running the effect
  // setup; it does NOT survive an unmount (a fresh recovery walk after a
  // remount starts a fresh launch point — acceptable for this widget).
  const stateRef = useRef({ launch: null, lastGood: null, trail: [], maxRSmooth: 100, lastRecord: 0 });

  useEffect(() => {
    if (!T) return;
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf;
    const state = stateRef.current;

    const draw = () => {
      const ctx = c.getContext('2d');
      const sz = size;
      c.width = sz * dpr;
      c.height = sz * dpr;
      ctx.scale(dpr, dpr);
      const r = sz / 2 - 14;
      const cx = sz / 2, cy = sz / 2;

      const haveFix = !!fixOk;

      // Latch launch on the first good fix.
      if (haveFix && !state.launch) {
        state.launch = { lat, lon };
      }

      // A fresh fix updates the last-known position; a transient fix loss
      // (a real thing on foot in a field) keeps showing the last-known
      // trail/marker rather than blanking the whole widget — see the
      // "stale" flag threaded into the marker/readout below.
      if (haveFix && state.launch) {
        const off = offsetMeters(state.launch.lat, state.launch.lon, lat, lon);
        state.lastGood = { dx: off.dx, dy: off.dy, dist: Math.hypot(off.dx, off.dy), t: Date.now() };
      }
      const have = state.launch && state.lastGood;
      const { dx = 0, dy = 0, dist = 0 } = have ? state.lastGood : {};
      const stale = have && !haveFix;

      // Auto range (same ladder-and-smoothing convention as Radar).
      const targetR = pickAutoRange(dist);
      state.maxRSmooth += (targetR - state.maxRSmooth) * 0.06;
      const maxR = state.maxRSmooth;

      // Record a breadcrumb every ~1s of real movement (>0.5m) on a fresh
      // fix only (never from a stale last-known point). Capped so a long
      // recovery walk never grows the trail unbounded.
      const now = Date.now();
      if (haveFix && state.launch && now - state.lastRecord > 1000) {
        const last = state.trail[state.trail.length - 1];
        if (!last || Math.hypot(dx - last.x, dy - last.y) > 0.5) {
          state.trail.push({ x: dx, y: dy });
          state.lastRecord = now;
          if (state.trail.length > 500) state.trail.shift();
        }
      }

      ctx.clearRect(0, 0, sz, sz);

      // ── Range rings + labels ──
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (r * i) / 4, 0, Math.PI * 2);
        ctx.strokeStyle = i === 4 ? _toRGBA(T.accent, 0.22) : T.border;
        ctx.lineWidth = i === 4 ? 1.2 : 0.5;
        ctx.stroke();
        if (have) {
          const lbl = (maxR * i) / 4;
          ctx.fillStyle = _toRGBA(T.accent, 0.25);
          ctx.font = `8px ${FONT.mono}`;
          ctx.textAlign = 'center';
          ctx.fillText(formatDistanceShort(lbl), cx, cy - (r * i) / 4 + 10);
        }
      }

      // Crosshair
      ctx.strokeStyle = T.gridLine;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
      ctx.stroke();

      // North-up cardinal labels — literal here, this view never rotates.
      ctx.fillStyle = T.muted;
      ctx.font = `bold 9px ${FONT.mono}`;
      ctx.textAlign = 'center';
      ctx.fillText('N', cx, cy - r + 14);
      ctx.fillText('S', cx, cy + r - 5);
      ctx.textAlign = 'left'; ctx.fillText('E', cx + r - 14, cy + 3);
      ctx.textAlign = 'right'; ctx.fillText('W', cx - r + 14, cy + 3);

      if (have) {
        // ── Breadcrumb trail ──
        const trail = state.trail;
        if (trail.length >= 2) {
          ctx.beginPath();
          for (let i = 0; i < trail.length; i++) {
            const px = cx + (trail[i].x / maxR) * r;
            const py = cy - (trail[i].y / maxR) * r;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          const px = cx + (dx / maxR) * r, py = cy - (dy / maxR) * r;
          ctx.lineTo(px, py);
          ctx.strokeStyle = _toRGBA(T.accent, 0.35);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        // Fade older breadcrumb dots toward the trail's start.
        const n = trail.length;
        for (let i = 0; i < n; i++) {
          const p = trail[i];
          const bx = cx + (p.x / maxR) * r, by = cy - (p.y / maxR) * r;
          if (Math.hypot(bx - cx, by - cy) > r) continue;
          const age = n <= 1 ? 1 : i / (n - 1);
          ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI * 2);
          ctx.fillStyle = _toRGBA(T.accent, 0.15 + age * 0.35);
          ctx.fill();
        }

        // ── LAUNCH marker (fixed at center — the reference point) ──
        ctx.strokeStyle = T.muted;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy);
        ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6);
        ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.strokeStyle = T.muted; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = T.muted;
        ctx.font = `bold 8px ${FONT.mono}`;
        ctx.textAlign = 'center';
        ctx.fillText('LAUNCH', cx, cy + 20);

        // ── Current (or last-known, if stale) fix marker ──
        // A stale marker draws as a hollow ring in the muted color rather
        // than the solid accent dot — still exactly where the rocket was
        // last seen, just visibly "not live" while the fix re-acquires.
        const markerColor = stale ? T.muted : T.accent;
        if (dist > 0.1) {
          const rx = cx + (dx / maxR) * r, ry = cy - (dy / maxR) * r;
          if (Math.hypot(rx - cx, ry - cy) <= r) {
            ctx.beginPath(); ctx.arc(rx, ry, 8, 0, Math.PI * 2);
            ctx.fillStyle = _toRGBA(markerColor, 0.14); ctx.fill();
            ctx.beginPath(); ctx.arc(rx, ry, 3, 0, Math.PI * 2);
            if (stale) {
              ctx.strokeStyle = markerColor; ctx.lineWidth = 1.5; ctx.stroke();
            } else {
              ctx.fillStyle = markerColor; ctx.fill();
            }
            if (sk.showGlow && !stale) {
              ctx.beginPath(); ctx.arc(rx, ry, 3, 0, Math.PI * 2);
              ctx.strokeStyle = _toRGBA(markerColor, 0.5); ctx.lineWidth = 4; ctx.stroke();
            }
          }
        } else {
          // Rocket is (nearly) exactly at launch — still mark it distinctly.
          ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
          ctx.fillStyle = markerColor; ctx.fill();
        }

        // Distance / bearing readout, bottom-left (same slot as Radar).
        const brg = (Math.atan2(dx, dy) * 180) / Math.PI;
        const brgN = brg < 0 ? brg + 360 : brg;
        ctx.fillStyle = _toRGBA(markerColor, 0.65);
        ctx.font = `bold 9px ${FONT.mono}`;
        ctx.textAlign = 'left';
        const readout = `${formatDistanceShort(dist)}  ${brgN.toFixed(0)}°` + (stale ? '  (last known)' : '');
        ctx.fillText(readout, 8, sz - 8);

        // ── Scale bar, bottom-right ──
        const scaleLen = maxR / 4; // one ring's worth, matches the ring labels
        const scalePx = r / 4;
        const sx0 = sz - 12 - scalePx, sx1 = sz - 12, sy = sz - 14;
        ctx.strokeStyle = T.text; ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx0, sy - 4); ctx.lineTo(sx0, sy + 4);
        ctx.moveTo(sx0, sy); ctx.lineTo(sx1, sy);
        ctx.moveTo(sx1, sy - 4); ctx.lineTo(sx1, sy + 4);
        ctx.stroke();
        ctx.fillStyle = T.text;
        ctx.font = `8px ${FONT.mono}`;
        ctx.textAlign = 'center';
        ctx.fillText(formatDistanceShort(scaleLen), (sx0 + sx1) / 2, sy - 7);
      } else {
        // ── Honest no-fix state ──
        ctx.fillStyle = T.faint;
        ctx.font = `bold 10px ${FONT.mono}`;
        ctx.textAlign = 'center';
        ctx.fillText('NO GPS FIX', cx, cy - 4);
        ctx.font = `9px ${FONT.mono}`;
        ctx.fillText('awaiting lock', cx, cy + 12);
      }

      // Center reference dot (kept even pre-launch so the widget doesn't
      // look empty while waiting for the first fix).
      ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = T.border; ctx.fill();

      if (motion) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [T, size, scheme, motion, lat, lon, fixOk, sk]);

  return <canvas ref={ref} style={{ width: size, height: size, display: 'block' }} />;
}

export default GroundTrack;
