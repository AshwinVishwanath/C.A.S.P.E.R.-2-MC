// validate.js — validateGraph(state) → { cycleEdges, unreachable, channels, stats }
// ---------------------------------------------------------------------------
import { isPyro } from "./spec.js";

// DFS colour constants
const WHITE = 0, GRAY = 1, BLACK = 2;

// State-gate node kinds — presence upstream means there is a flight-state guard
const STATE_GATE_KINDS = new Set(["fsm_is", "fsm_in", "past_pad", "fsm_event"]);

// ---------------------------------------------------------------------------
// validateGraph(state)
// ---------------------------------------------------------------------------
export function validateGraph(state) {
  const { nodes, edges } = state;

  // Build adjacency lists (forward and reverse)
  const adj     = new Map(nodes.map(n => [n.id, []]));
  const revAdj  = new Map(nodes.map(n => [n.id, []]));

  edges.forEach(e => {
    if (adj.has(e.from.node))    adj.get(e.from.node).push(e.to.node);
    if (revAdj.has(e.to.node)) revAdj.get(e.to.node).push(e.from.node);
  });

  // ------------------------------------------------------------------
  // 1. Cycle detection — DFS colouring
  // ------------------------------------------------------------------
  const cycleEdges = new Set();
  const color = new Map(nodes.map(n => [n.id, WHITE]));

  function dfs(u) {
    color.set(u, GRAY);
    for (const v of (adj.get(u) || [])) {
      if (color.get(v) === GRAY) {
        // back-edge u→v — mark all edges u→v as cycle edges
        edges.forEach(e => {
          if (e.from.node === u && e.to.node === v) cycleEdges.add(e.id);
        });
      } else if (color.get(v) === WHITE) {
        dfs(v);
      }
    }
    color.set(u, BLACK);
  }
  nodes.forEach(n => { if (color.get(n.id) === WHITE) dfs(n.id); });

  // ------------------------------------------------------------------
  // 2. Reachability — reverse-BFS from each pyro output
  //    Any non-pyro node not in the reachable set is unreachable.
  // ------------------------------------------------------------------
  const reachable = new Set();

  function rdfs(u) {
    if (reachable.has(u)) return;
    reachable.add(u);
    for (const v of (revAdj.get(u) || [])) rdfs(v);
  }

  nodes.filter(n => isPyro(n.kind)).forEach(p => rdfs(p.id));

  const unreachable = new Set(
    nodes.filter(n => !isPyro(n.kind) && !reachable.has(n.id)).map(n => n.id)
  );

  // ------------------------------------------------------------------
  // 3. Per-channel analysis
  //    - driven: at least one edge targets the pyro's "fire" port
  //    - hasStateGate: any ancestor has kind in STATE_GATE_KINDS
  //    - warnings: collected string messages
  // ------------------------------------------------------------------
  const channels = nodes.filter(n => isPyro(n.kind)).map((n, idx) => {
    const driven = edges.some(e => e.to.node === n.id);

    // Walk upstream from this pyro
    const seen = new Set();
    let hasStateGate = false;
    function walk(u) {
      if (seen.has(u)) return;
      seen.add(u);
      const nu = nodes.find(x => x.id === u);
      if (nu && STATE_GATE_KINDS.has(nu.kind)) hasStateGate = true;
      for (const v of (revAdj.get(u) || [])) walk(v);
    }
    walk(n.id);

    const warnings = [];
    if (driven && !hasStateGate) {
      warnings.push("No flight-state guard — may fire on pad.");
    }

    const chNum = idx + 1;
    return {
      id:           n.id,
      label:        `CH${chNum}`,
      driven,
      hasStateGate,
      warnings,
    };
  });

  // ------------------------------------------------------------------
  // 4. Stats
  // ------------------------------------------------------------------
  const errorCount   = cycleEdges.size + channels.filter(c => !c.driven).length;
  const warningCount = channels.reduce((s, c) => s + c.warnings.length, 0)
                     + unreachable.size;

  const stats = {
    nodes:    nodes.length,
    edges:    edges.length,
    groups:   (state.groups || []).length,
    errors:   errorCount,
    warnings: warningCount,
  };

  return { cycleEdges, unreachable, channels, stats };
}
