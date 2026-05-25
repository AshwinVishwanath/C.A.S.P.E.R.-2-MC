import React, { useState, useCallback, useContext } from 'react';
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

function TweakSelect({ label, value, options, onChange }) {
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

function TweakRadio({ label, value, options, onChange }) {
  const T = useT();
  if (!T) return null;
  return (
    <TweakRow label={label}>
      <div style={{ display: 'flex', gap: 0, borderRadius: RADIUS.sm, overflow: 'hidden', border: `1px solid ${T.border}` }}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          const active = v === value;
          return (
            <button
              key={v}
              onClick={() => onChange(v)}
              style={{
                flex: 1,
                fontFamily: FONT.mono,
                fontSize: 10,
                fontWeight: 600,
                padding: '4px 6px',
                background: active ? T.accentBg : T.bgEl,
                color: active ? T.accent : T.muted,
                border: 'none',
                borderRight: `1px solid ${T.border}`,
                cursor: 'pointer',
                transition: 'all 120ms ease',
                letterSpacing: 0.2,
              }}
            >
              {l}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}

function TweakToggle({ label, value, onChange }) {
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
// TweaksPanel — fixed bottom-right floating panel
// ---------------------------------------------------------------------------

/**
 * TweaksPanel
 *
 * @param {{ tweaks: object, setTweak: (key: string, value: any) => void }} props
 */
export function TweaksPanel({ tweaks, setTweak }) {
  const T = useT();
  const [open, setOpen] = useState(false);

  if (!T) return null;

  // Gear button (closed state)
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Design tweaks"
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 9999,
          width: 38,
          height: 38,
          borderRadius: RADIUS.pill,
          background: T.glassBg,
          backdropFilter: T.glassBlur,
          WebkitBackdropFilter: T.glassBlur,
          border: `1px solid ${T.border}`,
          color: T.muted,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: T.shadow,
          transition: 'all 160ms ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = T.accent; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; }}
      >
        <Icon name="gear" size={16} />
      </button>
    );
  }

  // Open panel
  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
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
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: `${SPACE.s2}px ${SPACE.s3}px`,
        borderBottom: `1px solid ${T.border}`,
        background: T.bgEl,
        minHeight: 40,
      }}>
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
