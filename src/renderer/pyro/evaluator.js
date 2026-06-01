// evaluator.js — SIM_PROFILE, sampleProfile(t), evaluateGraph(state, sample)
// ---------------------------------------------------------------------------
import { isPyro } from "./spec.js";
import { PORT_NAMES } from "./types.js";

// ---------------------------------------------------------------------------
// SIM_PROFILE — synthetic flight keyframes
// Values faithfully ported from design-package/project/src/pyro-graph.jsx
// ---------------------------------------------------------------------------
export const SIM_PROFILE = [
  // { phase, t, alt, vel, mach, accel, tilt (deg off-vertical) }
  { phase: "PAD",     t: 0,    alt: 0,    vel: 0,    mach: 0.00, accel: 0,    tilt: 1   },
  { phase: "BOOST",   t: 0.5,  alt: 8,    vel: 80,   mach: 0.24, accel: 90,   tilt: 2   },
  { phase: "BOOST",   t: 3.4,  alt: 520,  vel: 248,  mach: 0.73, accel: 78,   tilt: 4   },
  { phase: "COAST",   t: 10,   alt: 1480, vel: 140,  mach: 0.41, accel: -12,  tilt: 8   },
  { phase: "COAST",   t: 20,   alt: 1820, vel: 20,   mach: 0.06, accel: -12,  tilt: 22  },
  { phase: "APOGEE",  t: 22,   alt: 1847, vel: 0,    mach: 0.00, accel: 0,    tilt: 88  },
  { phase: "DROGUE",  t: 22.5, alt: 1847, vel: -25,  mach: 0.07, accel: 0,    tilt: 120 },
  { phase: "DROGUE",  t: 84,   alt: 300,  vel: -25,  mach: 0.07, accel: 0,    tilt: 35  },
  { phase: "MAIN",    t: 84.5, alt: 300,  vel: -7,   mach: 0.02, accel: 0,    tilt: 12  },
  { phase: "MAIN",    t: 142,  alt: 0,    vel: -7,   mach: 0.02, accel: 0,    tilt: 8   },
  { phase: "LANDED",  t: 144,  alt: 0,    vel: 0,    mach: 0,    accel: 0,    tilt: 75  },
];

// ---------------------------------------------------------------------------
// sampleProfile(t, profile) — linear interpolate between adjacent keyframes
//   `profile` defaults to the built-in synthetic SIM_PROFILE, but an imported
//   OpenRocket profile (same keyframe shape) can be passed to replay a real
//   flight. Returns a sample object compatible with evaluateGraph expectations.
// ---------------------------------------------------------------------------
export function sampleProfile(t, profile = SIM_PROFILE) {
  if (!profile || profile.length === 0) return null;
  if (t <= profile[0].t) return { ...profile[0] };
  for (let i = 1; i < profile.length; i++) {
    if (t < profile[i].t) {
      const a = profile[i - 1];
      const b = profile[i];
      const span = (b.t - a.t) || 1;
      const f = (t - a.t) / span;
      return {
        phase: a.phase,
        t,
        alt:   a.alt   + (b.alt   - a.alt)   * f,
        vel:   a.vel   + (b.vel   - a.vel)   * f,
        mach:  a.mach  + (b.mach  - a.mach)  * f,
        accel: a.accel + (b.accel - a.accel) * f,
        tilt:  a.tilt  + (b.tilt  - a.tilt)  * f,
      };
    }
  }
  return { ...profile[profile.length - 1] };
}

// ---------------------------------------------------------------------------
// cmpOp(op, a, b) — numeric comparison operator
// ---------------------------------------------------------------------------
function cmpOp(op, a, b) {
  const A = +a, B = +b;
  switch (op) {
    case "<":  return A < B;
    case "<=": return A <= B;
    case ">":  return A > B;
    case ">=": return A >= B;
    case "==": return A === B;
    case "!=": return A !== B;
    default:   return false;
  }
}

