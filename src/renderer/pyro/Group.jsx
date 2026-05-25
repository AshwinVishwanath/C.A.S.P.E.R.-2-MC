// Group.jsx — GroupBox (expanded) and GroupProxy (collapsed) SVG components
import React from 'react';
import { FONT, SCHEME_PROPS } from '../design/tokens.js';
import { PORT_COLORS, CAT_COLORS } from './types.js';
import { nodeHeight, NODE_W, NODE_PADDING_Y, GROUP_PROXY_HEADER, GROUP_PROXY_PORT_ROW, GROUP_COLOR, GROUP_PADDING } from './geometry.js';

const NODE_PAD = 10;

// ---------------------------------------------------------------------------
// GroupBox — dashed outline box drawn behind expanded group members
// ---------------------------------------------------------------------------
export function GroupBox({ T, scheme, group, nodes, selected, onSelect, onToggleCollapse }) {
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;
  const members = group.nodeIds.map((id) => nodes.find((n) => n.id === id)).filter(Boolean);
  if (members.length === 0) return null;

  const pad = GROUP_PADDING;
  const xs = members.flatMap((n) => [n.x, n.x + NODE_W]);
  const ys = members.flatMap((n) => [n.y, n.y + nodeHeight(n)]);
  const x  = Math.min(...xs) - pad;
  const y  = Math.min(...ys) - pad - 24; // room for title bar
  const w  = Math.max(...xs) - Math.min(...xs) + pad * 2;
  const h  = Math.max(...ys) - Math.min(...ys) + pad * 2 + 24;

  const ringColor = selected ? GROUP_COLOR : GROUP_COLOR + 'aa';

  return (
    <g>
      {/* Dashed outline */}
      <rect
        x={x} y={y} width={w} height={h} rx="10"
        fill="none"
        stroke={ringColor}
        strokeWidth={selected ? 1.8 : 1.3}
        strokeDasharray="6 4"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
        style={{ filter: (selected && sk.showGlow) ? `drop-shadow(0 0 10px ${GROUP_COLOR})` : 'none' }}
      />

      {/* Clickable title bar area */}
      <g
        onMouseDown={(e) => { e.stopPropagation(); onSelect && onSelect(); }}
        style={{ cursor: 'pointer' }}
      >
        <rect x={x} y={y - 2} width={w} height="22" fill="transparent" pointerEvents="all" />
        <text
          x={x + 12} y={y + 16}
          fill={GROUP_COLOR}
          fontFamily={FONT.cond} fontSize="11" fontWeight="700" letterSpacing="0.22em"
          pointerEvents="none"
        >
          ▾ {group.label}
        </text>
        <text
          x={x + w - 38} y={y + 16}
          fill={T.faint}
          fontFamily={FONT.mono} fontSize="10" fontWeight="700"
          textAnchor="end" letterSpacing="0.1em"
          pointerEvents="none"
        >
          {members.length} NODES
        </text>
      </g>

      {/* Collapse handle */}
      <g
        transform={`translate(${x + w - 26} ${y + 6})`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onToggleCollapse && onToggleCollapse(); }}
        style={{ cursor: 'pointer' }}
      >
        <rect x="-14" y="0" width="14" height="14" rx="2" fill="transparent" pointerEvents="all" />
        <text
          x="-7" y="11"
          fill={GROUP_COLOR}
          fontFamily={FONT.mono} fontSize="11" fontWeight="700"
          textAnchor="middle" pointerEvents="none"
        >
          −
        </text>
      </g>
    </g>
  );
}

