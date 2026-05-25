// MiniMap.jsx — bottom-right viewport overview, collapsible
import React, { useState } from 'react';
import { FONT, RADIUS } from '../design/tokens.js';
import { CAT_COLORS, GROUP_COLOR } from './types.js';
import { getSpec } from './spec.js';
import { nodeHeight, NODE_W } from './geometry.js';
import { groupProxyData } from './geometry.js';

const MAP_W = 160;
const MAP_H = 100;

/**
 * MiniMap
 *
 * Props:
 *   T        — theme object
 *   scheme   — scheme string
 *   state    — pyro reducer state
 *   view     — { x, y, k }
 *   showGlow — boolean
 */
export function MiniMap({ T, state, view, showGlow = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const groups = state.groups || [];

  if (state.nodes.length === 0) return null;

  // Collapsed icon button
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        title="Show minimap"
        style={{
          position: 'absolute', bottom: 34, right: 12, zIndex: 4,
          width: 28, height: 28,
          background: T.bgPanel + 'ee',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid ' + T.border,
          borderRadius: RADIUS.sm,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.muted, transition: 'color 140ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = T.accent; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; }}
      >
        <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
          <rect x="0.5" y="0.5" width="13" height="9" rx="1" stroke="currentColor" strokeWidth="1" />
          <rect x="3" y="3" width="3" height="2" fill="currentColor" />
          <rect x="8" y="5" width="3" height="2" fill="currentColor" />
        </svg>
      </button>
    );
  }

  // Compute which nodes are hidden inside collapsed groups
  const hiddenMembers = new Set();
  groups.forEach((g) => { if (g.collapsed) g.nodeIds.forEach((id) => hiddenMembers.add(id)); });

  // Expanded group bboxes (drawn as faint backdrops)
  const groupBoxes = groups.filter((g) => !g.collapsed).map((g) => {
    const members = g.nodeIds.map((id) => state.nodes.find((n) => n.id === id)).filter(Boolean);
    if (members.length === 0) return null;
    const xs = members.flatMap((n) => [n.x, n.x + NODE_W]);
    const ys = members.flatMap((n) => [n.y, n.y + nodeHeight(n)]);
    return {
      id: g.id,
      x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  }).filter(Boolean);

  // Collapsed proxy bboxes
  const proxyBoxes = groups.filter((g) => g.collapsed).map((g) => {
    const pd = groupProxyData(g, state.nodes, state.edges);
    return pd ? { id: g.id, x: pd.x, y: pd.y, w: pd.w, h: pd.h } : null;
  }).filter(Boolean);

  // Everything visible on canvas for bounds calculation
  const all = [
    ...state.nodes.filter((n) => !hiddenMembers.has(n.id)).map((n) => ({
      x: n.x, y: n.y, w: NODE_W, h: nodeHeight(n),
    })),
    ...proxyBoxes,
  ];
  if (all.length === 0) return null;

  const allXs = all.flatMap((b) => [b.x, b.x + b.w]);
  const allYs = all.flatMap((b) => [b.y, b.y + b.h]);
  const minX  = Math.min(...allXs) - 80;
  const maxX  = Math.max(...allXs) + 80;
  const minY  = Math.min(...allYs) - 80;
  const maxY  = Math.max(...allYs) + 80;
  const sx    = MAP_W / (maxX - minX);
  const sy    = MAP_H / (maxY - minY);
  const s     = Math.min(sx, sy);

  return (
    <div style={{
      position: 'absolute', bottom: 34, right: 12, zIndex: 4,
      width: MAP_W, height: MAP_H,
      background: T.bgPanel + 'ee',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      border: '1px solid ' + T.border,
      borderRadius: RADIUS.sm,
      overflow: 'hidden',
    }}>
      <svg width={MAP_W} height={MAP_H}>
        {/* Expanded group backdrops */}
        {groupBoxes.map((b) => (
          <rect key={'g_exp_' + b.id}
            x={(b.x - minX) * s} y={(b.y - minY) * s}
            width={b.w * s} height={b.h * s}
            rx="2"
            fill={GROUP_COLOR + '1f'}
            stroke={GROUP_COLOR + '88'} strokeWidth="0.5"
            strokeDasharray="2 1.5"
          />
        ))}

        {/* Node squares — colored by category */}
        {state.nodes.filter((n) => !hiddenMembers.has(n.id)).map((n) => {
          const spec = getSpec(n);
          const cat  = spec?.cat || 'INPUTS';
          const c    = CAT_COLORS[cat] || T.accent;
          return (
            <rect key={n.id}
              x={(n.x - minX) * s} y={(n.y - minY) * s}
              width={NODE_W * s} height={nodeHeight(n) * s}
              rx="1" fill={c} opacity="0.85"
            />
          );
        })}

        {/* Collapsed group proxies */}
        {proxyBoxes.map((b) => (
          <rect key={'g_col_' + b.id}
            x={(b.x - minX) * s} y={(b.y - minY) * s}
            width={b.w * s} height={b.h * s}
            rx="2" fill={GROUP_COLOR} opacity="0.95"
            stroke={GROUP_COLOR} strokeWidth="0.6"
          />
        ))}
      </svg>

      {/* Close / collapse button */}
      <button
        onClick={() => setCollapsed(true)}
        title="Hide minimap"
        style={{
          position: 'absolute', top: 2, right: 2,
          width: 18, height: 18,
          background: 'transparent', border: 'none', borderRadius: 2,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.muted,
          fontFamily: FONT.mono, fontSize: 11, lineHeight: 1,
          transition: 'color 140ms, background 140ms',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = T.accent; e.currentTarget.style.background = T.bgEl; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; e.currentTarget.style.background = 'transparent'; }}
      >
        ×
      </button>
    </div>
  );
}

export default MiniMap;
