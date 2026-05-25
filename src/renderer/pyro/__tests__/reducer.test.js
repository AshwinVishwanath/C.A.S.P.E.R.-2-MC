// reducer.test.js — Sanity tests for the pyro logic graph data model
// Run via: npm test   (vitest run)
// ---------------------------------------------------------------------------
import { describe, it, expect } from "vitest";
import { buildSeedGraph } from "../seed.js";
import { pyroReducer, initialState, snapshot } from "../reducer.js";
import { toLogicGraphIR } from "../ir.js";
import { isPyro } from "../spec.js";

// ---------------------------------------------------------------------------
// Helper: build the starting state from the seed graph
// ---------------------------------------------------------------------------
function makeSeedState() {
  const seed = buildSeedGraph();
  return initialState(seed);
}

// ---------------------------------------------------------------------------
// Test 1: Seed graph structure
// ---------------------------------------------------------------------------
describe("buildSeedGraph", () => {
  it("produces exactly 7 nodes and 4 edges", () => {
    const seed = buildSeedGraph();
    expect(seed.nodes).toHaveLength(7);
    expect(seed.edges).toHaveLength(4);
  });

  it("has exactly 3 pyro output nodes", () => {
    const seed = buildSeedGraph();
    const pyros = seed.nodes.filter(n => isPyro(n.kind));
    expect(pyros).toHaveLength(3);
    expect(pyros.map(p => p.kind).sort()).toEqual(["pyro_1", "pyro_2", "pyro_3"]);
  });

  it("includes fsm_event, hold, fsm_in, and nodes", () => {
    const seed = buildSeedGraph();
    const kinds = seed.nodes.map(n => n.kind);
    expect(kinds).toContain("fsm_event");
    expect(kinds).toContain("hold");
    expect(kinds).toContain("fsm_in");
    expect(kinds).toContain("and");
  });
});