// ---------------------------------------------------------------------------
// GroupProxy — collapsed group rendered as a card with external proxy ports
// ---------------------------------------------------------------------------
export function GroupProxy({
  T, scheme, group, proxyData,
  selected, simValues,
  onMouseDown, onSelect, onToggleCollapse,
  onPortDown, onPortUp,
}) {
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;
  if (!proxyData) return null;

  const { x, y, w, h, inEntries, outEntries, memberCount, members } = proxyData;

  // Build member chip strip
  const chipMaxX  = w - 28;
  const chips     = [];
  let   cx_chip   = NODE_PAD;
  const chipY     = 56;
  const dotR      = 3;
  const fontSize  = 10;
  const fontW     = 0.6;

  for (let i = 0; i < (members || []).length; i++) {
    const m   = members[i];
    const lbl = m.label;
    const lw  = dotR * 2 + 5 + lbl.length * fontSize * fontW + 8;
    if (cx_chip + lw + (i < members.length - 1 ? 22 : 0) > chipMaxX) {
      chips.push({ kind: 'more', x: cx_chip, y: chipY, count: members.length - i });
      break;
    }
    chips.push({ kind: 'chip', x: cx_chip, y: chipY, label: lbl, color: CAT_COLORS[m.cat] || T.accent, dotR });
    cx_chip += lw;
  }

  const renderProxyPort = (port, side, i) => {
    const yc = y + GROUP_PROXY_HEADER + NODE_PADDING_Y / 2 + i * GROUP_PROXY_PORT_ROW + GROUP_PROXY_PORT_ROW / 2;
    const xc = side === 'out' ? x + w : x;
    const pColor = PORT_COLORS[port.type] || T.muted;
    const portLiveTrue = port.type === 'bool'
      && simValues && simValues.get
      && simValues.get(port.memberId)?.[port.portId] === true;

    return (
      <g key={side + '-' + port.key}>
        <circle
          cx={xc} cy={yc} r="10" fill="transparent" pointerEvents="all"
          onMouseDown={(e) => { e.stopPropagation(); onPortDown && onPortDown(port.memberId, port.portId, side, port.type, e); }}
          onMouseUp={(e)   => { e.stopPropagation(); onPortUp   && onPortUp(port.memberId, port.portId, side, port.type, e); }}
          style={{ cursor: 'crosshair' }}
        />
        <circle
          cx={xc} cy={yc} r="5"
          fill={pColor} stroke={T.bgPanel} strokeWidth="2"
          pointerEvents="none"
          style={{ filter: (portLiveTrue && sk.showGlow) ? `drop-shadow(0 0 6px ${pColor})` : 'none' }}
        />
        <text
          x={side === 'out' ? xc - NODE_PAD : xc + NODE_PAD}
          y={yc + 3}
          fill={T.text}
          textAnchor={side === 'out' ? 'end' : 'start'}
          fontFamily={FONT.mono} fontSize="10" pointerEvents="none"
        >
          {port.label}
          <tspan fill={T.muted}> · {port.portLabel}</tspan>
        </text>
      </g>
    );
  };

  return (
    <g onMouseDown={(e) => onMouseDown && onMouseDown(e, group)}>
      {/* Card body */}
      <rect
        x={x} y={y} width={w} height={h} rx="8"
        fill={T.bgPanel}
        stroke={selected ? GROUP_COLOR : GROUP_COLOR + 'aa'}
        strokeWidth={selected ? 2 : 1.4}
        style={{
          filter: (selected && sk.showGlow)
            ? `drop-shadow(0 0 14px ${GROUP_COLOR})`
            : sk.showShader
              ? 'drop-shadow(0 6px 12px rgba(0,0,0,0.45))'
              : 'none',
        }}
      />

      {/* Accent top stripe */}
      <rect x={x} y={y} width={w} height="4" rx="8" fill={GROUP_COLOR} />

      {/* Hatched corner motif */}
      <g pointerEvents="none">
        <defs>
          <pattern id={`gp_hatch_${group.id}`} width="6" height="6"
            patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6"
              stroke={GROUP_COLOR} strokeWidth="1" opacity="0.32" />
          </pattern>
        </defs>
        <rect
          x={x + 4} y={y + 8} width="36" height="20" rx="2"
          fill={`url(#gp_hatch_${group.id})`} opacity="0.95"
        />
      </g>

      {/* Title */}
      <text
        x={x + NODE_PAD + 44} y={y + 22}
        fill={T.strong} fontFamily={FONT.sans} fontSize="13" fontWeight="700" letterSpacing="0.06em"
        pointerEvents="none"
      >
        {group.label}
      </text>
      <text
        x={x + NODE_PAD + 44} y={y + 38}
        fill={T.muted} fontFamily={FONT.mono} fontSize="10" letterSpacing="0.1em"
        pointerEvents="none"
      >
        {memberCount} NODES · {inEntries.length} IN · {outEntries.length} OUT
      </text>

      {/* Member chip strip */}
      {chips.map((c, i) =>
        c.kind === 'chip' ? (
          <g key={'chip_' + i} transform={`translate(${x + c.x} ${y + c.y})`} pointerEvents="none">
            <circle cx={c.dotR} cy="0" r={c.dotR} fill={c.color} />
            <text x={c.dotR * 2 + 4} y="3" fill={T.text} fontFamily={FONT.mono} fontSize="10" fontWeight="600">
              {c.label}
            </text>
          </g>
        ) : (
          <text key={'more_' + i}
            x={x + c.x + 2} y={y + c.y + 3}
            fill={T.muted} fontFamily={FONT.mono} fontSize="10" fontWeight="700" pointerEvents="none"
          >
            +{c.count}
          </text>
        )
      )}

      {/* Expand handle */}
      <g
        transform={`translate(${x + w - 26} ${y + 10})`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onToggleCollapse && onToggleCollapse(); }}
        style={{ cursor: 'pointer' }}
      >
        <rect x="0" y="0" width="20" height="20" rx="3" fill={T.bgEl} stroke={T.border} />
        <path d="M5 10 H15 M10 5 V15" stroke={T.muted} strokeWidth="1.6" strokeLinecap="round" fill="none" />
      </g>

      {/* Divider above ports */}
      <line
        x1={x + NODE_PAD} x2={x + w - NODE_PAD}
        y1={y + GROUP_PROXY_HEADER - 4} y2={y + GROUP_PROXY_HEADER - 4}
        stroke={T.border} strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.7"
      />

      {/* Proxy ports */}
      {inEntries.map((p, i) => renderProxyPort(p, 'in', i))}
      {outEntries.map((p, i) => renderProxyPort(p, 'out', i))}
    </g>
  );
}
