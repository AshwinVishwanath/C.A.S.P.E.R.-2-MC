// geometry.js — Node size, port positions, group-proxy geometry helpers
// ---------------------------------------------------------------------------
import { getSpec, isPyro, getPortInfo } from "./spec.js";

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------
export const NODE_W             = 200;
export const NODE_HEADER        = 26;   // header bar height (px)
export const NODE_PORT_ROW      = 22;   // height per port row
export const NODE_PADDING_Y     = 12;   // total vertical padding inside body
export const GRID               = 20;   // snap grid step (px)

export const GROUP_PROXY_W      = 260;
export const GROUP_PROXY_HEADER = 76;   // title + counts + chip strip height
export const GROUP_PROXY_PORT_ROW = 22;

export const GROUP_PADDING      = 18;   // extra box padding around expanded members
export const GROUP_COLOR        = "oklch(74% 0.16 340)"; // magenta — distinct from category accents

// Badge (text stamp inside node body)
export const BADGE_H = 24;

// ---------------------------------------------------------------------------
// snapToGrid(v, on) — round v to nearest GRID step when on=true
// ---------------------------------------------------------------------------
export function snapToGrid(v, on = true) {
  return on ? Math.round(v / GRID) * GRID : v;
}

// ---------------------------------------------------------------------------
// nodeHeight(node) — total node card height in px
//   formula: NODE_HEADER + max(inputs, outputs) * PORT_ROW + NODE_PADDING_Y
//   pyro nodes get extra rows for ROLE + PULSE display
// ---------------------------------------------------------------------------
export function nodeHeight(node) {
  const spec = getSpec(node) || { inputs: [], outputs: [] };
  const rows = Math.max(
    (spec.inputs  && spec.inputs.length)  || 0,
    (spec.outputs && spec.outputs.length) || 0,
  );
  let body = Math.max(1, rows) * NODE_PORT_ROW + NODE_PADDING_Y;
  if (isPyro(node.kind)) {
    body += 64; // divider + ROLE row + PULSE row (matches design reference)
  } else if (_nodeBadge(node)) {
    body += BADGE_H;
  }
  return NODE_HEADER + body;
}

