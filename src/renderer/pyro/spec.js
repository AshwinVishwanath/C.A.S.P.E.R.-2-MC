// spec.js — SPEC_BY_ID, getSpec(node), port-type compatibility, color lookups
// ---------------------------------------------------------------------------
import { NODE_SPECS, PORT_NAMES, PORT_COLORS, CAT_COLORS, GROUP_COLOR } from "./types.js";

// ---------------------------------------------------------------------------
// Fast lookup: kind → base spec
// ---------------------------------------------------------------------------
export const SPEC_BY_ID = Object.fromEntries(NODE_SPECS.map(s => [s.id, s]));

// ---------------------------------------------------------------------------
// Pyro predicate
// ---------------------------------------------------------------------------
export function isPyro(kind) {
  return typeof kind === "string" && kind.startsWith("pyro_");
}

// ---------------------------------------------------------------------------
// isCompatible(outType, inType): can an output of outType connect to inType?
//   - same type: always compatible
//   - int → float: allowed (promotion)
//   - everything else: incompatible
// ---------------------------------------------------------------------------
export function isCompatible(outType, inType) {
  if (outType === inType) return true;
  if (inType === "float" && outType === "int") return true;
  return false;
}

// ---------------------------------------------------------------------------
// isNumeric(type): float or int
// ---------------------------------------------------------------------------
export function isNumeric(type) {
  return type === "float" || type === "int";
}

// ---------------------------------------------------------------------------
// getSpec(node) — returns a (possibly synthetic) spec for this node instance
//   Handles:
//     - pyro_1/2/3: synthesised fixed input spec
//     - constant: output type varies with params.kind
//     - and/or: input count driven by params.count (clamped 2..8)
//     - thresh: input count driven by params.count (clamped 1..8)
//     - all others: direct SPEC_BY_ID lookup
// ---------------------------------------------------------------------------
export function getSpec(node) {
  if (isPyro(node.kind)) {
    const ch = node.kind.slice(-1); // "1", "2", "3"
    return {
      id:     node.kind,
      label:  `PYRO CH${ch}`,
      cat:    "OUTPUTS",
      inputs: [{ id: "fire", type: "bool", label: "fire" }],
      outputs: [],
    };
  }

  if (node.kind === "constant") {
    const t = (node.params && node.params.kind === "bool") ? "bool" : "float";
    return {
      ...SPEC_BY_ID.constant,
      outputs: [{ id: "v", type: t, label: "" }],
    };
  }

  if (node.kind === "and" || node.kind === "or") {
    const count = Math.max(2, Math.min(8, (node.params && node.params.count) || 2));
    const inputs = Array.from({ length: count }, (_, i) => ({ id: PORT_NAMES[i], type: "bool" }));
    return { ...SPEC_BY_ID[node.kind], inputs };
  }

  if (node.kind === "thresh") {
    const count = Math.max(1, Math.min(8, (node.params && node.params.count) || 1));
    const inputs = Array.from({ length: count }, (_, i) => ({
      id:    PORT_NAMES[i],
      type:  "float",
      label: count === 1 ? "x" : `x${i + 1}`,
    }));
    return { ...SPEC_BY_ID.thresh, inputs };
  }

  return SPEC_BY_ID[node.kind] || null;
}

// ---------------------------------------------------------------------------
// getPortInfo(node, portId, side) — find port index and spec for a given port
//   side: "in" | "out"
//   returns: { idx: number, port: portSpec | undefined }
// ---------------------------------------------------------------------------
export function getPortInfo(node, portId, side) {
  const spec = getSpec(node);
  if (!spec) return { idx: -1, port: undefined };
  const list = side === "out" ? spec.outputs : spec.inputs;
  const idx = list.findIndex(p => p.id === portId);
  return { idx, port: list[idx] };
}

// ---------------------------------------------------------------------------
// defaultParamsFor(kind) — return default params object for a new node
// ---------------------------------------------------------------------------
export function defaultParamsFor(kind) {
  if (isPyro(kind)) return { duration: 1000, role: "Drogue" };
  const spec = SPEC_BY_ID[kind];
  return spec && spec.params ? { ...spec.params } : {};
}

// Re-export color maps so callers only need to import from spec.js
export { PORT_COLORS, CAT_COLORS, GROUP_COLOR };
