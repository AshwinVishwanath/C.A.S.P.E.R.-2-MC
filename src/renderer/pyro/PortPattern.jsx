// PortPattern.jsx — tiny SVG port-type preview shown in Palette item cards
import React from 'react';
import { PORT_COLORS } from './types.js';

/**
 * PortPattern — renders a small SVG showing input (left) and output (right)
 * port dots colored by their type. Used in palette cards.
 *
 * @param {{ spec: { inputs: Array, outputs: Array } }} props
 */
export function PortPattern({ spec }) {
  const ins  = (spec && spec.inputs)  || [];
  const outs = (spec && spec.outputs) || [];
  const rows = Math.max(ins.length, outs.length, 1);
  const h    = Math.max(14, rows * 6 + 4);

  return (
    <svg width="22" height={h} viewBox={`0 0 22 ${h}`} style={{ flexShrink: 0 }}>
      {ins.map((p, i) => (
        <circle
          key={"in-" + i}
          cx="2"
          cy={3 + i * 6}
          r="1.8"
          fill={PORT_COLORS[p.type] || '#888'}
        />
      ))}
      {outs.map((p, i) => (
        <circle
          key={"out-" + i}
          cx="20"
          cy={3 + i * 6}
          r="1.8"
          fill={PORT_COLORS[p.type] || '#888'}
        />
      ))}
    </svg>
  );
}

export default PortPattern;
