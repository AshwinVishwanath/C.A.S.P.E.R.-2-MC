/**
 * Logic Graph compiler for C.A.S.P.E.R. 2 Mission Control.
 *
 * Compiles a LogicGraphIR (JSON graph from the renderer's visual editor)
 * into the binary Logic VM format described in LOGIC_VM_SPEC.md.
 *
 * Compilation pipeline:
 *   1. Validate graph (cycle detection, unknown kinds, type mismatches)
 *   2. Topological sort of nodes reachable from pyro outputs
 *   3. Slot allocation (one f32 slot per non-pyro node)
 *   4. Emit op stream in topo order
 *   5. Emit FIRE_PYRO for each driven pyro output
 *   6. Build header, append CRC-32
 *
 * @module protocol/logic_compiler
 */

import {
  LogicGraphIR,
  LogicNode,
  NodeKind,
  OpCode,
  SignalSource,
  FsmStateId,
  FsmEventId,
  CmpOp,
  EdgeMode,
  FSM_STATE_NAMES,
  LOGIC_VM_MAGIC_1,
  LOGIC_VM_MAGIC_2,
  LOGIC_VM_VERSION,
  LOGIC_VM_HEADER_SIZE,
  LOGIC_VM_CRC_SIZE,
} from './logic_program';
import { crc32_compute } from './crc32';

// ---------------------------------------------------------------------------
// Public result types
// ---------------------------------------------------------------------------

export interface CompileStats {
  node_count: number;
  edge_count: number;
  op_count: number;
  slot_count: number;
  total_bytes: number;
}

export type CompileResult =
  | { ok: true;  bytes: Uint8Array; hash: number; stats: CompileStats }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// Internal helpers — little-endian writers
// ---------------------------------------------------------------------------

/** Grow-on-demand byte buffer. */
class ByteWriter {
  private _buf: number[] = [];

  u8(v: number): void { this._buf.push(v & 0xFF); }

  u16(v: number): void {
    this._buf.push(v & 0xFF);
    this._buf.push((v >>> 8) & 0xFF);
  }

  u32(v: number): void {
    this._buf.push(v & 0xFF);
    this._buf.push((v >>> 8) & 0xFF);
    this._buf.push((v >>> 16) & 0xFF);
    this._buf.push((v >>> 24) & 0xFF);
  }

  /** Write an IEEE-754 single-precision float in LE byte order. */
  f32(v: number): void {
    const tmp = new Float32Array(1);
    tmp[0] = v;
    const bytes = new Uint8Array(tmp.buffer);
    for (let i = 0; i < 4; i++) this._buf.push(bytes[i]);
  }

  get length(): number { return this._buf.length; }

  toUint8Array(): Uint8Array { return new Uint8Array(this._buf); }
}

// ---------------------------------------------------------------------------
// Adjacency helpers
// ---------------------------------------------------------------------------

/**
 * Build an adjacency map: node_id → list of node_ids that produce inputs to it.
 * Also returns a per-node mapping from (node_id, port) → source node id.
 */
function build_adjacency(graph: LogicGraphIR): {
  predecessors: Map<string, string[]>;
  port_source: Map<string, string>;  // key: "nodeId:port" → source nodeId
} {
  const predecessors = new Map<string, string[]>();
  const port_source = new Map<string, string>();

  for (const node of graph.nodes) {
    predecessors.set(node.id, []);
  }

  for (const edge of graph.edges) {
    const to_key = `${edge.to.node}:${edge.to.port}`;
    port_source.set(to_key, edge.from.node);

    const preds = predecessors.get(edge.to.node);
    if (preds !== undefined && !preds.includes(edge.from.node)) {
      preds.push(edge.from.node);
    }
  }

  return { predecessors, port_source };
}

// ---------------------------------------------------------------------------
// Cycle detection via DFS coloring
// ---------------------------------------------------------------------------

type Color = 'white' | 'gray' | 'black';

