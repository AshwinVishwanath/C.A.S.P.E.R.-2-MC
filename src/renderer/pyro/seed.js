// seed.js — buildSeedGraph() returning initial graph
// ---------------------------------------------------------------------------
// Apogee event → Hold(500ms) → AND(FSMin{COAST,APOGEE,DROGUE}) → Pyro 1
// Pyro 2 and 3 created undriven (standard starting configuration).
// ---------------------------------------------------------------------------
import { nodeFromKind } from "./reducer.js";

export function buildSeedGraph() {
  const apo  = nodeFromKind("fsm_event", 80,  120);
  apo.params.event = "apogee";

  const hold = nodeFromKind("hold", 340, 120);
  hold.params.duration = 500;

  const fsm  = nodeFromKind("fsm_in", 80,  320);
  // default params from spec already include states: ["COAST","APOGEE","DROGUE"]

  const and  = nodeFromKind("and", 560, 220);

  const p1   = nodeFromKind("pyro_1", 820, 100);
  p1.params.role = "Drogue";

  const p2   = nodeFromKind("pyro_2", 820, 280);
  p2.params.role = "Main";

  const p3   = nodeFromKind("pyro_3", 820, 460);
  p3.params.role = "Sustainer Ignition";

  const nodes = [apo, hold, fsm, and, p1, p2, p3];

  const edges = [
    { id: "e_seed1", from: { node: apo.id,  port: "v"    }, to: { node: hold.id, port: "a"    } },
    { id: "e_seed2", from: { node: hold.id, port: "v"    }, to: { node: and.id,  port: "a"    } },
    { id: "e_seed3", from: { node: fsm.id,  port: "v"    }, to: { node: and.id,  port: "b"    } },
    { id: "e_seed4", from: { node: and.id,  port: "v"    }, to: { node: p1.id,   port: "fire" } },
  ];

  return { nodes, edges };
}
