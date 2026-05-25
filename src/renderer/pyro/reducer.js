// reducer.js — Full pyro graph reducer with all 27 actions, undo/redo history
// ---------------------------------------------------------------------------
import { isPyro, getSpec, defaultParamsFor, isCompatible } from "./spec.js";
import { PORT_NAMES } from "./types.js";

// ---------------------------------------------------------------------------
// ID generators
// ---------------------------------------------------------------------------
export function nid() { return "n_" + Math.random().toString(36).slice(2, 9); }
export function eid() { return "e_" + Math.random().toString(36).slice(2, 9); }
export function gid() { return "g_" + Math.random().toString(36).slice(2, 9); }
export function mid() { return "m_" + Math.random().toString(36).slice(2, 9); }

// ---------------------------------------------------------------------------
// nodeFromKind(kind, x, y) — create a fresh node object
// ---------------------------------------------------------------------------
export function nodeFromKind(kind, x, y) {
  return {
    id:     nid(),
    kind,
    label:  null, // UI may set a display label; null means use spec.label
    x, y,
    params: defaultParamsFor(kind),
  };
}

// ---------------------------------------------------------------------------
// History helpers
// snapshot(state) — extract { nodes, edges, groups } WITHOUT past/future/selected
// pushHistory(prevState, nextState)
//   Appends snapshot(prevState) into nextState.past.
//   UNDO pops the most recent past entry and restores it — so prevState must
//   be the state BEFORE the action (the "before" snapshot we want to go back to).
// ---------------------------------------------------------------------------
export function snapshot(s) {
  return {
    nodes:  s.nodes.map(n => ({ ...n, params: { ...n.params } })),
    edges:  s.edges.map(e => ({ ...e })),
    groups: (s.groups || []).map(g => ({ ...g, nodeIds: [...g.nodeIds] })),
  };
}

// prevState: state before the action  — its snapshot goes into history
// nextState: state after the action   — what we return to the caller
function pushHistory(prevState, nextState) {
  const snap = snapshot(prevState);
  const past = [...(prevState.past || []), snap].slice(-50); // keep last 50
  return { ...nextState, past, future: [] };
}

// ---------------------------------------------------------------------------
// Internal: group membership helper
// ---------------------------------------------------------------------------
function groupOf(state, nodeId) {
  return (state.groups || []).find(g => g.nodeIds.includes(nodeId)) || null;
}

// ---------------------------------------------------------------------------
// initialState(seed) — produce a fresh state from a seed graph
//   seed: { nodes, edges } — typically from buildSeedGraph()
//   selected is a Set (not serialised to history snapshots)
// ---------------------------------------------------------------------------
export function initialState(seed) {
  const { nodes, edges } = seed || { nodes: [], edges: [] };
  return {
    nodes,
    edges,
    groups:        [],
    selected:      new Set(),
    selectedEdge:  null,
    selectedGroup: null,
    past:          [],
    future:        [],
  };
}