// Internal badge helper — mirrors pyro-graph.jsx nodeBadge() just enough
// to know whether a badge is present (for height calculation).
function _nodeBadge(node) {
  if (isPyro(node.kind)) return null;
  const k = node.kind;
  const p = node.params || {};
  switch (k) {
    case "and": case "or": case "not": case "xor":
    case "cmp": case "thresh": case "edge":
    case "delay": case "hold": case "pulse":
    case "lowpass": case "add": case "sub":
    case "mul": case "div": case "min": case "max":
    case "abs": case "fsm_is": case "fsm_in": case "fsm_event":
    case "constant": case "altitude": case "continuity": case "armed":
    case "past_pad": case "test_mode": case "motor_num":
      return true; // badge always present for these kinds
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// inputPortPos(node, portId) — {x,y} of an input port in canvas coords
// outputPortPos(node, portId) — {x,y} of an output port in canvas coords
// ---------------------------------------------------------------------------
export function inputPortPos(node, portId) {
  return _portPos(node, "in", portId);
}

export function outputPortPos(node, portId) {
  return _portPos(node, "out", portId);
}

function _portPos(node, side, portId) {
  const { idx } = getPortInfo(node, portId, side);
  if (idx < 0) return { x: node.x, y: node.y };
  // Badge offset: if node has a badge, port rows start further down
  const hasBadge = !isPyro(node.kind) && _nodeBadge(node);
  const badgeOffset = hasBadge ? BADGE_H : 0;
  const portBaseY = NODE_HEADER + badgeOffset + NODE_PADDING_Y / 2;
  const yc = node.y + portBaseY + idx * NODE_PORT_ROW + NODE_PORT_ROW / 2;
  const xc = side === "out" ? node.x + NODE_W : node.x;
  return { x: xc, y: yc };
}

// ---------------------------------------------------------------------------
// groupBBox(group, nodes) — bounding box of the expanded group dashed rect
//   returns { x, y, w, h } with GROUP_PADDING applied
// ---------------------------------------------------------------------------
export function groupBBox(group, nodes) {
  const members = group.nodeIds
    .map(id => nodes.find(n => n.id === id))
    .filter(Boolean);
  if (members.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = members.flatMap(n => [n.x, n.x + NODE_W]);
  const ys = members.flatMap(n => [n.y, n.y + nodeHeight(n)]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    x: minX - GROUP_PADDING,
    y: minY - GROUP_PADDING - 24, // room for title bar
    w: (maxX - minX) + GROUP_PADDING * 2,
    h: (maxY - minY) + GROUP_PADDING * 2 + 24,
  };
}

// ---------------------------------------------------------------------------
// collapsedProxyPos(group, nodes) — top-left {x,y} of collapsed proxy box
// ---------------------------------------------------------------------------
export function collapsedProxyPos(group, nodes) {
  const pd = groupProxyData(group, nodes, []);
  return { x: pd.x, y: pd.y };
}

// ---------------------------------------------------------------------------
// groupProxyData(group, nodes, edges)
//   Returns all geometry + port info needed to render a collapsed group proxy.
//   { bbox, x, y, w, h, inEntries, outEntries, memberCount, members }
//
//   Each entry: { key, side, type, label, portLabel, memberId, portId }
// ---------------------------------------------------------------------------
export function groupProxyData(group, nodes, edges) {
  const members = group.nodeIds
    .map(id => nodes.find(n => n.id === id))
    .filter(Boolean);
  if (members.length === 0) return null;

  const xs = members.flatMap(n => [n.x, n.x + NODE_W]);
  const ys = members.flatMap(n => [n.y, n.y + nodeHeight(n)]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const memberSet = new Set(group.nodeIds);
  const inEntries  = [];
  const outEntries = [];
  const seenIn  = new Set();
  const seenOut = new Set();

  edges.forEach(e => {
    const fromIn = memberSet.has(e.from.node);
    const toIn   = memberSet.has(e.to.node);
    if (!fromIn && toIn) {
      const key = `${e.to.node}__${e.to.port}`;
      if (!seenIn.has(key)) {
        seenIn.add(key);
        const m = members.find(n => n.id === e.to.node);
        const { port: portSpec } = getPortInfo(m, e.to.port, "in");
        if (portSpec) {
          inEntries.push({
            key,
            side:      "in",
            type:      portSpec.type,
            label:     _shortLabel(m),
            portLabel: portSpec.label || portSpec.id,
            memberId:  e.to.node,
            portId:    e.to.port,
          });
        }
      }
    } else if (fromIn && !toIn) {
      const key = `${e.from.node}__${e.from.port}`;
      if (!seenOut.has(key)) {
        seenOut.add(key);
        const m = members.find(n => n.id === e.from.node);
        const { port: portSpec } = getPortInfo(m, e.from.port, "out");
        if (portSpec) {
          outEntries.push({
            key,
            side:      "out",
            type:      portSpec.type,
            label:     _shortLabel(m),
            portLabel: portSpec.label || portSpec.id,
            memberId:  e.from.node,
            portId:    e.from.port,
          });
        }
      }
    }
  });

  const w = GROUP_PROXY_W;
  const rows = Math.max(1, inEntries.length, outEntries.length);
  const h = GROUP_PROXY_HEADER + (NODE_PADDING_Y / 2) * 2 + rows * GROUP_PROXY_PORT_ROW;

  const memberInfo = members.map(n => {
    const spec = getSpec(n);
    return { id: n.id, label: spec ? spec.label : n.kind, cat: spec ? spec.cat : "INPUTS" };
  });

  return {
    bbox: { minX, minY, maxX, maxY, cx, cy },
    x: cx - w / 2,
    y: cy - h / 2,
    w, h,
    inEntries, outEntries,
    memberCount: members.length,
    members: memberInfo,
  };
}

// ---------------------------------------------------------------------------
// proxyPortPos(group, nodes, entry) — {x,y} for a proxy port slot
//   entry must be one of the objects from groupProxyData().inEntries / .outEntries
// ---------------------------------------------------------------------------
export function proxyPortPos(group, nodes, entry) {
  const pd = groupProxyData(group, nodes, []); // edges not needed for position
  if (!pd) return { x: 0, y: 0 };
  return _proxyPortPosFromPd(pd, entry.key, entry.side);
}

// Internal: compute position from pre-computed proxy data object
export function proxyPortPosFromPd(pd, key, side) {
  return _proxyPortPosFromPd(pd, key, side);
}

function _proxyPortPosFromPd(pd, key, side) {
  const list = side === "in" ? pd.inEntries : pd.outEntries;
  const idx = list.findIndex(p => p.key === key);
  if (idx < 0) return { x: pd.x + pd.w / 2, y: pd.y + pd.h / 2 };
  const pad = NODE_PADDING_Y / 2;
  return {
    x: side === "out" ? pd.x + pd.w : pd.x,
    y: pd.y + GROUP_PROXY_HEADER + pad + idx * GROUP_PROXY_PORT_ROW + GROUP_PROXY_PORT_ROW / 2,
  };
}

// ---------------------------------------------------------------------------
// _shortLabel(node) — brief readable name for a node
// ---------------------------------------------------------------------------
function _shortLabel(node) {
  const spec = getSpec(node);
  return (spec && spec.label) ? spec.label : node.kind;
}
