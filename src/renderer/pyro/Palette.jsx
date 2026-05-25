// Palette.jsx — left sidebar with collapsible sections, search, drag sources, macros
import React, { useState } from 'react';
import { FONT, SPACE, RADIUS, SCHEME_PROPS } from '../design/tokens.js';
import { NODE_SPECS, CAT_COLORS, GROUP_COLOR } from './types.js';
import { PortPattern } from './PortPattern.jsx';

const CATS = ['INPUTS', 'LOGIC', 'MATH', 'TIMING', 'STATE'];

/**
 * Palette — left sidebar
 *
 * Props:
 *   T             — theme
 *   scheme        — scheme string
 *   onAdd         — (kind) → void  (double-click handler)
 *   query         — string
 *   setQuery      — (string) → void
 *   collapsed     — boolean
 *   onToggle      — () → void
 *   macros        — Macro[]
 *   onMacroDelete — (macroId) → void
 */
export function Palette({ T, scheme, onAdd, query, setQuery, collapsed, onToggle, macros = [], onMacroDelete }) {
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;
  const [openCats, setOpenCats] = useState(new Set(CATS));

  const toggleCat = (cat) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const filtered = (cat) =>
    NODE_SPECS.filter(
      (s) =>
        s.cat === cat &&
        (!query || (s.label + ' ' + (s.sub || '')).toLowerCase().includes(query.toLowerCase()))
    );

  if (collapsed) {
    return (
      <aside style={{
        width: 40, flexShrink: 0,
        background: T.bgPanel,
        borderRight: '1px solid ' + T.border,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: SPACE.s3 + 'px 0',
      }}>
        <button
          onClick={onToggle}
          title="Expand palette"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 8, color: T.muted, transition: 'color 140ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          marginTop: SPACE.s3,
          fontFamily: FONT.cond, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.24em', color: T.muted,
          textTransform: 'uppercase',
        }}>
          Palette
        </div>
      </aside>
    );
  }

  return (
    <aside style={{
      width: 240, flexShrink: 0,
      background: T.bgPanel,
      borderRight: '1px solid ' + T.border,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header + search */}
      <div style={{ padding: SPACE.s3, borderBottom: '1px solid ' + T.border }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: SPACE.s2,
        }}>
          <div style={{
            fontFamily: FONT.cond, fontSize: 10, fontWeight: 700,
            color: T.accent, letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>
            NODE PALETTE
          </div>
          <button
            onClick={onToggle}
            title="Collapse palette"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '2px 4px', color: T.muted, transition: 'color 140ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M9 3l-4 4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: T.bgEl,
            border: '1px solid ' + T.border,
            borderRadius: RADIUS.sm,
            padding: '6px 10px',
            color: T.strong,
            fontFamily: FONT.mono, fontSize: 12,
            outline: 'none',
            transition: 'border-color 120ms',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = T.accent; }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = T.border; }}
        />
      </div>

      {/* Scrollable list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: SPACE.s2 + 'px 0' }}>

        {/* MACROS section */}
        {macros.length > 0 && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: SPACE.s2 + 'px ' + SPACE.s3 + 'px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: 1, background: GROUP_COLOR, display: 'inline-block',
                  boxShadow: (sk.showGlow ? '0 0 6px ' + GROUP_COLOR : 'none'),
                }} />
                <span style={{ fontFamily: FONT.cond, fontSize: 10, color: T.muted, letterSpacing: '0.18em', fontWeight: 700 }}>
                  MACROS
                </span>
              </div>
              <span style={{ fontFamily: FONT.mono, fontSize: 10, color: T.faint }}>{macros.length}</span>
            </div>

            <div style={{ paddingBottom: SPACE.s2, borderBottom: '1px solid ' + T.border }}>
              {macros
                .filter((m) => !query || m.label.toLowerCase().includes(query.toLowerCase()))
                .map((m) => (
                  <div
                    key={m.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData('macro', m.id); }}
                    style={{
                      position: 'relative',
                      margin: '2px ' + SPACE.s3 + 'px',
                      padding: '8px 10px',
                      borderRadius: RADIUS.sm,
                      background: T.bgEl,
                      border: '1px solid ' + GROUP_COLOR + '55',
                      borderLeft: '3px solid ' + GROUP_COLOR,
                      cursor: 'grab',
                      transition: 'all 120ms',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = GROUP_COLOR + '15'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = T.bgEl; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{
                        fontFamily: FONT.sans, fontSize: 12, fontWeight: 700, color: T.strong,
                        flex: 1, minWidth: 0,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }} title={m.label}>
                        {m.label}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onMacroDelete && onMacroDelete(m.id); }}
                        title="Delete macro"
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: T.faint, fontFamily: FONT.mono, fontSize: 12, lineHeight: 1, padding: 2,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = T.danger; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = T.faint; }}
                      >
                        ×
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <span style={{ fontFamily: FONT.mono, fontSize: 9, color: T.muted, letterSpacing: '0.08em' }}>
                        {m.nodeCount} NODES · {(m.edges || []).length} EDGES
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 3, marginTop: 5 }}>
                      {Object.entries(m.catCounts || {}).map(([cat, n]) => (
                        <span key={cat} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '1px 5px',
                          background: (CAT_COLORS[cat] || T.accent) + '22',
                          border: '1px solid ' + (CAT_COLORS[cat] || T.accent) + '55',
                          borderRadius: 2,
                          fontFamily: FONT.mono, fontSize: 9, fontWeight: 700,
                          color: CAT_COLORS[cat] || T.accent,
                          letterSpacing: '0.05em',
                        }}>
                          {n}×{cat.slice(0, 3)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Category sections */}
        {CATS.map((cat) => {
          const items  = filtered(cat);
          if (items.length === 0) return null;
          const isOpen = openCats.has(cat);
          const catColor = CAT_COLORS[cat] || T.accent;

          return (
            <div key={cat}>
              <button
                onClick={() => toggleCat(cat)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%',
                  padding: SPACE.s2 + 'px ' + SPACE.s3 + 'px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  borderBottom: isOpen ? 'none' : '1px solid ' + T.border,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: 1, background: catColor, display: 'inline-block',
                    boxShadow: sk.showGlow ? '0 0 6px ' + catColor : 'none',
                  }} />
                  <span style={{
                    fontFamily: FONT.cond, fontSize: 10, color: T.muted,
                    letterSpacing: '0.18em', fontWeight: 700,
                  }}>
                    {cat}
                  </span>
                </div>
                <span style={{ fontFamily: FONT.mono, fontSize: 10, color: T.faint }}>
                  {isOpen ? '▾' : '▸'} {items.length}
                </span>
              </button>

              {isOpen && (
                <div style={{ paddingBottom: SPACE.s2, borderBottom: '1px solid ' + T.border }}>
                  {items.map((spec) => (
                    <div
                      key={spec.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData('kind', spec.id); }}
                      onDoubleClick={() => onAdd && onAdd(spec.id)}
                      style={{
                        margin: '2px ' + SPACE.s3 + 'px',
                        padding: '6px 8px',
                        borderRadius: RADIUS.sm,
                        background: T.bgEl,
                        border: '1px solid ' + T.border,
                        cursor: 'grab',
                        transition: 'all 120ms',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = T.accentBg;
                        e.currentTarget.style.borderColor = T.accentRing;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = T.bgEl;
                        e.currentTarget.style.borderColor = T.border;
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontFamily: FONT.sans, fontSize: 12, fontWeight: 600, color: T.strong }}>
                          {spec.label}
                        </span>
                        <PortPattern spec={spec} />
                      </div>
                      {spec.sub && (
                        <div style={{ fontFamily: FONT.mono, fontSize: 9, color: T.muted, marginTop: 1 }}>
                          {spec.sub}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

export default Palette;
