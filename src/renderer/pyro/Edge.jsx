// Edge.jsx — bezier edge with tangent handles, flow animation, cycle styling
import React from 'react';
import { FONT } from '../design/tokens.js';
import { PORT_COLORS } from './types.js';
import { getPortInfo } from './spec.js';
import { outputPortPos, inputPortPos } from './geometry.js';

/**
 * Edge
 *
 * Props:
 *   T          — theme object
 *   scheme     — active scheme string
 *   edge       — edge object { id, from: {node,port}, to: {node,port}, cp1?, cp2? }
 *   nodes      — full nodes array (used to resolve port positions when p1/p2 not provided)
 *   selected   — boolean
 *   simValues  — Map<nodeId, {[portId]: value}> | null
 *   isCycle    — boolean (draw in danger color)
 *   onCpDown   — (edgeId, "cp1"|"cp2", mouseEvent) → void
 *   onSelect   — () → void
 *   onDelete   — () → void
 *   // Overrides (for use when caller pre-computes positions, e.g. proxy edges):
 *   p1         — { x, y } optional override for from-port position
 *   p2         — { x, y } optional override for to-port position
 *   edgeType   — string override for port type (used when p1/p2 are overridden)
 *   edgeColor  — string override for edge color
 *   showGlow   — boolean (from scheme props)
 */
export function Edge({
  T, scheme, edge, nodes,
  selected, simValues, isCycle,
  onCpDown, onSelect, onDelete,
  p1: p1Ovr, p2: p2Ovr, edgeType: edgeTypeOvr, edgeColor: edgeColorOvr,
  showGlow = false,
}) {
  let p1, p2, outPortType, portColor;

  if (p1Ovr && p2Ovr) {
    p1 = p1Ovr;
    p2 = p2Ovr;
    outPortType = edgeTypeOvr;
    portColor = edgeColorOvr || PORT_COLORS[edgeTypeOvr] || T.muted;
  } else {
    const fromN = nodes && nodes.find((n) => n.id === edge.from.node);
    const toN   = nodes && nodes.find((n) => n.id === edge.to.node);
    if (!fromN || !toN) return null;

    const { port: outPort } = getPortInfo(fromN, edge.from.port, 'out');
    const { port: inPort  } = getPortInfo(toN,   edge.to.port,   'in');
    if (!outPort || !inPort) return null;

    p1 = outputPortPos(fromN, edge.from.port);
    p2 = inputPortPos(toN, edge.to.port);
    outPortType = outPort.type;
    portColor = PORT_COLORS[outPortType] || T.muted;
  }

  // Horizontal bezier tangents
  const defaultBend = Math.max(40, Math.abs(p2.x - p1.x) * 0.5);
  const c1dx = edge.cp1 != null ? edge.cp1.dx : defaultBend;
  const c1dy = edge.cp1 != null ? edge.cp1.dy : 0;
  const c2dx = edge.cp2 != null ? edge.cp2.dx : -defaultBend;
  const c2dy = edge.cp2 != null ? edge.cp2.dy : 0;

  const c1 = { x: p1.x + c1dx, y: p1.y + c1dy };
  const c2 = { x: p2.x + c2dx, y: p2.y + c2dy };
  const d  = `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;

  const color = isCycle ? T.danger : portColor;
  const live  = outPortType === 'bool' && simValues != null
    && simValues.get && simValues.get(edge.from.node)?.[edge.from.port] === true;

  const customCurve = !!(edge.cp1 || edge.cp2);

  const handleClick = (e) => {
    if (e.metaKey || e.ctrlKey) {
      e.stopPropagation();
      onDelete && onDelete();
    } else {
      e.stopPropagation();
      onSelect && onSelect();
    }
  };

  return (
    <g>
      {/* Glow underlay when selected or live */}
      {(selected || live) && (
        <path
          d={d}
          stroke={color}
          strokeWidth={selected ? 6 : 4}
          fill="none"
          opacity={selected ? 0.28 : 0.22}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          style={{ filter: showGlow ? `drop-shadow(0 0 4px ${color})` : 'none' }}
        />
      )}

      {/* Wide transparent hit target */}
      <path
        d={d}
        stroke="transparent"
        strokeWidth="14"
        fill="none"
        style={{ cursor: 'pointer' }}
        onClick={handleClick}
      />

      {/* Main wire */}
      <path
        d={d}
        stroke={color}
        strokeWidth={selected ? 2.4 : 1.8}
        fill="none"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeDasharray={live ? '6 4' : 'none'}
        pointerEvents="none"
        style={{
          filter: (live && showGlow) ? `drop-shadow(0 0 6px ${color})` : 'none',
          animation: live ? 'edgeFlow 0.6s linear infinite' : 'none',
        }}
      />

      {/* Terminal dots when selected or live */}
      {(selected || live) && (
        <>
          <circle cx={p1.x} cy={p1.y} r="3" fill={color} pointerEvents="none" />
          <circle cx={p2.x} cy={p2.y} r="3" fill={color} pointerEvents="none" />
        </>
      )}

      {/* Bezier tangent handles — visible when selected */}
      {selected && (
        <>
          <line
            x1={p1.x} y1={p1.y} x2={c1.x} y2={c1.y}
            stroke={T.muted} strokeWidth="1" strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke" pointerEvents="none" opacity="0.85"
          />
          <line
            x1={p2.x} y1={p2.y} x2={c2.x} y2={c2.y}
            stroke={T.muted} strokeWidth="1" strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke" pointerEvents="none" opacity="0.85"
          />

          {/* CP1 diamond handle */}
          <g
            transform={`translate(${c1.x} ${c1.y}) rotate(45)`}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onCpDown && onCpDown(edge.id, 'cp1', e); }}
            style={{ cursor: 'grab' }}
          >
            <rect x="-9" y="-9" width="18" height="18" fill="transparent" pointerEvents="all" />
            <rect
              x="-5" y="-5" width="10" height="10"
              fill={T.bgPanel} stroke={color} strokeWidth="2"
              vectorEffect="non-scaling-stroke" pointerEvents="none"
              style={{ filter: showGlow ? `drop-shadow(0 0 4px ${color})` : 'none' }}
            />
          </g>

          {/* CP2 diamond handle */}
          <g
            transform={`translate(${c2.x} ${c2.y}) rotate(45)`}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onCpDown && onCpDown(edge.id, 'cp2', e); }}
            style={{ cursor: 'grab' }}
          >
            <rect x="-9" y="-9" width="18" height="18" fill="transparent" pointerEvents="all" />
            <rect
              x="-5" y="-5" width="10" height="10"
              fill={T.bgPanel} stroke={color} strokeWidth="2"
              vectorEffect="non-scaling-stroke" pointerEvents="none"
              style={{ filter: showGlow ? `drop-shadow(0 0 4px ${color})` : 'none' }}
            />
          </g>

          {/* Custom curve label at midpoint */}
          {customCurve && (
            <text
              x={(p1.x + p2.x) / 2} y={(p1.y + p2.y) / 2 - 6}
              fill={T.muted} fontFamily={FONT.mono} fontSize="8"
              textAnchor="middle" pointerEvents="none" letterSpacing="0.18em"
            >
              ◆ CUSTOM
            </text>
          )}
        </>
      )}
    </g>
  );
}

export default Edge;
