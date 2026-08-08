// ir.js — toLogicGraphIR(state) → JSON payload for window.casper.upload_logic
// ---------------------------------------------------------------------------
// Strips all UI-only fields: x, y, label, selection state, history.
// Output must be JSON-serialisable (no Map, Set, or Function values).
// ---------------------------------------------------------------------------

/**
 * toLogicGraphIR(state, opts)
 *
 * @param {object} state - pyro reducer state (nodes/edges).
 * @param {{ mode?: 'off' | 'shadow' | 'active' }} [opts] - program authority
 *   mode (docs/specs/MC_FC_ALIGNMENT.md §13a). Omitted/undefined → the
 *   compiler defaults to 'off' (safe default, matches pre-Window-2 behaviour).
 *
 * Returns:
 *   {
 *     nodes: [{ id, kind, params }],
 *     edges: [{ id, from: { node, port }, to: { node, port } }],
 *     mode: 'off' | 'shadow' | 'active' | undefined,
 *   }
 *
 * The caller passes this to window.casper.upload_logic(graph).
 */
export function toLogicGraphIR(state, opts) {
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

  return { nodes, edges, mode: opts && opts.mode ? opts.mode : 'off' };
}