// ---------------------------------------------------------------------------
// evaluateGraph(state, sample) — memoized DFS evaluator
//   Returns Map<nodeId, {[portId]: value}>
//   Cycle guard: if a node is currently being evaluated, return {} (zeroes/false)
// ---------------------------------------------------------------------------
export function evaluateGraph(state, sample, profile = SIM_PROFILE) {
  const { nodes, edges } = state;

  // Build reverse edge map: nodeId → [edge]  (edges arriving at this node)
  const reverse = new Map(nodes.map(n => [n.id, []]));
  edges.forEach(e => {
    const arr = reverse.get(e.to.node);
    if (arr) arr.push(e);
  });

  // Find the phase start time (first keyframe with this phase)
  const phaseStart = (() => {
    const kf = (profile || SIM_PROFILE).find(p => p.phase === sample.phase);
    return kf ? kf.t : 0;
  })();

  const values   = new Map();  // nodeId → { [portId]: value }
  const visiting = new Set();  // cycle guard

  function evalNode(nodeId) {
    if (values.has(nodeId)) return values.get(nodeId);
    if (visiting.has(nodeId)) {
      // Cycle detected — return neutral output to break the loop
      return {};
    }
    visiting.add(nodeId);

    const node = nodes.find(n => n.id === nodeId);
    if (!node) { visiting.delete(nodeId); return {}; }

    // Resolve inputs from upstream nodes
    const inputs = {};
    for (const e of (reverse.get(nodeId) || [])) {
      const src = evalNode(e.from.node);
      inputs[e.to.port] = src[e.from.port];
    }

    const out = {};
    const k = node.kind;
    const p = node.params || {};

    // --- OUTPUTS ---
    if (isPyro(k)) {
      out.fire = !!inputs.fire;

    // --- INPUTS ---
    } else if (k === "altitude")   { out.v = sample.alt; }
    else if (k === "vel")          { out.v = sample.vel; }
    else if (k === "accel")        { out.v = sample.accel; }
    else if (k === "tilt")         { out.v = sample.tilt; }
    else if (k === "mach")         { out.v = sample.mach; }
    else if (k === "met")          { out.v = sample.t; }
    else if (k === "stateT")       { out.v = Math.max(0, sample.t - phaseStart); }
    else if (k === "continuity")   { out.v = true; }  // sim always shows continuity OK
    else if (k === "armed")        { out.v = sample.phase !== "PAD"; }
    else if (k === "motor_num") {
      // 0 on pad, 1 during SUSTAIN (two-stage second motor), 0 otherwise
      out.v = (sample.phase === "SUSTAIN") ? 1 : 0;
    }
    else if (k === "constant") {
      out.v = (p.kind === "bool") ? !!p.value : +p.value;

    // --- STATE ---
    } else if (k === "fsm_event") {
      const ev = (p.event || "apogee");
      if (ev === "apogee") {
        out.v = ["APOGEE", "DROGUE", "MAIN", "LANDED"].includes(sample.phase);
      } else if (ev === "burnout") {
        out.v = ["COAST", "COAST_1", "COAST_2", "APOGEE", "DROGUE", "MAIN", "LANDED"].includes(sample.phase);
      } else if (ev === "launch") {
        out.v = sample.phase !== "PAD";
      } else {
        out.v = false;
      }
    }
    else if (k === "fsm_is")  { out.v = sample.phase === p.state; }
    else if (k === "fsm_in")  { out.v = (p.states || []).includes(sample.phase); }
    else if (k === "past_pad") { out.v = sample.phase !== "PAD"; }
    else if (k === "test_mode") { out.v = false; } // always false in sim

    // --- LOGIC ---
    else if (k === "cmp") {
      out.v = cmpOp(p.op, inputs.a, inputs.b);
    }
    else if (k === "thresh") {
      const cnt = Math.max(1, Math.min(8, p.count || 1));
      const T = +p.threshold;
      let pass = true;
      for (let i = 0; i < cnt; i++) {
        const v = inputs[PORT_NAMES[i]];
        if (v === undefined || !cmpOp(p.op, v, T)) { pass = false; break; }
      }
      out.v = pass;
    }
    else if (k === "and") {
      const cnt = Math.max(2, Math.min(8, p.count || 2));
      let pass = true;
      for (let i = 0; i < cnt; i++) {
        if (inputs[PORT_NAMES[i]] !== true) { pass = false; break; }
      }
      out.v = pass;
    }
    else if (k === "or") {
      const cnt = Math.max(2, Math.min(8, p.count || 2));
      let pass = false;
      for (let i = 0; i < cnt; i++) {
        if (inputs[PORT_NAMES[i]] === true) { pass = true; break; }
      }
      out.v = pass;
    }
    else if (k === "not")  { out.v = !inputs.a; }
    else if (k === "xor")  { out.v = !!inputs.a !== !!inputs.b; }
    else if (k === "edge") { out.v = inputs.a; } // simplified: pass-through in sim (no prev state)

    // --- MATH ---
    else if (k === "add")  { out.v = (+inputs.a || 0) + (+inputs.b || 0); }
    else if (k === "sub")  { out.v = (+inputs.a || 0) - (+inputs.b || 0); }
    else if (k === "mul")  { out.v = (+inputs.a || 0) * (+inputs.b || 0); }
    else if (k === "div")  { out.v = +inputs.b ? (+inputs.a || 0) / (+inputs.b) : 0; }
    else if (k === "min")  { out.v = Math.min(+inputs.a || 0, +inputs.b || 0); }
    else if (k === "max")  { out.v = Math.max(+inputs.a || 0, +inputs.b || 0); }
    else if (k === "abs")  { out.v = Math.abs(+inputs.a || 0); }

    // --- TIMING/FILTER (simplified pass-through in sim) ---
    else if (k === "lowpass") { out.v = inputs.a; }
    else if (k === "delay")   { out.v = inputs.a; }
    else if (k === "hold")    { out.v = inputs.a; }
    else if (k === "pulse")   { out.v = inputs.a; }

    values.set(nodeId, out);
    visiting.delete(nodeId);
    return out;
  }

  // Evaluate all nodes (results memoized in Map)
  nodes.forEach(n => evalNode(n.id));
  return values;
}