// ---------------------------------------------------------------------------
// Test 2: ADD_NODE
// ---------------------------------------------------------------------------
describe("ADD_NODE action", () => {
  it("adds a node and selects it", () => {
    const state = makeSeedState();
    const next = pyroReducer(state, { type: "ADD_NODE", kind: "vel", x: 100, y: 100 });
    expect(next.nodes).toHaveLength(8);
    const added = next.nodes.find(n => n.kind === "vel");
    expect(added).toBeDefined();
    expect(next.selected.has(added.id)).toBe(true);
  });

  it("pushes to history on ADD_NODE", () => {
    const state = makeSeedState();
    const next = pyroReducer(state, { type: "ADD_NODE", kind: "not", x: 50, y: 50 });
    expect(next.past.length).toBeGreaterThan(state.past.length);
  });

  it("does NOT add label (null)", () => {
    const state = makeSeedState();
    const next = pyroReducer(state, { type: "ADD_NODE", kind: "and", x: 0, y: 0 });
    const added = next.nodes.find(n => n.kind === "and" && next.selected.has(n.id));
    expect(added).toBeDefined();
    expect(added.label).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 3: DELETE_SELECTION on a pyro node — must be a no-op for that pyro
// ---------------------------------------------------------------------------
describe("DELETE_SELECTION — pyro protection", () => {
  it("cannot delete pyro_1 via DELETE_SELECTION", () => {
    const state = makeSeedState();
    const pyro1 = state.nodes.find(n => n.kind === "pyro_1");
    expect(pyro1).toBeDefined();

    // Select pyro_1
    const selected = pyroReducer(state, { type: "SELECT", ids: [pyro1.id] });
    // Attempt delete
    const deleted = pyroReducer(selected, { type: "DELETE_SELECTION" });

    // pyro_1 must still be present
    const stillHere = deleted.nodes.find(n => n.kind === "pyro_1");
    expect(stillHere).toBeDefined();
    expect(stillHere.id).toBe(pyro1.id);
  });

  it("can delete a non-pyro node", () => {
    const state = makeSeedState();
    const nonPyro = state.nodes.find(n => !isPyro(n.kind));
    const selected = pyroReducer(state, { type: "SELECT", ids: [nonPyro.id] });
    const deleted = pyroReducer(selected, { type: "DELETE_SELECTION" });
    expect(deleted.nodes.find(n => n.id === nonPyro.id)).toBeUndefined();
  });

  it("removes edges connected to deleted node", () => {
    const state = makeSeedState();
    // The fsm_event node has an outgoing edge to hold
    const apoNode = state.nodes.find(n => n.kind === "fsm_event");
    const edgeBefore = state.edges.filter(
      e => e.from.node === apoNode.id || e.to.node === apoNode.id
    );
    expect(edgeBefore.length).toBeGreaterThan(0);

    const selected = pyroReducer(state, { type: "SELECT", ids: [apoNode.id] });
    const deleted  = pyroReducer(selected, { type: "DELETE_SELECTION" });

    const edgesAfter = deleted.edges.filter(
      e => e.from.node === apoNode.id || e.to.node === apoNode.id
    );
    expect(edgesAfter).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4: UNDO / REDO round-trip
// ---------------------------------------------------------------------------
describe("UNDO / REDO", () => {
  it("UNDO restores node count after ADD_NODE", () => {
    const state  = makeSeedState();
    const after  = pyroReducer(state, { type: "ADD_NODE", kind: "not", x: 0, y: 0 });
    expect(after.nodes).toHaveLength(8);

    const undone = pyroReducer(after, { type: "UNDO" });
    expect(undone.nodes).toHaveLength(7);
  });

  it("REDO re-applies the action", () => {
    const state  = makeSeedState();
    const after  = pyroReducer(state, { type: "ADD_NODE", kind: "abs", x: 0, y: 0 });
    const undone = pyroReducer(after, { type: "UNDO" });
    const redone = pyroReducer(undone, { type: "REDO" });
    expect(redone.nodes).toHaveLength(8);
  });

  it("UNDO is a no-op when past is empty", () => {
    const state  = makeSeedState();
    expect(state.past).toHaveLength(0);
    const unchanged = pyroReducer(state, { type: "UNDO" });
    expect(unchanged.nodes).toHaveLength(7);
    expect(unchanged.past).toHaveLength(0);
  });

  it("REDO is a no-op when future is empty", () => {
    const state    = makeSeedState();
    const unchanged = pyroReducer(state, { type: "REDO" });
    expect(unchanged.nodes).toHaveLength(7);
  });

  it("multiple UNDO/REDO round-trips preserve 3 pyro nodes", () => {
    let state = makeSeedState();
    // Add two nodes
    state = pyroReducer(state, { type: "ADD_NODE", kind: "or",  x: 10, y: 10 });
    state = pyroReducer(state, { type: "ADD_NODE", kind: "xor", x: 20, y: 20 });
    // Undo both
    state = pyroReducer(state, { type: "UNDO" });
    state = pyroReducer(state, { type: "UNDO" });
    // Should be back to 7 nodes
    expect(state.nodes).toHaveLength(7);
    // Redo both
    state = pyroReducer(state, { type: "REDO" });
    state = pyroReducer(state, { type: "REDO" });
    expect(state.nodes).toHaveLength(9);
    // Pyros must always be present
    const pyros = state.nodes.filter(n => isPyro(n.kind));
    expect(pyros).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Test 5: toLogicGraphIR produces JSON-serialisable object
// ---------------------------------------------------------------------------
describe("toLogicGraphIR", () => {
  it("produces an object with exactly 7 nodes and 4 edges from seed graph", () => {
    const seed  = buildSeedGraph();
    const state = initialState(seed);
    const ir    = toLogicGraphIR(state);

    expect(ir.nodes).toHaveLength(7);
    expect(ir.edges).toHaveLength(4);
  });

  it("IR nodes only have { id, kind, params } — no x, y, label, selected", () => {
    const seed  = buildSeedGraph();
    const state = initialState(seed);
    const ir    = toLogicGraphIR(state);

    ir.nodes.forEach(n => {
      expect(Object.keys(n).sort()).toEqual(["id", "kind", "params"].sort());
    });
  });

  it("IR edges only have { id, from, to } — no cp1, cp2", () => {
    const seed  = buildSeedGraph();
    const state = initialState(seed);
    const ir    = toLogicGraphIR(state);

    ir.edges.forEach(e => {
      // cp1 / cp2 should be absent (undefined values not serialised)
      expect(e.cp1).toBeUndefined();
      expect(e.cp2).toBeUndefined();
      expect(e.from).toBeDefined();
      expect(e.to).toBeDefined();
    });
  });

  it("round-trips cleanly through JSON serialisation", () => {
    const seed  = buildSeedGraph();
    const state = initialState(seed);
    const ir    = toLogicGraphIR(state);

    const serialised   = JSON.stringify(ir);
    const deserialised = JSON.parse(serialised);

    expect(deserialised.nodes).toHaveLength(7);
    expect(deserialised.edges).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// Test 6: History snapshot does not include past/future
// ---------------------------------------------------------------------------
describe("snapshot()", () => {
  it("snapshot contains nodes, edges, groups but not past/future", () => {
    const state = makeSeedState();
    const snap  = snapshot(state);
    expect(snap.nodes).toBeDefined();
    expect(snap.edges).toBeDefined();
    expect(snap.groups).toBeDefined();
    expect(snap.past).toBeUndefined();
    expect(snap.future).toBeUndefined();
    expect(snap.selected).toBeUndefined();
  });
});