// ---------------------------------------------------------------------------
// pyroReducer(state, action) — pure reducer, 27 actions
// ---------------------------------------------------------------------------
export function pyroReducer(state, action) {
  switch (action.type) {

    // -------------------------------------------------------------------------
    // ADD_NODE — create node at (x, y), select it, push history
    // -------------------------------------------------------------------------
    case "ADD_NODE": {
      const node = nodeFromKind(action.kind, action.x, action.y);
      const next = {
        ...state,
        nodes:         [...state.nodes, node],
        selected:      new Set([node.id]),
        selectedEdge:  null,
        selectedGroup: null,
      };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // MOVE_NODE — move a single node; no history push (use COMMIT_MOVE)
    // -------------------------------------------------------------------------
    case "MOVE_NODE": {
      return {
        ...state,
        nodes: state.nodes.map(n =>
          n.id === action.id ? { ...n, x: action.x, y: action.y } : n
        ),
      };
    }

    // -------------------------------------------------------------------------
    // MOVE_NODES_BY — move a set of nodes by (dx, dy); no history push
    //   action.ids: Set<nodeId> | nodeId[]
    // -------------------------------------------------------------------------
    case "MOVE_NODES_BY": {
      const ids = action.ids instanceof Set ? action.ids : new Set(action.ids);
      return {
        ...state,
        nodes: state.nodes.map(n =>
          ids.has(n.id) ? { ...n, x: n.x + action.dx, y: n.y + action.dy } : n
        ),
      };
    }

    // -------------------------------------------------------------------------
    // MOVE_NODES_TO — set absolute positions for a set of nodes; no history push
    //   action.positions: { [nodeId]: { x, y } }
    // -------------------------------------------------------------------------
    case "MOVE_NODES_TO": {
      const pos = action.positions;
      return {
        ...state,
        nodes: state.nodes.map(n =>
          pos[n.id] ? { ...n, x: pos[n.id].x, y: pos[n.id].y } : n
        ),
      };
    }

    // -------------------------------------------------------------------------
    // COMMIT_MOVE — push current position state into history (after drag ends)
    // -------------------------------------------------------------------------
    case "COMMIT_MOVE": {
      // We snapshot the state as-is; next state is identical (just records it)
      return pushHistory(state, { ...state });
    }

    // -------------------------------------------------------------------------
    // UPDATE_EDGE_CP — update bezier control point on an edge; no history push
    //   action.id: edgeId
    //   action.which: "cp1" | "cp2"
    //   action.value: { dx, dy }
    // -------------------------------------------------------------------------
    case "UPDATE_EDGE_CP": {
      return {
        ...state,
        edges: state.edges.map(e =>
          e.id === action.id ? { ...e, [action.which]: action.value } : e
        ),
      };
    }

    // -------------------------------------------------------------------------
    // COMMIT_EDGE_CP — push current edge CP state into history
    // -------------------------------------------------------------------------
    case "COMMIT_EDGE_CP": {
      return pushHistory(state, { ...state });
    }

    // -------------------------------------------------------------------------
    // RESET_EDGE_CP — clear custom bezier curve on edge, push history
    // -------------------------------------------------------------------------
    case "RESET_EDGE_CP": {
      const next = {
        ...state,
        edges: state.edges.map(e =>
          e.id === action.id ? { ...e, cp1: undefined, cp2: undefined } : e
        ),
      };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // SELECT — set the node selection; clear edge/group selection
    //   action.ids: nodeId[]
    // -------------------------------------------------------------------------
    case "SELECT": {
      return {
        ...state,
        selected:      new Set(action.ids),
        selectedEdge:  null,
        selectedGroup: null,
      };
    }

    // -------------------------------------------------------------------------
    // SELECT_EDGE — select an edge; clear node/group selection
    // -------------------------------------------------------------------------
    case "SELECT_EDGE": {
      return {
        ...state,
        selected:      new Set(),
        selectedEdge:  action.id,
        selectedGroup: null,
      };
    }

    // -------------------------------------------------------------------------
    // SELECT_GROUP — select a group; clear node/edge selection
    // -------------------------------------------------------------------------
    case "SELECT_GROUP": {
      return {
        ...state,
        selected:      new Set(),
        selectedEdge:  null,
        selectedGroup: action.id,
      };
    }

    // -------------------------------------------------------------------------
    // CREATE_GROUP — group eligible selected non-pyro nodes that aren't in any
    //   existing group. Requires 2+ eligible nodes; else no-op.
    //   action.nodeIds?: explicit list; else uses state.selected
    //   action.label?: override default label
    // -------------------------------------------------------------------------
    case "CREATE_GROUP": {
      const candidates = (action.nodeIds || [...state.selected]).filter(id => {
        const n = state.nodes.find(x => x.id === id);
        return n && !isPyro(n.kind) && !groupOf(state, id);
      });
      if (candidates.length < 2) return state; // no-op
      const id = gid();
      const existingCount = (state.groups || []).length;
      const group = {
        id,
        label:     action.label || `GROUP ${existingCount + 1}`,
        nodeIds:   candidates,
        collapsed: false,
      };
      const next = {
        ...state,
        groups:        [...(state.groups || []), group],
        selected:      new Set(),
        selectedGroup: id,
      };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // UNGROUP — dissolve group (members stay), clear selectedGroup if matched
    // -------------------------------------------------------------------------
    case "UNGROUP": {
      const next = {
        ...state,
        groups:        (state.groups || []).filter(g => g.id !== action.id),
        selectedGroup: state.selectedGroup === action.id ? null : state.selectedGroup,
      };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // TOGGLE_GROUP_COLLAPSED — flip collapsed flag, push history
    // -------------------------------------------------------------------------
    case "TOGGLE_GROUP_COLLAPSED": {
      const next = {
        ...state,
        groups: (state.groups || []).map(g =>
          g.id === action.id ? { ...g, collapsed: !g.collapsed } : g
        ),
      };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // RENAME_GROUP — set group label, push history
    // -------------------------------------------------------------------------
    case "RENAME_GROUP": {
      const next = {
        ...state,
        groups: (state.groups || []).map(g =>
          g.id === action.id ? { ...g, label: action.label } : g
        ),
      };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // MOVE_GROUP_NODES_TO — set absolute positions for all members of a
    //   collapsed group during proxy drag; no history push (use COMMIT_MOVE)
    //   action.positions: { [nodeId]: { x, y } }
    // -------------------------------------------------------------------------
    case "MOVE_GROUP_NODES_TO": {
      const pos = action.positions;
      return {
        ...state,
        nodes: state.nodes.map(n =>
          pos[n.id] ? { ...n, x: pos[n.id].x, y: pos[n.id].y } : n
        ),
      };
    }

    // -------------------------------------------------------------------------
    // INSTANTIATE_MACRO — drop a macro onto the canvas
    //   action.macro: Macro object (from macros.js)
    //   action.x, action.y: drop position (top-left of new group area)
    //   action.collapsed?: boolean (default false)
    // -------------------------------------------------------------------------
    case "INSTANTIATE_MACRO": {
      const { macro, x: dropX, y: dropY, collapsed = false } = action;
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
      const groupId = gid();
      const existingCount = (state.groups || []).length;
      const group = {
        id:        groupId,
        label:     macro.label || `MACRO ${existingCount + 1}`,
        nodeIds:   newNodes.map(n => n.id),
        collapsed,
      };
      const next = {
        ...state,
        nodes:         [...state.nodes, ...newNodes],
        edges:         [...state.edges, ...newEdges],
        groups:        [...(state.groups || []), group],
        selected:      new Set(),
        selectedGroup: groupId,
      };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // ADD_EDGE — connect two ports; one edge per input port (replaces existing)
    // -------------------------------------------------------------------------
    case "ADD_EDGE": {
      // Remove any existing edge that targets the same input port
      const filtered = state.edges.filter(e =>
        !(e.to.node === action.to.node && e.to.port === action.to.port)
      );
      const edge = { id: eid(), from: action.from, to: action.to };
      const next = { ...state, edges: [...filtered, edge] };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // DELETE_SELECTION — context-sensitive delete
    //   If selectedGroup: dissolve group (members stay), push history
    //   Else if selected nodes: remove non-pyro nodes, touching edges,
    //     prune group memberships (drop groups with <2 remaining members)
    //   Also removes selectedEdge if set
    // -------------------------------------------------------------------------
    case "DELETE_SELECTION": {
      if (state.selectedGroup) {
        const next = {
          ...state,
          groups:        (state.groups || []).filter(g => g.id !== state.selectedGroup),
          selectedGroup: null,
        };
        return pushHistory(state, next);
      }
      const ids = state.selected;
      // Keep pyro nodes even if selected; remove others
      const nodes = state.nodes.filter(n => !(ids.has(n.id) && !isPyro(n.kind)));
      // Remove edges touching deleted nodes, and the selected edge
      const edges = state.edges.filter(e =>
        !ids.has(e.from.node) && !ids.has(e.to.node) && e.id !== state.selectedEdge
      );
      // Prune group memberships
      const remainingIds = new Set(nodes.map(n => n.id));
      const groups = (state.groups || [])
        .map(g => ({ ...g, nodeIds: g.nodeIds.filter(id => remainingIds.has(id)) }))
        .filter(g => g.nodeIds.length >= 2);
      const next = {
        ...state,
        nodes, edges, groups,
        selected:      new Set(),
        selectedEdge:  null,
      };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // DELETE_EDGE — remove a specific edge by id, push history
    // -------------------------------------------------------------------------
    case "DELETE_EDGE": {
      const next = {
        ...state,
        edges:        state.edges.filter(e => e.id !== action.id),
        selectedEdge: null,
      };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // UPDATE_PARAM — change a single param on a node, push history
    //   Special cases:
    //   - constant + kind: prune incompatible outgoing edges
    //   - and/or/thresh + count: clamp, prune edges to removed ports
    // -------------------------------------------------------------------------
    case "UPDATE_PARAM": {
      const nodes = state.nodes.map(n =>
        n.id === action.id ? { ...n, params: { ...n.params, [action.key]: action.value } } : n
      );
      let edges = state.edges;
      const updated = nodes.find(n => n.id === action.id);

      // Special: constant type flip — prune outgoing edges that become incompatible
      if (updated && updated.kind === "constant" && action.key === "kind") {
        const newType = action.value === "bool" ? "bool" : "float";
        edges = edges.filter(e => {
          if (e.from.node !== action.id) return true;
          const toN = nodes.find(n => n.id === e.to.node);
          if (!toN) return true;
          const spec = getSpec(toN);
          if (!spec) return true;
          const inPort = spec.inputs.find(p => p.id === e.to.port);
          return !inPort || isCompatible(newType, inPort.type);
        });
      }

      // Special: N-input gate count shrink — prune edges to ports that no longer exist
      if (updated &&
          (updated.kind === "and" || updated.kind === "or" || updated.kind === "thresh") &&
          action.key === "count") {
        // Clamp is already applied via the action value; use it directly
        const validPorts = new Set(PORT_NAMES.slice(0, Math.max(0, action.value)));
        edges = edges.filter(e =>
          e.to.node !== action.id || validPorts.has(e.to.port)
        );
      }

      const next = { ...state, nodes, edges };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // DUPLICATE — clone selected non-pyro nodes (+30,+30 offset), push history
    //   Internal edges between selected nodes are cloned too.
    // -------------------------------------------------------------------------
    case "DUPLICATE": {
      const newNodes = [];
      const idMap = {};
      state.nodes.forEach(n => {
        if (state.selected.has(n.id) && !isPyro(n.kind)) {
          const nn = {
            id:     nid(),
            kind:   n.kind,
            label:  n.label,
            x:      n.x + 30,
            y:      n.y + 30,
            params: { ...n.params },
          };
          idMap[n.id] = nn.id;
          newNodes.push(nn);
        }
      });
      const newEdges = [];
      state.edges.forEach(e => {
        if (idMap[e.from.node] && idMap[e.to.node]) {
          newEdges.push({
            id:   eid(),
            from: { node: idMap[e.from.node], port: e.from.port },
            to:   { node: idMap[e.to.node],   port: e.to.port },
          });
        }
      });
      const next = {
        ...state,
        nodes:    [...state.nodes, ...newNodes],
        edges:    [...state.edges, ...newEdges],
        selected: new Set(newNodes.map(n => n.id)),
      };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // SELECT_ALL — select every node; clear edge/group selection
    // -------------------------------------------------------------------------
    case "SELECT_ALL": {
      return {
        ...state,
        selected:      new Set(state.nodes.map(n => n.id)),
        selectedEdge:  null,
        selectedGroup: null,
      };
    }

    // -------------------------------------------------------------------------
    // CLEAR_CANVAS — keep only the 3 pyro output nodes (reset to blank canvas)
    //   Repositions pyros at a tidy column, clears all edges and groups.
    // -------------------------------------------------------------------------
    case "CLEAR_CANVAS": {
      const pyros = state.nodes
        .filter(n => isPyro(n.kind))
        .map((n, i) => ({ ...n, x: 820, y: 100 + i * 180 }));
      const next = {
        ...state,
        nodes:         pyros,
        edges:         [],
        groups:        [],
        selected:      new Set(),
        selectedEdge:  null,
        selectedGroup: null,
      };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // LOAD — replace graph content from external data, push history
    //   action.nodes, action.edges, action.groups
    // -------------------------------------------------------------------------
    case "LOAD": {
      const next = {
        ...state,
        nodes:         action.nodes || [],
        edges:         action.edges || [],
        groups:        action.groups || [],
        selected:      new Set(),
        selectedEdge:  null,
        selectedGroup: null,
      };
      return pushHistory(state, next);
    }

    // -------------------------------------------------------------------------
    // UNDO — pop most recent snapshot from past; push current onto future
    //   Restores nodes/edges/groups from the saved snapshot.
    //   past stores the state BEFORE each action, so popping restores it.
    // -------------------------------------------------------------------------
    case "UNDO": {
      if (!state.past || state.past.length === 0) return state;
      const last = state.past[state.past.length - 1];
      return {
        // Restore the pre-action snapshot
        nodes:         last.nodes,
        edges:         last.edges,
        groups:        last.groups,
        // Reset transient selection
        selected:      new Set(),
        selectedEdge:  null,
        selectedGroup: null,
        // History management
        past:          state.past.slice(0, -1),
        future:        [snapshot(state), ...(state.future || [])],
      };
    }

    // -------------------------------------------------------------------------
    // REDO — pop first snapshot from future; push current onto past
    // -------------------------------------------------------------------------
    case "REDO": {
      if (!state.future || state.future.length === 0) return state;
      const next = state.future[0];
      return {
        nodes:         next.nodes,
        edges:         next.edges,
        groups:        next.groups,
        selected:      new Set(),
        selectedEdge:  null,
        selectedGroup: null,
        past:          [...(state.past || []), snapshot(state)],
        future:        state.future.slice(1),
      };
    }

    default:
      return state;
  }
}
