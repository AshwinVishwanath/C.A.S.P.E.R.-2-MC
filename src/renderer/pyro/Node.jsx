// Node.jsx — node card rendered as an SVG <g> element
import React from 'react';
import { FONT, SCHEME_PROPS } from '../design/tokens.js';
import { CAT_COLORS, PORT_COLORS } from './types.js';
import { getSpec, isPyro } from './spec.js';
import { nodeHeight, NODE_W, NODE_HEADER, NODE_PORT_ROW, NODE_PADDING_Y, BADGE_H } from './geometry.js';
import { nodeBadge } from './badge.js';

const NODE_PAD = 10;

/**
 * Node — renders a single node card inside the SVG canvas.
 *
 * Props:
 *   T             — theme object
 *   scheme        — active scheme string
 *   node          — node object { id, kind, x, y, params }
 *   selected      — boolean
 *   unreachable   — boolean (amber outline)
 *   simValues     — Map | null
 *   onPortDown    — (nodeId, portId, side, type, event) → void
 *   onPortUp      — (nodeId, portId, side, type, event) → void
 *   onMouseDown   — (event, node) → void
 *   onContextMenu — (event, node) → void
 */
export function Node({
  T, scheme, node,
  selected, unreachable,
  simValues,
  onPortDown, onPortUp,
  onMouseDown, onContextMenu,
}) {
  const spec       = getSpec(node);
  if (!spec) return null;
  const sk         = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;
  const catColor   = CAT_COLORS[spec.cat] || T.accent;
  const h          = nodeHeight(node);
  const w          = NODE_W;
  const badge      = !isPyro(node.kind) ? nodeBadge(node) : null;
  const badgeTop   = NODE_HEADER + 2;

  // Live simulation values for this node
  const nodeValues = simValues && simValues.get ? simValues.get(node.id) : null;
  const livePyro   = isPyro(node.kind) && nodeValues && nodeValues.fire === true;

  // Outline color based on selection / validation state
  let strokeColor = T.border;
  let strokeWidth = 1;
  if (selected)    { strokeColor = T.accent;  strokeWidth = 2; }
  if (unreachable) { strokeColor = T.warn;    strokeWidth = 1.5; }

  // Port rendering helper
  const renderPort = (port, side, i) => {
    const hasBadge  = badge !== null && badge !== undefined;
    const portBaseY = NODE_HEADER + (hasBadge ? BADGE_H : 0) + NODE_PADDING_Y / 2;
    const yc  = portBaseY + i * NODE_PORT_ROW + NODE_PORT_ROW / 2;
    const xc  = side === 'out' ? w : 0;
    const pColor = PORT_COLORS[port.type] || T.muted;
    const portLiveTrue = port.type === 'bool' && nodeValues && nodeValues[port.id] === true;

    return (
      <g key={side + '-' + port.id}>
        {/* Large transparent hit zone */}
        <circle
          cx={xc} cy={yc} r="10"
          fill="transparent"
          pointerEvents="all"
          onMouseDown={(e) => { e.stopPropagation(); onPortDown && onPortDown(node.id, port.id, side, port.type, e); }}
          onMouseUp={(e)   => { e.stopPropagation(); onPortUp   && onPortUp(node.id, port.id, side, port.type, e); }}
          style={{ cursor: 'crosshair' }}
        />
        {/* Visible port dot */}
        <circle
          cx={xc} cy={yc} r="5"
          fill={pColor}
          stroke={T.bgPanel} strokeWidth="2"
          pointerEvents="none"
          style={{ filter: (portLiveTrue && sk.showGlow) ? `drop-shadow(0 0 6px ${pColor})` : 'none' }}
        />
        {/* Port label */}
        <text
          x={side === 'out' ? xc - NODE_PAD : xc + NODE_PAD}
          y={yc + 4}
          fill={T.text}
          textAnchor={side === 'out' ? 'end' : 'start'}
          fontFamily={FONT.mono}
          fontSize="10"
          pointerEvents="none"
        >
          {port.label !== undefined ? (port.label || port.id) : port.id}
        </text>
      </g>
    );
  };

  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      onMouseDown={(e) => onMouseDown && onMouseDown(e, node)}
      onContextMenu={(e) => onContextMenu && onContextMenu(e, node)}
    >
      {/* Card background */}
      <rect
        x="0" y="0" width={w} height={h} rx="6"
        fill={T.bgPanel}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        style={{
          filter: selected && sk.showGlow
            ? `drop-shadow(0 0 12px ${T.accent})`
            : sk.showShader
              ? 'drop-shadow(0 4px 8px rgba(0,0,0,0.35))'
              : 'none',
        }}
      />

      {/* Category color top stripe */}
      <rect x="0" y="0" width={w} height="4" rx="6" fill={catColor} />

      {/* Live pyro fire pulse ring */}
      {livePyro && (
        <rect
          x="0" y="0" width={w} height={h} rx="6"
          fill="none"
          stroke={T.danger}
          strokeWidth="2.5"
          style={{ animation: 'cmcPulse 0.8s infinite' }}
        />
      )}

      {/* Node title — positioned below the 4px category bar with clear padding */}
      <text
        x={NODE_PAD} y={22}
        fill={T.strong}
        fontFamily={FONT.sans}
        fontSize="12"
        fontWeight="700"
        letterSpacing="0.04em"
        dominantBaseline="auto"
        pointerEvents="none"
      >
        {spec.label}
      </text>

      {/* Sub-label */}
      {spec.sub && (
        <text
          x={NODE_PAD} y={NODE_HEADER - 2}
          fill={T.muted}
          fontFamily={FONT.mono}
          fontSize="9"
          dominantBaseline="auto"
          pointerEvents="none"
        >
          {spec.sub}
        </text>
      )}

      {/* Pyro-specific body: divider + ROLE + PULSE rows */}
      {isPyro(node.kind) && (
        <>
          <line
            x1={NODE_PAD} x2={w - NODE_PAD}
            y1={NODE_HEADER + 34} y2={NODE_HEADER + 34}
            stroke={T.border} strokeWidth="1"
            vectorEffect="non-scaling-stroke" opacity="0.7"
          />
          <text x={NODE_PAD} y={NODE_HEADER + 54}
            fill={T.text} fontFamily={FONT.cond} fontSize="11" fontWeight="700" letterSpacing="0.12em">
            ROLE
          </text>
          <text x={w - NODE_PAD} y={NODE_HEADER + 54}
            fill={T.strong} fontFamily={FONT.mono} fontSize="11" fontWeight="700" textAnchor="end">
            {(node.params && node.params.role) || '—'}
          </text>
          <text x={NODE_PAD} y={NODE_HEADER + 74}
            fill={T.text} fontFamily={FONT.cond} fontSize="11" fontWeight="700" letterSpacing="0.12em">
            PULSE
          </text>
          <text x={w - NODE_PAD} y={NODE_HEADER + 74}
            fill={T.strong} fontFamily={FONT.mono} fontSize="11" fontWeight="700" textAnchor="end">
            {(node.params && node.params.duration != null) ? node.params.duration : 1000} ms
          </text>
        </>
      )}

      {/* Config badge */}
      {badge && (
        <g>
          <rect
            x={NODE_PAD} y={badgeTop}
            width={w - NODE_PAD * 2} height={BADGE_H - 4}
            rx="3"
            fill={catColor + '22'} stroke={catColor + '55'} strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={w / 2} y={badgeTop + (BADGE_H - 4) / 2 + 4}
            fill={T.strong}
            fontFamily={FONT.mono} fontSize="11" fontWeight="700"
            letterSpacing="0.08em" textAnchor="middle" pointerEvents="none"
          >
            {badge}
          </text>
        </g>
      )}

      {/* Live value readout during simulation */}
      {!isPyro(node.kind) && nodeValues && nodeValues.v !== undefined && (
        <text
          x={w / 2} y={h - 8}
          fill={T.accent}
          fontFamily={FONT.mono} fontSize="10" fontWeight="700"
          textAnchor="middle" pointerEvents="none"
        >
          {typeof nodeValues.v === 'boolean'
            ? (nodeValues.v ? 'TRUE' : 'false')
            : (typeof nodeValues.v === 'number'
                ? nodeValues.v.toFixed(2)
                : '—')
          }
        </text>
      )}

      {/* Input ports */}
      {spec.inputs.map((p, i) => renderPort(p, 'in', i))}

      {/* Output ports */}
      {spec.outputs.map((p, i) => renderPort(p, 'out', i))}
    </g>
  );
}

export default Node;
