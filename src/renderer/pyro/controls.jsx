// controls.jsx — Form sub-components for the Inspector panel
// TextInput, SelectInput, Segmented, Stepper, Row, CheckRow
import React from 'react';
import { FONT, SPACE, RADIUS } from '../design/tokens.js';

// ---------------------------------------------------------------------------
// Row — labelled form row
// ---------------------------------------------------------------------------
export function Row({ T, label, children }) {
  return (
    <div style={{ marginBottom: SPACE.s3 }}>
      <div style={{
        fontFamily: FONT.cond,
        fontSize: 10,
        fontWeight: 700,
        color: T.muted,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        marginBottom: 4,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TextInput — single-line text or number field with optional suffix
// ---------------------------------------------------------------------------
export function TextInput({ T, value, onChange, type = 'text', suffix, placeholder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <input
        value={value ?? ''}
        type={type}
        placeholder={placeholder}
        onChange={(e) => onChange(type === 'number' ? +e.target.value : e.target.value)}
        style={{
          flex: 1,
          background: T.bgEl,
          border: '1px solid ' + T.border,
          borderRadius: RADIUS.sm,
          color: T.strong,
          fontFamily: FONT.mono,
          fontSize: 12,
          fontWeight: 600,
          padding: '6px 10px',
          outline: 'none',
          transition: 'border-color 120ms',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = T.accent; }}
        onBlur={(e)  => { e.currentTarget.style.borderColor = T.border; }}
      />
      {suffix && (
        <span style={{ fontFamily: FONT.mono, fontSize: 11, color: T.muted, whiteSpace: 'nowrap' }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SelectInput — <select> styled to match the design system
// options: string[] | { value, label }[]
// ---------------------------------------------------------------------------
export function SelectInput({ T, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        background: T.bgEl,
        border: '1px solid ' + T.border,
        borderRadius: RADIUS.sm,
        color: T.strong,
        fontFamily: FONT.mono,
        fontSize: 12,
        fontWeight: 600,
        padding: '6px 10px',
        outline: 'none',
        cursor: 'pointer',
      }}
    >
      {options.map((o) => {
        const val   = typeof o === 'object' ? o.value : o;
        const label = typeof o === 'object' ? o.label : o;
        return (
          <option key={val} value={val} style={{ background: T.bgPanel, color: T.strong }}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Segmented — vertical stack of selectable option buttons with optional hint
// options: [{ value, label, hint? }]
// ---------------------------------------------------------------------------
export function Segmented({ T, value, onChange, options }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      background: T.bgEl,
      border: '1px solid ' + T.border,
      borderRadius: RADIUS.sm,
      padding: 2,
    }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '6px 8px',
              background: active ? T.accentBg : 'transparent',
              border: 'none',
              borderLeft: '2px solid ' + (active ? T.accent : 'transparent'),
              borderRadius: 2,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 100ms',
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.bgPanel; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{
              fontFamily: FONT.mono,
              fontSize: 11,
              fontWeight: 700,
              color: active ? T.accent : T.strong,
              letterSpacing: '0.04em',
            }}>
              {o.label}
            </span>
            {o.hint && (
              <span style={{ fontFamily: FONT.mono, fontSize: 9, color: T.muted, marginTop: 1 }}>
                {o.hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper — +/- numeric stepper with clamping
// ---------------------------------------------------------------------------
export function Stepper({ T, value, onChange, min = 0, max = 99 }) {
  const v = +value || 0;
  const inc = (d) => onChange(Math.max(min, Math.min(max, v + d)));

  const btnStyle = (disabled) => ({
    width: 28,
    height: 28,
    background: T.bgEl,
    border: '1px solid ' + T.border,
    borderRadius: RADIUS.sm,
    color: disabled ? T.faint : T.strong,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: FONT.mono,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 100ms',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button onClick={() => inc(-1)} disabled={v <= min} style={btnStyle(v <= min)}>−</button>
      <div style={{
        flex: 1,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: T.bgEl,
        border: '1px solid ' + T.border,
        borderRadius: RADIUS.sm,
        fontFamily: FONT.mono,
        fontSize: 13,
        fontWeight: 700,
        color: T.strong,
      }}>
        {v}
      </div>
      <button onClick={() => inc(+1)} disabled={v >= max} style={btnStyle(v >= max)}>+</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CheckRow — validation check item with icon
// ---------------------------------------------------------------------------
export function CheckRow({ T, ok, warn, label }) {
  const c = ok ? T.accent : (warn ? T.warn : T.danger);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        {ok
          ? <path d="M3 7l3 3 5-6" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          : <path d="M7 1.5L13 12H1z M7 5v3 M7 10v0.5" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        }
      </svg>
      <span style={{ fontFamily: FONT.mono, fontSize: 11, color: c }}>
        {label}
      </span>
    </div>
  );
}
