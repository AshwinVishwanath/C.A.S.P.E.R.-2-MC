import React from 'react';

// CASPER 2 — Inline SVG icon set. No emojis anywhere.
// 16x16 viewBox, currentColor stroke, default stroke 1.5.
// All icon names are present; those not in the original design file
// have been designed as clean 16x16 line-icon glyphs.

/**
 * Icon component.
 * @param {{ name: string, size?: number, stroke?: number, fill?: string, style?: React.CSSProperties }} props
 */
export function Icon({ name, size = 16, stroke = 1.5, fill = 'none', style }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 16 16',
    fill,
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    style: { display: 'block', ...style },
  };

  switch (name) {
    // ── Navigation tabs ────────────────────────────────────────────────────
    case 'setup':
      return <svg {...props}><circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/></svg>;
    case 'test':
      return <svg {...props}><path d="M3 2v5l3 4v3h4v-3l3-4V2"/><path d="M3 2h10"/><path d="M5.5 9h5"/></svg>;
    case 'flight':
      return <svg {...props}><path d="M8 1.5l3 6.5v6l-3-1.5-3 1.5v-6z"/><path d="M5 11l-2 1M11 11l2 1"/></svg>;
    case 'track':
      return <svg {...props}><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2.5"/><path d="M8 2v3M8 11v3M2 8h3M11 8h3"/></svg>;
    case 'lab':
      return <svg {...props}><path d="M5.5 1.5v4l-3 7a1.5 1.5 0 0 0 1.4 2h8.2a1.5 1.5 0 0 0 1.4-2l-3-7v-4"/><path d="M4.5 1.5h7"/><path d="M4.2 9.5h7.6"/></svg>;

    // ── System ─────────────────────────────────────────────────────────────
    case 'power':
      return <svg {...props}><path d="M5.5 3a5 5 0 1 0 5 0"/><path d="M8 1.5v6"/></svg>;
    case 'sun':
      return <svg {...props}><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>;
    case 'moon':
      return <svg {...props}><path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" fill="currentColor"/></svg>;
    case 'gear':
      return <svg {...props}><path d="M8 1.5l1 1.6 1.8-.4.4 1.8 1.6 1-1 1.6 1 1.6-1.6 1-.4 1.8-1.8-.4-1 1.6-1-1.6-1.8.4-.4-1.8-1.6-1 1-1.6-1-1.6 1.6-1 .4-1.8 1.8.4z"/><circle cx="8" cy="8" r="2"/></svg>;

    // ── Transfer ───────────────────────────────────────────────────────────
    case 'upload':
      return <svg {...props}><path d="M8 11V2M4 5.5L8 1.5l4 4M2.5 13.5h11"/></svg>;
    case 'download':
      return <svg {...props}><path d="M8 2v9M4 7.5L8 11.5l4-4M2.5 13.5h11"/></svg>;
    case 'save':
      return <svg {...props}><path d="M2 2h9l3 3v9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M4 2v5h8V2"/><path d="M4 11h8"/></svg>;
    case 'copy':
      return <svg {...props}><rect x="5" y="5" width="9" height="10" rx="1"/><path d="M2 11V2h9"/></svg>;

    // ── Status / feedback ──────────────────────────────────────────────────
    case 'check':
      return <svg {...props}><path d="M3 8l3.5 3.5L13 4.5"/></svg>;
    case 'x':
      return <svg {...props}><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>;
    case 'alert':
      return <svg {...props}><path d="M8 1.5L14.5 13H1.5z"/><path d="M8 6v3"/><circle cx="8" cy="11.2" r="0.6" fill="currentColor"/></svg>;
    case 'dot':
      return <svg {...props}><circle cx="8" cy="8" r="3" fill="currentColor" stroke="none"/></svg>;

    // ── Security ───────────────────────────────────────────────────────────
    case 'lock':
      return <svg {...props}><rect x="3" y="7" width="10" height="7" rx="0.5"/><path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg>;
    case 'unlock':
      return <svg {...props}><rect x="3" y="7" width="10" height="7" rx="0.5"/><path d="M5 7V5a3 3 0 0 1 6 0"/></svg>;

    // ── Playback ───────────────────────────────────────────────────────────
    case 'play':
      return <svg {...props} fill="currentColor" stroke="none"><path d="M3.5 2.5v11l9-5.5z"/></svg>;
    case 'pause':
      return <svg {...props} fill="currentColor" stroke="none"><rect x="4" y="2.5" width="2.5" height="11"/><rect x="9.5" y="2.5" width="2.5" height="11"/></svg>;

    // ── Telemetry ──────────────────────────────────────────────────────────
    case 'signal':
      return <svg {...props}><path d="M2 13h2v-3H2zM6 13h2v-6H6zM10 13h2v-9h-2z"/></svg>;
    case 'battery':
      return <svg {...props}><rect x="1.5" y="5" width="11" height="6"/><rect x="13" y="6.5" width="1.5" height="3" fill="currentColor" stroke="none"/><rect x="3" y="6.5" width="6" height="3" fill="currentColor" stroke="none"/></svg>;
    case 'wave':
      return <svg {...props}><path d="M1 8c1.5-3 3-3 4 0s2.5 3 4 0 2.5-3 4 0"/></svg>;
    case 'satellite':
      return <svg {...props}><circle cx="8" cy="8" r="2"/><path d="M8 4v-2.5M8 12v2.5M4 8h-2.5M12 8h2.5"/><path d="M8 8L11.5 4.5M8 8L4.5 11.5"/></svg>;
    case 'chip':
      return <svg {...props}><rect x="3" y="3" width="10" height="10" rx="0.5"/><path d="M5 3v-2M8 3v-2M11 3v-2M5 13v2M8 13v2M11 13v2M3 5h-2M3 8h-2M3 11h-2M13 5h2M13 8h2M13 11h2"/><rect x="6" y="6" width="4" height="4"/></svg>;

    // ── Operations ─────────────────────────────────────────────────────────
    case 'abort':
      return <svg {...props}><circle cx="8" cy="8" r="6"/><path d="M4 4l8 8"/></svg>;
    case 'fire':
      return <svg {...props}><path d="M8 1.5c0 3-3 3-3 6.5a3 3 0 0 0 6 0c0-1.5-1-2.5-1-4 1 1 2 2 2 3.5a4 4 0 0 1-8 0c0-3.5 4-3 4-6z"/></svg>;

    // ── Chevrons ───────────────────────────────────────────────────────────
    case 'chevron-left':
      return <svg {...props}><path d="M10 3L5 8l5 5"/></svg>;
    case 'chevron-right':
      return <svg {...props}><path d="M6 3l5 5-5 5"/></svg>;
    case 'chevron-up':
      return <svg {...props}><path d="M3 10l5-5 5 5"/></svg>;
    case 'chevron-down':
      return <svg {...props}><path d="M3 6l5 5 5-5"/></svg>;

    // ── Edit actions ───────────────────────────────────────────────────────
    case 'plus':
      return <svg {...props}><path d="M8 2v12M2 8h12"/></svg>;
    case 'minus':
      return <svg {...props}><path d="M2 8h12"/></svg>;
    case 'undo':
      return <svg {...props}><path d="M3 7H11a3 3 0 0 1 0 6H8"/><path d="M6 4L3 7l3 3"/></svg>;
    case 'redo':
      return <svg {...props}><path d="M13 7H5a3 3 0 0 0 0 6h3"/><path d="M10 4l3 3-3 3"/></svg>;
    case 'trash':
      return <svg {...props}><path d="M2 4h12M5 4V2h6v2"/><path d="M3 4l1 10h8l1-10"/><path d="M6 7v4M10 7v4"/></svg>;
    case 'search':
      return <svg {...props}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>;
    case 'eye':
      return <svg {...props}><ellipse cx="8" cy="8" rx="6" ry="4"/><circle cx="8" cy="8" r="2"/></svg>;
    case 'eye-off':
      return <svg {...props}><path d="M2 2l12 12"/><path d="M6.5 6.5A2 2 0 0 0 10 9.5"/><path d="M4 4.5C2.8 5.5 2 6.8 2 8c0 2 3 5 6 5 1.2 0 2.3-.4 3.3-1"/><path d="M10.5 4.5C11.3 4.8 12 5.5 13 6.5c.7.8 1 1.7 1 1.5"/></svg>;

    // ── View control ───────────────────────────────────────────────────────
    case 'fit':
      return <svg {...props}><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>;
    case 'group':
      return <svg {...props}><rect x="2" y="2" width="5" height="5" rx="0.5"/><rect x="9" y="2" width="5" height="5" rx="0.5"/><rect x="2" y="9" width="5" height="5" rx="0.5"/><rect x="9" y="9" width="5" height="5" rx="0.5"/></svg>;
    case 'ungroup':
      return <svg {...props}><rect x="2" y="4" width="12" height="8" rx="0.5"/><path d="M5 4V2M11 4V2M5 12v2M11 12v2"/></svg>;
    case 'expand':
      return <svg {...props}><path d="M2 2h4M2 2v4M14 14h-4M14 14v-4M10 2h4M14 2v4M2 14v-4M2 14h4"/></svg>;
    case 'collapse':
      return <svg {...props}><path d="M6 2L6 6H2M10 2l0 4h4M6 14l0-4H2M10 14l0-4h4"/></svg>;

    // ── Visualization modes ────────────────────────────────────────────────
    case 'sparkline':
      return <svg {...props}><path d="M1.5 12l3-6 2.5 4 3-7 3.5 5"/><path d="M1.5 12h13"/></svg>;
    case 'dial':
      return <svg {...props}><circle cx="8" cy="9" r="5.5"/><path d="M8 9V5.5"/><path d="M4 9a4 4 0 0 1 4-4"/><path d="M4.5 12.5l1-1"/></svg>;
    case 'graph':
      return <svg {...props}><path d="M1.5 13.5v-11M1.5 13.5h13"/><path d="M4 13.5V9M7.5 13.5V6M11 13.5V3.5"/></svg>;
    case 'terminal':
      return <svg {...props}><rect x="1.5" y="2.5" width="13" height="11" rx="1"/><path d="M4 6l2.5 2.5L4 11"/><path d="M9 11h3"/></svg>;

    // ── Hardware identifiers ───────────────────────────────────────────────
    case 'fc':
      return <svg {...props}><rect x="2" y="4" width="12" height="8" rx="0.5"/><path d="M5 4V2M8 4V2M11 4V2M5 12v2M8 12v2M11 12v2"/><path d="M5 8h2M9 8h2"/></svg>;
    case 'gs':
      return <svg {...props}><rect x="3" y="6" width="10" height="7" rx="0.5"/><path d="M8 6V3"/><path d="M5 3h6"/><circle cx="5" cy="9.5" r="1" fill="currentColor" stroke="none"/><path d="M8.5 9h2.5M8.5 11h2.5"/></svg>;

    default:
      return null;
  }
}

export default Icon;
