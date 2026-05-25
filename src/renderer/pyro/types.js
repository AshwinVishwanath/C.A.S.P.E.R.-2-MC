// types.js — Node spec catalog, port types, FSM states, category metadata
// Faithfully ported from design-package/project/src/pyro-graph.jsx
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FSM states
// ---------------------------------------------------------------------------
export const FSM_STATES = [
  "PAD", "BOOST", "COAST", "COAST_1", "SUSTAIN", "COAST_2",
  "APOGEE", "DROGUE", "MAIN", "RECOVERY", "TUMBLE", "LANDED",
];

// ---------------------------------------------------------------------------
// Port types
// ---------------------------------------------------------------------------
export const PORT_COLORS = {
  bool:  "oklch(78% 0.13 175)",  // teal/mint
  float: "oklch(72% 0.17 45)",   // orange
  int:   "oklch(80% 0.14 80)",   // amber
  state: "oklch(70% 0.18 300)",  // purple (declared; not yet wired)
};

export const PORT_LABELS = {
  bool:  "BOOL",
  float: "FLOAT",
  int:   "INT",
  state: "STATE",
};

// ---------------------------------------------------------------------------
// Category accent colors
// ---------------------------------------------------------------------------
export const CAT_COLORS = {
  INPUTS:  "oklch(72% 0.13 230)",
  LOGIC:   "oklch(78% 0.13 175)",
  MATH:    "oklch(72% 0.17 45)",
  TIMING:  "oklch(80% 0.14 80)",
  STATE:   "oklch(70% 0.18 300)",
  OUTPUTS: "oklch(67% 0.21 25)",
};

// Visually distinct color for collapsed/expanded groups (magenta)
export const GROUP_COLOR = "oklch(74% 0.16 340)";

// ---------------------------------------------------------------------------
// Port name alphabet for N-input gates
// ---------------------------------------------------------------------------
export const PORT_NAMES = ["a", "b", "c", "d", "e", "f", "g", "h"];