function detect_cycles(
  graph: LogicGraphIR,
  predecessors: Map<string, string[]>
): string[] {
  const color = new Map<string, Color>();
  const errors: string[] = [];

  for (const node of graph.nodes) {
    color.set(node.id, 'white');
  }

  function dfs(id: string, path: string[]): void {
    color.set(id, 'gray');
    const preds = predecessors.get(id) ?? [];
    for (const pred of preds) {
      const c = color.get(pred);
      if (c === 'gray') {
        errors.push(`Cycle detected involving node "${pred}" → "${id}"`);
      } else if (c === 'white') {
        dfs(pred, [...path, id]);
      }
    }
    color.set(id, 'black');
  }

  for (const node of graph.nodes) {
    if (color.get(node.id) === 'white') {
      dfs(node.id, []);
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Topological sort (reverse BFS from pyro outputs)
// ---------------------------------------------------------------------------

const PYRO_KINDS: NodeKind[] = ['pyro_1', 'pyro_2', 'pyro_3'];

function topo_sort_reachable(
  graph: LogicGraphIR,
  predecessors: Map<string, string[]>
): { order: string[]; reachable: Set<string> } {
  const node_map = new Map<string, LogicNode>();
  for (const n of graph.nodes) node_map.set(n.id, n);

  // BFS backwards from pyro outputs to collect reachable nodes
  const reachable = new Set<string>();
  const queue: string[] = [];

  for (const n of graph.nodes) {
    if (PYRO_KINDS.includes(n.kind)) {
      reachable.add(n.id);
      queue.push(n.id);
    }
  }

  let qi = 0;
  while (qi < queue.length) {
    const id = queue[qi++];
    for (const pred of predecessors.get(id) ?? []) {
      if (!reachable.has(pred)) {
        reachable.add(pred);
        queue.push(pred);
      }
    }
  }

  // Kahn's algorithm for topological sort, restricted to reachable nodes
  const in_degree = new Map<string, number>();
  for (const id of reachable) {
    let deg = 0;
    for (const pred of predecessors.get(id) ?? []) {
      if (reachable.has(pred)) deg++;
    }
    in_degree.set(id, deg);
  }

  // Build forward adjacency (successors) among reachable nodes
  const successors = new Map<string, string[]>();
  for (const id of reachable) successors.set(id, []);
  for (const id of reachable) {
    for (const pred of predecessors.get(id) ?? []) {
      if (reachable.has(pred)) {
        successors.get(pred)!.push(id);
      }
    }
  }

  const result: string[] = [];
  const ready: string[] = [];

  for (const [id, deg] of in_degree) {
    if (deg === 0) ready.push(id);
  }

  while (ready.length > 0) {
    const id = ready.shift()!;
    result.push(id);
    for (const succ of successors.get(id) ?? []) {
      const new_deg = (in_degree.get(succ) ?? 0) - 1;
      in_degree.set(succ, new_deg);
      if (new_deg === 0) ready.push(succ);
    }
  }

  // Move pyro outputs to the end (they should naturally be last in topo order,
  // but make it explicit)
  const non_pyro = result.filter(id => {
    const n = node_map.get(id);
    return n !== undefined && !PYRO_KINDS.includes(n.kind);
  });
  const pyro_ids = result.filter(id => {
    const n = node_map.get(id);
    return n !== undefined && PYRO_KINDS.includes(n.kind);
  });

  return { order: [...non_pyro, ...pyro_ids], reachable };
}

// ---------------------------------------------------------------------------
// FSM state name → id resolution
// ---------------------------------------------------------------------------

function resolve_fsm_state(name: string, errors: string[]): number {
  const idx = FSM_STATE_NAMES.indexOf(name.toUpperCase());
  if (idx === -1) {
    errors.push(`Unknown FSM state name: "${name}"`);
    return 0;
  }
  return idx;
}

function resolve_fsm_event(name: string, errors: string[]): number {
  const map: Record<string, number> = {
    launch:  FsmEventId.LAUNCH,
    burnout: FsmEventId.BURNOUT,
    apogee:  FsmEventId.APOGEE,
  };
  const id = map[name?.toLowerCase()];
  if (id === undefined) {
    errors.push(`Unknown FSM event: "${name}"`);
    return 0;
  }
  return id;
}

// ---------------------------------------------------------------------------
// CmpOp string → byte
// ---------------------------------------------------------------------------

function resolve_cmp_op(op: string, errors: string[]): number {
  const map: Record<string, number> = {
    '<':  CmpOp.LT,
    '<=': CmpOp.LTE,
    '>':  CmpOp.GT,
    '>=': CmpOp.GTE,
    '==': CmpOp.EQ,
    '!=': CmpOp.NEQ,
  };
  const id = map[op];
  if (id === undefined) {
    errors.push(`Unknown comparison operator: "${op}"`);
    return 0;
  }
  return id;
}

// ---------------------------------------------------------------------------
// EdgeMode string → byte
// ---------------------------------------------------------------------------

function resolve_edge_mode(mode: string, errors: string[]): number {
  const map: Record<string, number> = {
    rising:  EdgeMode.RISING,
    falling: EdgeMode.FALLING,
    either:  EdgeMode.EITHER,
  };
  const id = map[mode?.toLowerCase()];
  if (id === undefined) {
    errors.push(`Unknown edge mode: "${mode}"`);
    return 0;
  }
  return id;
}

// ---------------------------------------------------------------------------
// Role string → u8 tag (simple sum-of-chars % 256)
// ---------------------------------------------------------------------------

function role_tag(role: unknown): number {
  if (typeof role !== 'string' || role.length === 0) return 0;
  let s = 0;
  for (let i = 0; i < role.length; i++) s = (s + role.charCodeAt(i)) & 0xFF;
  return s;
}

// ---------------------------------------------------------------------------
// Main compiler
// ---------------------------------------------------------------------------

export function compile_logic_graph(graph: LogicGraphIR): CompileResult {
  const errors: string[] = [];

  // --- Build lookup maps ---
  const node_map = new Map<string, LogicNode>();
  for (const n of graph.nodes) {
    if (node_map.has(n.id)) {
      errors.push(`Duplicate node id: "${n.id}"`);
    }
    node_map.set(n.id, n);
  }

  // Validate node kinds
  const valid_kinds = new Set<string>([
    'altitude','vel','accel','tilt','mach','met','stateT','continuity','armed',
    'motor_num','constant','fsm_event','fsm_is','fsm_in','past_pad','test_mode',
    'cmp','thresh','and','or','not','xor','edge',
    'add','sub','mul','div','min','max','abs','lowpass',
    'delay','hold','pulse',
    'pyro_1','pyro_2','pyro_3',
  ]);
  for (const n of graph.nodes) {
    if (!valid_kinds.has(n.kind)) {
      errors.push(`Unknown node kind: "${n.kind}" on node "${n.id}"`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // --- Build adjacency ---
  const { predecessors, port_source } = build_adjacency(graph);

  // --- Cycle detection ---
  const cycle_errors = detect_cycles(graph, predecessors);
  errors.push(...cycle_errors);
  if (errors.length > 0) return { ok: false, errors };

  // --- Topological sort ---
  const { order, reachable } = topo_sort_reachable(graph, predecessors);

  // --- Warn about unreachable nodes (not fatal) ---
  const warnings: string[] = [];
  for (const n of graph.nodes) {
    if (!reachable.has(n.id)) {
      warnings.push(`Node "${n.id}" (${n.kind}) is not reachable from any pyro output`);
    }
  }
  // Warnings are available for logging but do not block compilation.

  // --- Slot allocation (non-pyro reachable nodes) ---
  const slot_map = new Map<string, number>();
  let next_slot = 0;

  for (const id of order) {
    const n = node_map.get(id)!;
    if (!PYRO_KINDS.includes(n.kind)) {
      slot_map.set(id, next_slot++);
    }
  }

  // Helper: resolve the slot of an input edge
  const get_input_slot = (
    to_node_id: string,
    port: string,
    node_errors: string[]
  ): number => {
    const key = `${to_node_id}:${port}`;
    const src_id = port_source.get(key);
    if (src_id === undefined) {
      node_errors.push(`Node "${to_node_id}": no connection on input port "${port}"`);
      return 0;
    }
    const slot = slot_map.get(src_id);
    if (slot === undefined) {
      node_errors.push(`Node "${to_node_id}": source node "${src_id}" has no slot (not compiled before it)`);
      return 0;
    }
    return slot;
  };

  // --- Emit op stream ---
  const ops = new ByteWriter();
  let op_count = 0;

  for (const id of order) {
    const n = node_map.get(id)!;
    if (PYRO_KINDS.includes(n.kind)) continue;  // handled separately below

    const out_slot = slot_map.get(id)!;
    const params = n.params ?? {};

    switch (n.kind) {
      // -- Inputs --
      case 'altitude': {
        const src_str = (params['source'] as string) ?? 'ekf';
        const src_map: Record<string, number> = {
          ekf:  SignalSource.ALTITUDE_EKF,
          baro: SignalSource.ALTITUDE_BARO,
          gps:  SignalSource.ALTITUDE_GPS,
        };
        const src = src_map[src_str];
        if (src === undefined) {
          errors.push(`Node "${id}": unknown altitude source "${src_str}"`);
        }
        // LOAD_INPUT: opcode(1) + out(2) + source(1) = 4 bytes
        ops.u8(OpCode.LOAD_INPUT);
        ops.u16(out_slot);
        ops.u8(src ?? SignalSource.ALTITUDE_EKF);
        op_count++;
        break;
      }
      case 'vel':
        ops.u8(OpCode.LOAD_INPUT); ops.u16(out_slot); ops.u8(SignalSource.VEL);
        op_count++;
        break;
      case 'accel':
        ops.u8(OpCode.LOAD_INPUT); ops.u16(out_slot); ops.u8(SignalSource.ACCEL);
        op_count++;
        break;
      case 'tilt':
        ops.u8(OpCode.LOAD_INPUT); ops.u16(out_slot); ops.u8(SignalSource.TILT);
        op_count++;
        break;
      case 'mach':
        ops.u8(OpCode.LOAD_INPUT); ops.u16(out_slot); ops.u8(SignalSource.MACH);
        op_count++;
        break;
      case 'met':
        ops.u8(OpCode.LOAD_INPUT); ops.u16(out_slot); ops.u8(SignalSource.MET);
        op_count++;
        break;
      case 'stateT':
        ops.u8(OpCode.LOAD_INPUT); ops.u16(out_slot); ops.u8(SignalSource.STATE_T);
        op_count++;
        break;
      case 'continuity': {
        const ch = ((params['channel'] as number) ?? 1);
        const src_map: Record<number, number> = {
          1: SignalSource.CONTINUITY_CH1,
          2: SignalSource.CONTINUITY_CH2,
          3: SignalSource.CONTINUITY_CH3,
        };
        const src = src_map[ch];
        if (src === undefined) {
          errors.push(`Node "${id}": invalid continuity channel ${ch}`);
        }
        ops.u8(OpCode.LOAD_INPUT); ops.u16(out_slot); ops.u8(src ?? SignalSource.CONTINUITY_CH1);
        op_count++;
        break;
      }
      case 'armed': {
        const ch = (params['channel'] as number) ?? 1;
        const src_map: Record<number, number> = {
          1: SignalSource.ARMED_CH1,
          2: SignalSource.ARMED_CH2,
          3: SignalSource.ARMED_CH3,
        };
        const src = src_map[ch];
        if (src === undefined) {
          errors.push(`Node "${id}": invalid armed channel ${ch}`);
        }
        ops.u8(OpCode.LOAD_INPUT); ops.u16(out_slot); ops.u8(src ?? SignalSource.ARMED_CH1);
        op_count++;
        break;
      }
      case 'motor_num':
        ops.u8(OpCode.LOAD_INPUT); ops.u16(out_slot); ops.u8(SignalSource.MOTOR_NUM);
        op_count++;
        break;
      case 'constant': {
        const kind = (params['kind'] as string) ?? 'float';
        const value = (params['value'] as number) ?? 0;
        if (kind === 'bool') {
          // LOAD_CONST_B: opcode(1) + out(2) + value(1) = 4 bytes
          ops.u8(OpCode.LOAD_CONST_B);
          ops.u16(out_slot);
          ops.u8(value ? 1 : 0);
        } else {
          // LOAD_CONST_F: opcode(1) + out(2) + value:f32(4) = 7 bytes
          ops.u8(OpCode.LOAD_CONST_F);
          ops.u16(out_slot);
          ops.f32(value);
        }
        op_count++;
        break;
      }

      // -- State --
      case 'fsm_is': {
        const state_name = (params['state'] as string) ?? '';
        const state_id = resolve_fsm_state(state_name, errors);
        // FSM_IS: opcode(1) + out(2) + state_id(1) = 4 bytes
        ops.u8(OpCode.FSM_IS); ops.u16(out_slot); ops.u8(state_id);
        op_count++;
        break;
      }
      case 'fsm_in': {
        const states = (params['states'] as string[]) ?? [];
        const count = states.length;
        if (count === 0) {
          errors.push(`Node "${id}": fsm_in requires at least one state`);
        }
        const ids = states.map(s => resolve_fsm_state(s, errors));
        // FSM_IN: opcode(1) + out(2) + count(1) + ids[count×1] = 4 + count bytes
        ops.u8(OpCode.FSM_IN); ops.u16(out_slot); ops.u8(count);
        for (const sid of ids) ops.u8(sid);
        op_count++;
        break;
      }
      case 'fsm_event': {
        const event_name = (params['event'] as string) ?? '';
        const event_id = resolve_fsm_event(event_name, errors);
        // FSM_EVENT: opcode(1) + out(2) + event_id(1) = 4 bytes
        ops.u8(OpCode.FSM_EVENT); ops.u16(out_slot); ops.u8(event_id);
        op_count++;
        break;
      }
      case 'past_pad':
        // PAST_PAD: opcode(1) + out(2) = 3 bytes
        ops.u8(OpCode.PAST_PAD); ops.u16(out_slot);
        op_count++;
        break;
      case 'test_mode':
        // TEST_MODE: opcode(1) + out(2) = 3 bytes
        ops.u8(OpCode.TEST_MODE); ops.u16(out_slot);
        op_count++;
        break;

      // -- Logic --
      case 'cmp': {
        const op_str = (params['op'] as string) ?? '<';
        const hyst = (params['hysteresis'] as number) ?? 0;
        const op_byte = resolve_cmp_op(op_str, errors);
        const a_slot = get_input_slot(id, 'a', errors);
        const b_slot = get_input_slot(id, 'b', errors);
        // CMP: opcode(1) + out(2) + a(2) + b(2) + op(1) + hyst:f32(4) = 12 bytes
        ops.u8(OpCode.CMP); ops.u16(out_slot); ops.u16(a_slot); ops.u16(b_slot);
        ops.u8(op_byte); ops.f32(hyst);
        op_count++;
        break;
      }
      case 'thresh': {
        const op_str = (params['op'] as string) ?? '<';
        const threshold = (params['threshold'] as number) ?? 0;
        const hyst = (params['hysteresis'] as number) ?? 0;
        const count = Math.max(1, Math.min(8, (params['count'] as number) ?? 1));
        const op_byte = resolve_cmp_op(op_str, errors);
        // Collect input slots for ports a, b, c, ... up to count
        const port_names = ['a','b','c','d','e','f','g','h'];
        const in_slots: number[] = [];
        for (let i = 0; i < count; i++) {
          in_slots.push(get_input_slot(id, port_names[i], errors));
        }
        // THRESH: opcode(1) + out(2) + count(1) + ins[count×2] + op(1) + threshold:f32(4) + hyst:f32(4) = 4 + 2*count + 9
        ops.u8(OpCode.THRESH); ops.u16(out_slot); ops.u8(count);
        for (const s of in_slots) ops.u16(s);
        ops.u8(op_byte); ops.f32(threshold); ops.f32(hyst);
        op_count++;
        break;
      }
      case 'and':
      case 'or': {
        const count = Math.max(2, Math.min(8, (params['count'] as number) ?? 2));
        const port_names = ['a','b','c','d','e','f','g','h'];
        const in_slots: number[] = [];
        for (let i = 0; i < count; i++) {
          in_slots.push(get_input_slot(id, port_names[i], errors));
        }
        const opcode = n.kind === 'and' ? OpCode.AND : OpCode.OR;
        // AND/OR: opcode(1) + out(2) + count(1) + ins[count×2] = 4 + 2*count bytes
        ops.u8(opcode); ops.u16(out_slot); ops.u8(count);
        for (const s of in_slots) ops.u16(s);
        op_count++;
        break;
      }
      case 'not': {
        const a_slot = get_input_slot(id, 'a', errors);
        // NOT: opcode(1) + out(2) + a(2) = 5 bytes
        ops.u8(OpCode.NOT); ops.u16(out_slot); ops.u16(a_slot);
        op_count++;
        break;
      }
      case 'xor': {
        const a_slot = get_input_slot(id, 'a', errors);
        const b_slot = get_input_slot(id, 'b', errors);
        // XOR: opcode(1) + out(2) + a(2) + b(2) = 7 bytes
        ops.u8(OpCode.XOR); ops.u16(out_slot); ops.u16(a_slot); ops.u16(b_slot);
        op_count++;
        break;
      }
      case 'edge': {
        const mode_str = (params['edge'] as string) ?? 'rising';
        const mode = resolve_edge_mode(mode_str, errors);
        const a_slot = get_input_slot(id, 'a', errors);
        // EDGE: opcode(1) + out(2) + a(2) + mode(1) = 6 bytes
        ops.u8(OpCode.EDGE); ops.u16(out_slot); ops.u16(a_slot); ops.u8(mode);
        op_count++;
        break;
      }

      // -- Math --
      case 'add': case 'sub': case 'mul': case 'div':
      case 'min': case 'max': {
        const a_slot = get_input_slot(id, 'a', errors);
        const b_slot = get_input_slot(id, 'b', errors);
        const op_map: Partial<Record<NodeKind, number>> = {
          add: OpCode.ADD, sub: OpCode.SUB, mul: OpCode.MUL, div: OpCode.DIV,
          min: OpCode.MIN, max: OpCode.MAX,
        };
        const opcode = op_map[n.kind]!;
        // Binary math: opcode(1) + out(2) + a(2) + b(2) = 7 bytes
        ops.u8(opcode); ops.u16(out_slot); ops.u16(a_slot); ops.u16(b_slot);
        op_count++;
        break;
      }
      case 'abs': {
        const a_slot = get_input_slot(id, 'a', errors);
        // ABS: opcode(1) + out(2) + a(2) = 5 bytes
        ops.u8(OpCode.ABS); ops.u16(out_slot); ops.u16(a_slot);
        op_count++;
        break;
      }
      case 'lowpass': {
        const tau_ms = Math.max(0, (params['tau'] as number) ?? 0);
        const a_slot = get_input_slot(id, 'a', errors);
        // LOWPASS: opcode(1) + out(2) + a(2) + tau_ms:u32(4) = 9 bytes
        ops.u8(OpCode.LOWPASS); ops.u16(out_slot); ops.u16(a_slot);
        ops.u32(Math.round(tau_ms) >>> 0);
        op_count++;
        break;
      }

      // -- Timing --
      case 'delay': case 'hold': case 'pulse': {
        const duration_ms = Math.max(0, (params['duration'] as number) ?? 0);
        const a_slot = get_input_slot(id, 'a', errors);
        const op_map: Partial<Record<NodeKind, number>> = {
          delay: OpCode.DELAY, hold: OpCode.HOLD, pulse: OpCode.PULSE,
        };
        const opcode = op_map[n.kind]!;
        // Timing ops: opcode(1) + out(2) + a(2) + duration_ms:u32(4) = 9 bytes
        ops.u8(opcode); ops.u16(out_slot); ops.u16(a_slot);
        ops.u32(Math.round(duration_ms) >>> 0);
        op_count++;
        break;
      }

      default:
        errors.push(`Unhandled node kind at emit: "${n.kind}"`);
    }
  }

  // --- Emit FIRE_PYRO for each connected pyro output ---
  const pyro_channel_map: Partial<Record<NodeKind, number>> = {
    pyro_1: 1,
    pyro_2: 2,
    pyro_3: 3,
  };

  for (const id of order) {
    const n = node_map.get(id)!;
    if (!PYRO_KINDS.includes(n.kind)) continue;

    const channel = pyro_channel_map[n.kind]!;
    const params = n.params ?? {};
    const duration_raw = (params['duration'] as number) ?? 0;
    const duration_u16 = Math.min(65535, Math.max(0, Math.round(duration_raw))) & 0xFFFF;
    const rtag = role_tag(params['role']);

    // Check if input 'a' is wired
    const key = `${id}:a`;
    const src_id = port_source.get(key);
    if (src_id === undefined) {
      // No input — skip this pyro (not an error per spec)
      continue;
    }
    const input_slot = slot_map.get(src_id);
    if (input_slot === undefined) {
      errors.push(`Pyro node "${id}": source node "${src_id}" has no slot`);
      continue;
    }

    // FIRE_PYRO: opcode(1) + channel(1) + input_slot(2) + duration_ms(2) + role_tag(1) = 7 bytes
    ops.u8(OpCode.FIRE_PYRO);
    ops.u8(channel);
    ops.u16(input_slot);
    ops.u16(duration_u16);
    ops.u8(rtag);
    op_count++;
  }

  if (errors.length > 0) return { ok: false, errors };

  // --- Build binary blob ---
  const op_stream = ops.toUint8Array();
  const slot_count = next_slot;
  const total_length = LOGIC_VM_HEADER_SIZE + op_stream.length + LOGIC_VM_CRC_SIZE;

  const blob = new Uint8Array(total_length);
  let pos = 0;

  // Header (12 bytes):
  // [0]   MAGIC_1
  // [1]   MAGIC_2
  // [2]   version
  // [3]   flags (0)
  // [4-5] total_length u16 LE
  // [6-7] slot_count u16 LE
  // [8-9] op_count u16 LE
  // [10-11] reserved u16 LE = 0
  blob[pos++] = LOGIC_VM_MAGIC_1;
  blob[pos++] = LOGIC_VM_MAGIC_2;
  blob[pos++] = LOGIC_VM_VERSION;
  blob[pos++] = 0x00;  // flags

  blob[pos++] = total_length & 0xFF;
  blob[pos++] = (total_length >>> 8) & 0xFF;

  blob[pos++] = slot_count & 0xFF;
  blob[pos++] = (slot_count >>> 8) & 0xFF;

  blob[pos++] = op_count & 0xFF;
  blob[pos++] = (op_count >>> 8) & 0xFF;

  blob[pos++] = 0x00;  // reserved lo
  blob[pos++] = 0x00;  // reserved hi

  // Op stream
  blob.set(op_stream, pos);
  pos += op_stream.length;

  // CRC-32 over bytes [0..N-5]
  const crc = crc32_compute(blob.subarray(0, total_length - 4));
  blob[pos++] = crc & 0xFF;
  blob[pos++] = (crc >>> 8) & 0xFF;
  blob[pos++] = (crc >>> 16) & 0xFF;
  blob[pos++] = (crc >>> 24) & 0xFF;

  const stats: CompileStats = {
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    op_count,
    slot_count,
    total_bytes: total_length,
  };

  return { ok: true, bytes: blob, hash: crc, stats };
}
