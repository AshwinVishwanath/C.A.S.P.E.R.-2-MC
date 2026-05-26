import React, { useState, useRef, useEffect, useCallback, useContext } from 'react';
import { ThemeCtx } from './ThemeContext.jsx';
import { Icon } from './icons.jsx';
import { FONT, TYPE, RADIUS, SPACE } from './tokens.js';

// ---------------------------------------------------------------------------
// Internal theme resolver
// ---------------------------------------------------------------------------
function useT() {
  const ctx = useContext(ThemeCtx);
  return ctx && ctx.theme;
}

// ---------------------------------------------------------------------------
// Local form controls (self-contained, theme-aware)
// ---------------------------------------------------------------------------

function TweakRow({ label, children }) {
  const T = useT();
  if (!T) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{
        fontFamily: FONT.mono, fontSize: 10, fontWeight: 500,
        color: T.muted, letterSpacing: 0.3,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function TweakSection({ label }) {
  const T = useT();
  if (!T) return null;
  return (
    <div style={{
      fontFamily: FONT.cond, fontSize: 9, fontWeight: 700,
      letterSpacing: '0.10em', textTransform: 'uppercase',
      color: T.faint, paddingTop: 10, marginBottom: -2,
    }}>
      {label}
    </div>
  );
}

export function TweakSelect({ label, value, options, onChange }) {
  const T = useT();
  if (!T) return null;
  return (
    <TweakRow label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: FONT.mono, fontSize: 11,
          padding: '4px 8px',
          background: T.bgEl,
          color: T.text,
          border: `1px solid ${T.border}`,
          borderRadius: RADIUS.sm,
          outline: 'none',
          cursor: 'pointer',
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
      >
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </TweakRow>
  );
}

// ---------------------------------------------------------------------------
// TweakRadio — segmented control with animated sliding thumb for ≤3 options
// ---------------------------------------------------------------------------

export function TweakRadio({ label, value, options, onChange }) {
  const T = useT();
  const trackRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  if (!T) return null;

  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const n = opts.length;

  // Only use segmented control for 2 or 3 options; fall back to TweakSelect for more
  if (n > 3) {
    return (
      <TweakSelect label={label} value={value} options={options} onChange={onChange} />
    );
  }

  const idx = Math.max(0, opts.findIndex((o) => o.value === value));

  const segAt = (clientX) => {
    if (!trackRef.current) return opts[0].value;
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <TweakRow label={label}>
      <div
        ref={trackRef}
        role="radiogroup"
        onPointerDown={onPointerDown}
        style={{
          position: 'relative',
          display: 'flex',
          padding: 2,
          borderRadius: RADIUS.sm,
          background: `color-mix(in srgb, ${T.bgEl} 60%, transparent)`,
          border: `1px solid ${T.border}`,
          userSelect: 'none',
          overflow: 'hidden',
        }}
      >
        {/* Sliding thumb */}
        <div
          style={{
            position: 'absolute',
            top: 2,
            bottom: 2,
            left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
            width: `calc((100% - 4px) / ${n})`,
            borderRadius: RADIUS.sm,
            background: T.accentBg,
            boxShadow: `0 1px 3px rgba(0,0,0,0.18)`,
            transition: dragging
              ? 'none'
              : 'left 0.15s cubic-bezier(0.3,0.7,0.4,1), width 0.15s',
            pointerEvents: 'none',
          }}
        />
        {opts.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            style={{
              appearance: 'none',
              position: 'relative',
              zIndex: 1,
              flex: 1,
              border: 0,
              background: 'transparent',
              fontFamily: FONT.mono,
              fontSize: 10,
              fontWeight: 600,
              color: o.value === value ? T.accent : T.muted,
              minHeight: 22,
              borderRadius: RADIUS.sm,
              cursor: 'pointer',
              padding: '4px 6px',
              letterSpacing: 0.2,
              transition: 'color 120ms ease',
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

export function TweakToggle({ label, value, onChange }) {
  const T = useT();
  if (!T) return null;
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 8,
    }}>
      <span style={{ fontFamily: FONT.mono, fontSize: 11, color: T.text }}>
        {label}
      </span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 36, height: 18, borderRadius: 9, flexShrink: 0,
          background: value ? T.accent : T.bgEl,
          border: `1px solid ${value ? T.accent : T.border}`,
          cursor: 'pointer', padding: 1, position: 'relative',
          transition: 'all 160ms ease',
        }}
      >
        <span style={{
          position: 'absolute', top: 2,
          left: value ? 18 : 2,
          width: 12, height: 12, borderRadius: '50%',
          background: value ? T.accentText : T.muted,
          transition: 'left 160ms ease',
        }} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TweaksPanel — draggable floating panel with FAB chip closed state
// ---------------------------------------------------------------------------

const PAD = 16;

/**
 * TweaksPanel
 *
 * @param {{ tweaks: object, setTweak: (key: string, value: any) => void }} props
 */
export function TweaksPanel({ tweaks, setTweak }) {
  const T = useT();
  const [open, setOpen] = useState(false);

  // Draggable panel state: position expressed as { right, bottom } offsets
  const dragRef = useRef(null);
  const offsetRef = useRef({ x: PAD, y: PAD });
  // Force re-render after drag to apply updated offset
  const [, setDragTick] = useState(0);

  const clampToViewport = useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    const clamped = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    if (clamped.x !== offsetRef.current.x || clamped.y !== offsetRef.current.y) {
      offsetRef.current = clamped;
      setDragTick((t) => t + 1);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Clamp after the panel renders (need a tick for offsetWidth/Height)
    const id = requestAnimationFrame(clampToViewport);
    const onResize = () => clampToViewport();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', onResize);
    };
  }, [open, clampToViewport]);

  const onDragStart = useCallback((e) => {
    const panel = dragRef.current;
    if (!panel) return;
    // Don't start drag from close button
    if (e.target.closest && e.target.closest('button[data-close]')) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;

    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      const panelEl = dragRef.current;
      if (panelEl) {
        const w = panelEl.offsetWidth;
        const h = panelEl.offsetHeight;
        const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
        const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
        offsetRef.current = {
          x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
          y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
        };
        panelEl.style.right = offsetRef.current.x + 'px';
        panelEl.style.bottom = offsetRef.current.y + 'px';
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      // Sync state so a future re-render uses the correct position
      setDragTick((t) => t + 1);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, []);

  if (!T) return null;

  // FAB chip — closed state
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Design tweaks"
        style={{
          position: 'fixed',
          bottom: PAD,
          right: PAD,
          zIndex: 9999,
          appearance: 'none',
          border: `1px solid ${T.border}`,
          height: 32,
          padding: '0 12px',
          borderRadius: 16,
          background: T.glassBg,
          backdropFilter: T.glassBlur,
          WebkitBackdropFilter: T.glassBlur,
          boxShadow: T.shadow,
          color: T.text,
          fontFamily: FONT.mono,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          transition: 'all 160ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
      >
        {/* Glowing accent dot */}
        <span style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: T.accent,
          boxShadow: `0 0 8px ${T.accent}`,
          flexShrink: 0,
        }} />
        TWEAKS
      </button>
    );
  }

  // Open panel — draggable
  return (
    <div
      ref={dragRef}
      style={{
        position: 'fixed',
        bottom: offsetRef.current.y,
        right: offsetRef.current.x,
        zIndex: 9999,
        width: 280,
        maxHeight: 'calc(100vh - 32px)',
        display: 'flex',
        flexDirection: 'column',
        background: T.glassBg,
        backdropFilter: T.glassBlur,
        WebkitBackdropFilter: T.glassBlur,
        border: `1px solid ${T.border}`,
        borderRadius: RADIUS.lg,
        boxShadow: T.shadow,
        overflow: 'hidden',
        animation: 'cmcFadeUp 0.18s ease-out',
      }}
    >
      {/* Header — drag handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: `${SPACE.s2}px ${SPACE.s3}px`,
          borderBottom: `1px solid ${T.border}`,
          background: T.bgEl,
          minHeight: 40,
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: SPACE.s2,
          fontFamily: FONT.cond, fontSize: 11, fontWeight: 700,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: T.muted,
        }}>
          <Icon name="gear" size={12} />
          TWEAKS
        </div>
        <button
          data-close="true"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setOpen(false)}
          style={{
            background: 'transparent', border: 'none',
            color: T.muted, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: RADIUS.sm,
            transition: 'color 120ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.text; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; }}
        >
          <Icon name="x" size={12} />
        </button>
      </div>

      {/* Body */}
      <div style={{
        padding: `${SPACE.s3}px ${SPACE.s4}px ${SPACE.s4}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE.s3,
        overflowY: 'auto',
        overflowX: 'hidden',
      }}>
        <TweakSection label="Visual Scheme" />
        <TweakSelect
          label="Scheme"
          value={tweaks.scheme}
          options={[
            { value: 'fusion',     label: 'Fusion' },
            { value: 'obsidian',   label: 'Obsidian' },
            { value: 'terminal',   label: 'Terminal' },
            { value: 'instrument', label: 'Instrument' },
          ]}
          onChange={(v) => setTweak('scheme', v)}
        />

        <TweakSection label="Theme" />
        <TweakRadio
          label="Mode"
          value={tweaks.mode}
          options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
          onChange={(v) => setTweak('mode', v)}
        />

        <TweakSection label="Accent" />
        <TweakRadio
          label="Color"
          value={tweaks.accent}
          options={[
            { value: 'auto',   label: 'Auto' },
            { value: 'mint',   label: 'Mint' },
            { value: 'orange', label: 'Orange' },
            { value: 'amber',  label: 'Amber' },
            { value: 'red',    label: 'Red' },
          ]}
          onChange={(v) => setTweak('accent', v)}
        />

        <TweakSection label="Performance" />
        <TweakToggle
          label="Motion"
          value={tweaks.motion}
          onChange={(v) => setTweak('motion', v)}
        />
        <TweakToggle
          label="Shader"
          value={tweaks.shader}
          onChange={(v) => setTweak('shader', v)}
        />
      </div>
    </div>
  );
}

export default TweaksPanel;
