// macros.js — loadMacros, saveMacros, serialiseGroupAsMacro, instantiateMacro
// Uses localStorage key "casper_pyro_macros"
// ---------------------------------------------------------------------------
import { getSpec, getPortInfo } from "./spec.js";
import { nid, eid, mid } from "./reducer.js";

const STORAGE_KEY = "casper_pyro_macros";

// ---------------------------------------------------------------------------
// loadMacros() → Macro[]
//   Reads from localStorage. Returns [] on parse failure or missing key.
// ---------------------------------------------------------------------------
export function loadMacros() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// saveMacros(arr: Macro[])
//   Serialises to JSON, writes to localStorage.
// ---------------------------------------------------------------------------
export function saveMacros(arr) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // storage quota exceeded or unavailable — silently ignore
  }
}

// ---------------------------------------------------------------------------
// serialiseGroupAsMacro(group, nodes, edges) → Macro | null
//   group: group object { id, label, nodeIds }
//   nodes: full node array from state
//   edges: full edge array from state
//
// Macro shape:
//   { id, label, nodeCount, catCounts, nodes: [...], edges: [...], createdAt }
//
// nodes entries: { localId, kind, params, dx, dy }
//   dx, dy are offsets from min(x), min(y) corner of the source group.
//
// edges entries: { from: { localId, port }, to: { localId, port }, cp1?, cp2? }
//   Only internal edges (both endpoints inside the group) are stored.
// ---------------------------------------------------------------------------
export function serialiseGroupAsMacro(group, nodes, edges) {
  if (!group) return null;
  const members = group.nodeIds
    .map(id => nodes.find(n => n.id === id))
    .filter(Boolean);
  if (members.length === 0) return null;

  const minX = Math.min(...members.map(n => n.x));
  const minY = Math.min(...members.map(n => n.y));

  const nodeTemplates = members.map(n => ({
    localId: n.id,
    kind:    n.kind,
    params:  JSON.parse(JSON.stringify(n.params || {})),
    dx:      n.x - minX,
    dy:      n.y - minY,
  }));

  const memberSet = new Set(group.nodeIds);
  const internalEdges = edges.filter(
    e => memberSet.has(e.from.node) && memberSet.has(e.to.node)
  );
  const edgeTemplates = internalEdges.map(e => ({
    from: { localId: e.from.node, port: e.from.port },
    to:   { localId: e.to.node,   port: e.to.port },
    ...(e.cp1 ? { cp1: { ...e.cp1 } } : {}),
    ...(e.cp2 ? { cp2: { ...e.cp2 } } : {}),
  }));

  // Count members by category
  const catCounts = members.reduce((acc, n) => {
    const spec = getSpec(n);
    const cat = (spec && spec.cat) ? spec.cat : "INPUTS";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  return {
    id:        mid(),
    label:     group.label || "MACRO",
    nodeCount: members.length,
    catCounts,
    nodes:     nodeTemplates,
    edges:     edgeTemplates,
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// instantiateMacro(macro, dropX, dropY)
//   → { nodes: Node[], edges: Edge[], groupId: string }
//
// Creates fresh IDs for every node and edge. Positions computed from
// macro dx/dy relative offsets added to dropX, dropY.
// Caller is responsible for inserting the returned data into state (e.g.
// via INSTANTIATE_MACRO action — the reducer also calls this pattern directly).
// ---------------------------------------------------------------------------
export function instantiateMacro(macro, dropX, dropY) {
  const idMap = {};
  const newNodes = (macro.nodes || []).map(t => {
    const newId = nid();
    idMap[t.localId] = newId;
    return {
      id:     newId,
      kind:   t.kind,
      label:  null,
      x:      dropX + t.dx,
      y:      dropY + t.dy,
      params: JSON.parse(JSON.stringify(t.params || {})),
    };
  });

  const newEdges = (macro.edges || []).map(t => ({
    id:   eid(),
    from: { node: idMap[t.from.localId], port: t.from.port },
    to:   { node: idMap[t.to.localId],   port: t.to.port },
    ...(t.cp1 ? { cp1: { ...t.cp1 } } : {}),
    ...(t.cp2 ? { cp2: { ...t.cp2 } } : {}),
  }));

  // Return the group id so the caller can form the group object
  const groupId = "g_" + Math.random().toString(36).slice(2, 8);

  return { nodes: newNodes, edges: newEdges, groupId };
}
