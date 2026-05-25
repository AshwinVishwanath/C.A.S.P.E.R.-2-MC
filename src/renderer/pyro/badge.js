// badge.js — nodeBadge(node) returns one-line body string for a node card
// ---------------------------------------------------------------------------

/**
 * nodeBadge(node) — returns a short summary string for the node body badge.
 * Returns null for nodes that have no badge (e.g. bare sensor inputs with no params).
 */
export function nodeBadge(node) {
  if (!node) return null;
  const k = node.kind;
  const p = node.params || {};

  switch (k) {
    case "altitude":
      if (p.source === "baro") return "BARO · m";
      if (p.source === "gps")  return "GPS · m";
      return "EKF · m";

    case "continuity":
      return "CH" + (p.channel || 1);

    case "armed":
      return "ARMED · CH" + (p.channel || 1);

    case "constant":
      if (p.kind === "bool") return p.value ? "TRUE" : "FALSE";
      return typeof p.value === "number" ? p.value.toFixed(2) : String(p.value ?? 0);

    case "and": {
      const count = Math.max(2, Math.min(8, p.count || 2));
      return "ALL " + count + " TRUE";
    }

    case "or": {
      const count = Math.max(2, Math.min(8, p.count || 2));
      return "ANY " + count + " TRUE";
    }

    case "not":
      return "NOT";

    case "xor":
      return "XOR";

    case "thresh": {
      const count = Math.max(1, Math.min(8, p.count || 1));
      const op = p.op || ">=";
      const t = typeof p.threshold === "number" ? p.threshold : 0;
      return "ALL " + count + " " + op + " " + t;
    }

    case "cmp": {
      const op = p.op || ">=";
      return "x " + op + " y";
    }

    case "edge":
      return "EDGE · " + (p.edge || "rising");

    case "delay":
      return "DELAY " + (p.duration ?? 500) + " ms";

    case "hold":
      return "HOLD ≥ " + (p.duration ?? 500) + " ms";

    case "pulse":
      return "PULSE " + (p.duration ?? 200) + " ms";

    case "lowpass":
      return "τ = " + (p.tau ?? 100) + " ms";

    case "fsm_event":
      return "↑ " + (p.event || "apogee").toUpperCase();

    case "fsm_is":
      return "= " + (p.state || "APOGEE");

    case "fsm_in": {
      const states = p.states || [];
      return "∈ {" + states.join(",") + "}";
    }

    case "past_pad":
      return "PAST PAD";

    case "test_mode":
      return "TEST MODE";

    case "vel":
      return "m/s · +up";

    case "accel":
      return "|a| m/s²";

    case "tilt":
      return "off-vertical · deg";

    case "mach":
      return "Mach M";

    case "met":
      return "since liftoff · s";

    case "stateT":
      return "in FSM state · s";

    case "motor_num":
      return "motor # int";

    case "add":
      return "+";

    case "sub":
      return "−";

    case "mul":
      return "×";

    case "div":
      return "÷";

    case "min":
      return "min";

    case "max":
      return "max";

    case "abs":
      return "|x|";

    default:
      // pyro_* nodes
      if (typeof k === "string" && k.startsWith("pyro_")) {
        const role = (p.role || "").toUpperCase();
        const dur  = p.duration ?? 1000;
        return role ? role + " · " + dur + " ms" : dur + " ms";
      }
      return null;
  }
}
