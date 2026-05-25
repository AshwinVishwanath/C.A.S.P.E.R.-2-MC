// ir.js — toLogicGraphIR(state) → JSON payload for window.casper.upload_logic
// ---------------------------------------------------------------------------
// Strips all UI-only fields: x, y, label, selection state, history.
// Output must be JSON-serialisable (no Map, Set, or Function values).
// ---------------------------------------------------------------------------

/**
 * toLogicGraphIR(state)
 *
 * Returns:
 *   {
 *     nodes: [{ id, kind, params }],
 *     edges: [{ id, from: { node, port }, to: { node, port } }],
 *   }
 *
 * The caller passes this to window.casper.upload_logic(graph).
 */
export function toLogicGraphIR(state) {
  const nodes = (state.nodes || []).map(n => ({
    id:     n.id,
    kind:   n.kind,
    params: JSON.parse(JSON.stringify(n.params || {})), // deep copy, ensures serialisability
  }));

  const edges = (state.edges || []).map(e => ({
    id:   e.id,
    from: { node: e.from.node, port: e.from.port },
    to:   { node: e.to.node,   port: e.to.port },
  }));

  return { nodes, edges };
}