// ---------------------------------------------------------------------------
// Node spec catalog
// Each spec: { id, label, cat, sub?, inputs: [{id,type,label?}], outputs: [{id,type,label?}], params? }
// ---------------------------------------------------------------------------
export const NODE_SPECS = [
  // INPUTS — telemetry sources
  {
    id: "altitude", label: "Altitude", cat: "INPUTS", sub: "sensor source",
    inputs: [], outputs: [{ id: "v", type: "float", label: "m" }],
    params: { source: "ekf" },
  },
  {
    id: "vel", label: "Vertical Velocity", cat: "INPUTS", sub: "signed, +up",
    inputs: [], outputs: [{ id: "v", type: "float", label: "m/s" }],
  },
  {
    id: "accel", label: "Accel Magnitude", cat: "INPUTS", sub: "|a|",
    inputs: [], outputs: [{ id: "v", type: "float", label: "m/s²" }],
  },
  {
    id: "tilt", label: "Tilt Angle", cat: "INPUTS", sub: "off-vertical",
    inputs: [], outputs: [{ id: "v", type: "float", label: "deg" }],
  },
  {
    id: "mach", label: "Mach Number", cat: "INPUTS",
    inputs: [], outputs: [{ id: "v", type: "float", label: "M" }],
  },
  {
    id: "met", label: "Mission Elapsed", cat: "INPUTS", sub: "since liftoff",
    inputs: [], outputs: [{ id: "v", type: "float", label: "s" }],
  },
  {
    id: "stateT", label: "State Elapsed", cat: "INPUTS", sub: "in current FSM",
    inputs: [], outputs: [{ id: "v", type: "float", label: "s" }],
  },
  {
    id: "continuity", label: "Continuity", cat: "INPUTS", sub: "channel ohm-check",
    inputs: [], outputs: [{ id: "v", type: "bool", label: "ok" }],
    params: { channel: 1 },
  },
  {
    id: "armed", label: "Armed", cat: "INPUTS", sub: "channel armed",
    inputs: [], outputs: [{ id: "v", type: "bool", label: "on" }],
    params: { channel: 1 },
  },
  {
    id: "motor_num", label: "Motor Number", cat: "INPUTS", sub: "increments per burnout",
    inputs: [], outputs: [{ id: "v", type: "int", label: "#" }],
  },
  {
    id: "constant", label: "Constant", cat: "INPUTS", sub: "value",
    inputs: [], outputs: [{ id: "v", type: "float", label: "" }],
    params: { kind: "float", value: 0 },
  },

  // STATE — flight-machine events and queries
  {
    id: "fsm_event", label: "FSM Event", cat: "STATE", sub: "latching event",
    inputs: [], outputs: [{ id: "v", type: "bool", label: "latch" }],
    params: { event: "apogee" },
  },
  {
    id: "fsm_is", label: "FSM is", cat: "STATE", sub: "single state",
    inputs: [], outputs: [{ id: "v", type: "bool" }],
    params: { state: "APOGEE" },
  },
  {
    id: "fsm_in", label: "FSM in set", cat: "STATE", sub: "any-of",
    inputs: [], outputs: [{ id: "v", type: "bool" }],
    params: { states: ["COAST", "APOGEE", "DROGUE"] },
  },
  {
    id: "past_pad", label: "Past PAD", cat: "STATE", sub: "once liftoff",
    inputs: [], outputs: [{ id: "v", type: "bool" }],
  },
  {
    id: "test_mode", label: "Test Mode", cat: "STATE", sub: "bench testing",
    inputs: [], outputs: [{ id: "v", type: "bool" }],
  },

  // LOGIC
  {
    id: "cmp", label: "Comparator", cat: "LOGIC", sub: "A op B → bool",
    inputs: [{ id: "a", type: "float", label: "A" }, { id: "b", type: "float", label: "B" }],
    outputs: [{ id: "v", type: "bool", label: "" }],
    params: { op: ">=", hysteresis: 0 },
  },
  {
    id: "thresh", label: "Threshold", cat: "LOGIC", sub: "all x op T",
    inputs: [{ id: "a", type: "float", label: "x" }],
    outputs: [{ id: "v", type: "bool", label: "" }],
    params: { op: ">=", threshold: 0, hysteresis: 0, count: 1 },
  },
  {
    id: "and", label: "AND", cat: "LOGIC", sub: "N inputs",
    inputs: [{ id: "a", type: "bool" }, { id: "b", type: "bool" }],
    outputs: [{ id: "v", type: "bool" }],
    params: { count: 2 },
  },
  {
    id: "or", label: "OR", cat: "LOGIC", sub: "N inputs",
    inputs: [{ id: "a", type: "bool" }, { id: "b", type: "bool" }],
    outputs: [{ id: "v", type: "bool" }],
    params: { count: 2 },
  },
  {
    id: "not", label: "NOT", cat: "LOGIC",
    inputs: [{ id: "a", type: "bool" }],
    outputs: [{ id: "v", type: "bool" }],
  },
  {
    id: "xor", label: "XOR", cat: "LOGIC",
    inputs: [{ id: "a", type: "bool" }, { id: "b", type: "bool" }],
    outputs: [{ id: "v", type: "bool" }],
  },
  {
    id: "edge", label: "Edge Detect", cat: "LOGIC", sub: "rising/falling",
    inputs: [{ id: "a", type: "bool" }],
    outputs: [{ id: "v", type: "bool" }],
    params: { edge: "rising" },
  },

  // MATH
  {
    id: "add", label: "Add", cat: "MATH",
    inputs: [{ id: "a", type: "float" }, { id: "b", type: "float" }],
    outputs: [{ id: "v", type: "float" }],
  },
  {
    id: "sub", label: "Subtract", cat: "MATH",
    inputs: [{ id: "a", type: "float" }, { id: "b", type: "float" }],
    outputs: [{ id: "v", type: "float" }],
  },
  {
    id: "mul", label: "Multiply", cat: "MATH",
    inputs: [{ id: "a", type: "float" }, { id: "b", type: "float" }],
    outputs: [{ id: "v", type: "float" }],
  },
  {
    id: "div", label: "Divide", cat: "MATH",
    inputs: [{ id: "a", type: "float" }, { id: "b", type: "float" }],
    outputs: [{ id: "v", type: "float" }],
  },
  {
    id: "min", label: "Min", cat: "MATH",
    inputs: [{ id: "a", type: "float" }, { id: "b", type: "float" }],
    outputs: [{ id: "v", type: "float" }],
  },
  {
    id: "max", label: "Max", cat: "MATH",
    inputs: [{ id: "a", type: "float" }, { id: "b", type: "float" }],
    outputs: [{ id: "v", type: "float" }],
  },
  {
    id: "abs", label: "Abs", cat: "MATH",
    inputs: [{ id: "a", type: "float" }],
    outputs: [{ id: "v", type: "float" }],
  },
  {
    id: "lowpass", label: "Lowpass", cat: "MATH", sub: "τ ms",
    inputs: [{ id: "a", type: "float" }],
    outputs: [{ id: "v", type: "float" }],
    params: { tau: 100 },
  },

  // TIMING
  {
    id: "delay", label: "Delay", cat: "TIMING", sub: "T ms after rise",
    inputs: [{ id: "a", type: "bool" }],
    outputs: [{ id: "v", type: "bool" }],
    params: { duration: 500 },
  },
  {
    id: "hold", label: "Hold (Dwell)", cat: "TIMING", sub: "true ≥ T ms",
    inputs: [{ id: "a", type: "bool" }],
    outputs: [{ id: "v", type: "bool" }],
    params: { duration: 500 },
  },
  {
    id: "pulse", label: "Pulse", cat: "TIMING", sub: "T ms on rise",
    inputs: [{ id: "a", type: "bool" }],
    outputs: [{ id: "v", type: "bool" }],
    params: { duration: 200 },
  },
];

// Pyro output channel numbers (1, 2, 3)
export const PYRO_OUTPUTS = [1, 2, 3];
