/**
 * Tests for the Logic Graph compiler.
 *
 * Covers validation, topological sort, slot allocation, op emission,
 * header layout, CRC roundtrip, and the seed graph.
 */

import { describe, it, expect } from 'vitest';
import { compile_logic_graph } from '../logic_compiler';
import { crc32_compute } from '../crc32';
import type { LogicGraphIR } from '../logic_program';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function read_u16_le(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function read_u32_le(buf: Uint8Array, offset: number): number {
  return ((buf[offset]
    | (buf[offset + 1] << 8)
    | (buf[offset + 2] << 16)
    | (buf[offset + 3] << 24)) >>> 0);
}

// ---------------------------------------------------------------------------
// Test 1: Empty graph
// ---------------------------------------------------------------------------

describe('compile_logic_graph — empty graph', () => {
  const graph: LogicGraphIR = { nodes: [], edges: [] };

  it('succeeds', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
  });

  it('produces a 16-byte blob (header 12 + CRC 4)', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes.length).toBe(16);
  });

  it('has op_count = 0', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.op_count).toBe(0);
  });

  it('has slot_count = 0', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.slot_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Single LOAD_CONST_F (constant float, no pyro output → unreachable)
// ---------------------------------------------------------------------------

describe('compile_logic_graph — single constant float node (unreachable)', () => {
  const graph: LogicGraphIR = {
    nodes: [{ id: 'n1', kind: 'constant', params: { kind: 'float', value: 42 } }],
    edges: [],
  };

  it('succeeds (unreachable is a warning, not an error)', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
  });

  it('has op_count = 0 because the node is not reachable from a pyro', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The node is unreachable from any pyro output, so it emits no ops
    expect(result.stats.op_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Seed graph
//   fsm_event(apogee) → hold(500ms) → and ← fsm_in(COAST,APOGEE,DROGUE)
//                                       and → pyro_1(duration=1000ms)
// Expected: 5 ops (fsm_event, fsm_in, hold, and, fire_pyro_counted_as_op)
//   Actually per spec: non-pyro nodes emit 4 ops, then 1 FIRE_PYRO = 5 total
//   Slots: fsm_event→0, fsm_in→1, hold→2, and→3  (4 slots)
// ---------------------------------------------------------------------------

describe('compile_logic_graph — seed graph', () => {
  const graph: LogicGraphIR = {
    nodes: [
      { id: 'n_evt',   kind: 'fsm_event', params: { event: 'apogee' } },
      { id: 'n_in',    kind: 'fsm_in',    params: { states: ['COAST', 'APOGEE', 'DROGUE'] } },
      { id: 'n_hold',  kind: 'hold',       params: { duration: 500 } },
      { id: 'n_and',   kind: 'and',        params: { count: 2 } },
      { id: 'n_pyro',  kind: 'pyro_1',    params: { duration: 1000, role: 'Apogee' } },
    ],
    edges: [
      // fsm_event → hold.a
      { id: 'e1', from: { node: 'n_evt',  port: 'out' }, to: { node: 'n_hold', port: 'a' } },
      // hold → and.a
      { id: 'e2', from: { node: 'n_hold', port: 'out' }, to: { node: 'n_and',  port: 'a' } },
      // fsm_in → and.b
      { id: 'e3', from: { node: 'n_in',   port: 'out' }, to: { node: 'n_and',  port: 'b' } },
      // and → pyro_1.a
      { id: 'e4', from: { node: 'n_and',  port: 'out' }, to: { node: 'n_pyro', port: 'a' } },
    ],
  };

  it('compiles successfully', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
  });

  it('emits exactly 5 ops (4 logic + 1 FIRE_PYRO)', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.op_count).toBe(5);
  });

  it('uses exactly 4 slots (fsm_event, fsm_in, hold, and)', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.slot_count).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Cycle detection
// ---------------------------------------------------------------------------

describe('compile_logic_graph — cycle detection', () => {
  const graph: LogicGraphIR = {
    nodes: [
      { id: 'n_a', kind: 'and', params: { count: 2 } },
      { id: 'n_b', kind: 'or',  params: { count: 2 } },
    ],
    edges: [
      // n_a → n_b (a→b) and n_b → n_a (b→a) creates a cycle
      { id: 'e1', from: { node: 'n_a', port: 'out' }, to: { node: 'n_b', port: 'a' } },
      { id: 'e2', from: { node: 'n_b', port: 'out' }, to: { node: 'n_a', port: 'a' } },
    ],
  };

  it('returns ok=false', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(false);
  });

  it('errors mention cycle', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some(e => e.toLowerCase().includes('cycle'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 5: AND with count=3 but only 2 wired → missing input error
// ---------------------------------------------------------------------------

describe('compile_logic_graph — AND missing input', () => {
  const graph: LogicGraphIR = {
    nodes: [
      { id: 'n_a',    kind: 'constant', params: { kind: 'bool', value: 1 } },
      { id: 'n_b',    kind: 'constant', params: { kind: 'bool', value: 0 } },
      { id: 'n_and',  kind: 'and',      params: { count: 3 } },
      { id: 'n_pyro', kind: 'pyro_1',  params: { duration: 500, role: '' } },
    ],
    edges: [
      { id: 'e1', from: { node: 'n_a',   port: 'out' }, to: { node: 'n_and',  port: 'a' } },
      { id: 'e2', from: { node: 'n_b',   port: 'out' }, to: { node: 'n_and',  port: 'b' } },
      // port 'c' is NOT wired
      { id: 'e3', from: { node: 'n_and', port: 'out' }, to: { node: 'n_pyro', port: 'a' } },
    ],
  };

  it('returns ok=false', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(false);
  });

  it('errors mention missing input', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Should mention the port 'c' or 'no connection'
    const has_missing = result.errors.some(e =>
      e.toLowerCase().includes('port') || e.toLowerCase().includes('connection')
    );
    expect(has_missing).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 6: CRC roundtrip
// ---------------------------------------------------------------------------

describe('compile_logic_graph — CRC roundtrip', () => {
  const graph: LogicGraphIR = {
    nodes: [
      { id: 'n_evt',  kind: 'fsm_event', params: { event: 'launch' } },
      { id: 'n_pyro', kind: 'pyro_1',   params: { duration: 200, role: 'Ignition' } },
    ],
    edges: [
      { id: 'e1', from: { node: 'n_evt', port: 'out' }, to: { node: 'n_pyro', port: 'a' } },
    ],
  };

  it('CRC-32 of bytes [0..N-5] matches trailing 4 bytes', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const bytes = result.bytes;
    const body = bytes.subarray(0, bytes.length - 4);
    const recomputed = crc32_compute(body);
    const stored = read_u32_le(bytes, bytes.length - 4);
    expect(recomputed).toBe(stored);
  });

  it('hash return value matches trailing CRC', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = read_u32_le(result.bytes, result.bytes.length - 4);
    expect(result.hash).toBe(stored);
  });
});

// ---------------------------------------------------------------------------
// Test 7: Top-level header bytes
// ---------------------------------------------------------------------------

describe('compile_logic_graph — header magic bytes', () => {
  const graph: LogicGraphIR = { nodes: [], edges: [] };

  it('bytes[0] == 0xCA (MAGIC_1)', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes[0]).toBe(0xCA);
  });

  it('bytes[1] == 0x5A (MAGIC_2)', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes[1]).toBe(0x5A);
  });

  it('bytes[2] == 0x01 (LOGIC_VM_VERSION)', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes[2]).toBe(0x01);
  });
});

// ---------------------------------------------------------------------------
// Test 8: total_length field matches actual blob length
// ---------------------------------------------------------------------------

describe('compile_logic_graph — total_length field', () => {
  it('total_length at bytes[4..5] LE equals bytes.length (empty graph)', () => {
    const result = compile_logic_graph({ nodes: [], edges: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const total_length = read_u16_le(result.bytes, 4);
    expect(total_length).toBe(result.bytes.length);
  });

  it('total_length at bytes[4..5] LE equals bytes.length (seed graph)', () => {
    const graph: LogicGraphIR = {
      nodes: [
        { id: 'n_evt',  kind: 'fsm_event', params: { event: 'apogee' } },
        { id: 'n_pyro', kind: 'pyro_1',   params: { duration: 500, role: 'Apogee' } },
      ],
      edges: [
        { id: 'e1', from: { node: 'n_evt', port: 'out' }, to: { node: 'n_pyro', port: 'a' } },
      ],
    };
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const total_length = read_u16_le(result.bytes, 4);
    expect(total_length).toBe(result.bytes.length);
  });
});

// ---------------------------------------------------------------------------
// Test 9: op_count and slot_count fields correctly encoded LE at offsets 8 and 6
// ---------------------------------------------------------------------------

describe('compile_logic_graph — header field encoding', () => {
  it('slot_count at bytes[6..7] LE matches stats.slot_count', () => {
    const graph: LogicGraphIR = {
      nodes: [
        { id: 'n_evt',  kind: 'fsm_event', params: { event: 'launch' } },
        { id: 'n_pyro', kind: 'pyro_2',   params: { duration: 100, role: '' } },
      ],
      edges: [
        { id: 'e1', from: { node: 'n_evt', port: 'out' }, to: { node: 'n_pyro', port: 'a' } },
      ],
    };
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const slot_count = read_u16_le(result.bytes, 6);
    expect(slot_count).toBe(result.stats.slot_count);
    expect(slot_count).toBe(1);
  });

  it('op_count at bytes[8..9] LE matches stats.op_count', () => {
    const graph: LogicGraphIR = {
      nodes: [
        { id: 'n_evt',  kind: 'fsm_event', params: { event: 'launch' } },
        { id: 'n_pyro', kind: 'pyro_2',   params: { duration: 100, role: '' } },
      ],
      edges: [
        { id: 'e1', from: { node: 'n_evt', port: 'out' }, to: { node: 'n_pyro', port: 'a' } },
      ],
    };
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const op_count = read_u16_le(result.bytes, 8);
    expect(op_count).toBe(result.stats.op_count);
    // fsm_event (op 1) + FIRE_PYRO (op 2) = 2
    expect(op_count).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Test 10: Constant bool emits LOAD_CONST_B with value byte = 1
// ---------------------------------------------------------------------------

describe('compile_logic_graph — LOAD_CONST_B emission', () => {
  // A constant bool connected to pyro so it's reachable
  const graph: LogicGraphIR = {
    nodes: [
      { id: 'n_const', kind: 'constant', params: { kind: 'bool', value: 1 } },
      { id: 'n_pyro',  kind: 'pyro_3',  params: { duration: 100, role: '' } },
    ],
    edges: [
      { id: 'e1', from: { node: 'n_const', port: 'out' }, to: { node: 'n_pyro', port: 'a' } },
    ],
  };

  it('compiles successfully', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
  });

  it('first op byte after header is 0x02 (LOAD_CONST_B)', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Header is 12 bytes; first op byte is at offset 12
    expect(result.bytes[12]).toBe(0x02);
  });

  it('LOAD_CONST_B value byte is 1', () => {
    const result = compile_logic_graph(graph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Layout: opcode(1) + out_slot(2) + value(1) → value at offset 12+3 = 15
    expect(result.bytes[15]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Test 11: flags byte — logic_mode emission matrix (MC_FC_ALIGNMENT.md §13a)
// ---------------------------------------------------------------------------

describe('compile_logic_graph — logic_mode flags-byte emission matrix', () => {
  const base: Omit<LogicGraphIR, 'mode'> = { nodes: [], edges: [] };

  it('mode absent → bytes[3] == 0x00 (OFF, matches pre-Window-2 default)', () => {
    const result = compile_logic_graph({ ...base });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes[3]).toBe(0x00);
  });

  it("mode 'off' → bytes[3] == 0x00", () => {
    const result = compile_logic_graph({ ...base, mode: 'off' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes[3]).toBe(0x00);
  });

  it("mode 'shadow' → bytes[3] == 0x01", () => {
    const result = compile_logic_graph({ ...base, mode: 'shadow' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes[3]).toBe(0x01);
  });

  it("mode 'active' → rejected by the MC compiler (defense-in-depth ahead of the FC's own NACK 0xE0/BadState)", () => {
    const result = compile_logic_graph({ ...base, mode: 'active' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(['ACTIVE mode is post-flight only — rejected by MC']);
  });

  it('reserved bits 7:2 are always 0 for the storable modes (off / shadow)', () => {
    for (const mode of ['off', 'shadow'] as const) {
      const result = compile_logic_graph({ ...base, mode });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.bytes[3] & 0xFC).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Test 12: same graph body compiled OFF vs SHADOW yields DIFFERENT hashes
// (the mode lives inside the CRC-covered blob — §13a: "a program's authority
// level cannot be altered without changing its hash").
// ---------------------------------------------------------------------------

describe('compile_logic_graph — hash covers mode (off vs shadow diverge)', () => {
  const graph_body: Omit<LogicGraphIR, 'mode'> = {
    nodes: [
      { id: 'n_evt',  kind: 'fsm_event', params: { event: 'apogee' } },
      { id: 'n_pyro', kind: 'pyro_1',   params: { duration: 1000, role: 'Apogee' } },
    ],
    edges: [
      { id: 'e1', from: { node: 'n_evt', port: 'out' }, to: { node: 'n_pyro', port: 'a' } },
    ],
  };

  it('off and shadow compiles of the identical graph produce different CRC hashes', () => {
    const off = compile_logic_graph({ ...graph_body, mode: 'off' });
    const shadow = compile_logic_graph({ ...graph_body, mode: 'shadow' });
    expect(off.ok).toBe(true);
    expect(shadow.ok).toBe(true);
    if (!off.ok || !shadow.ok) return;
    expect(off.hash).not.toBe(shadow.hash);
  });

  it('off and shadow blobs are identical except for the flags byte and trailing CRC', () => {
    const off = compile_logic_graph({ ...graph_body, mode: 'off' });
    const shadow = compile_logic_graph({ ...graph_body, mode: 'shadow' });
    expect(off.ok).toBe(true);
    expect(shadow.ok).toBe(true);
    if (!off.ok || !shadow.ok) return;
    expect(off.bytes.length).toBe(shadow.bytes.length);
    // Same length, differ only at flags (offset 3) and the 4 trailing CRC bytes.
    const crc_start = off.bytes.length - 4;
    for (let i = 0; i < off.bytes.length; i++) {
      if (i === 3 || i >= crc_start) continue;
      expect(shadow.bytes[i]).toBe(off.bytes[i]);
    }
    expect(off.bytes[3]).toBe(0x00);
    expect(shadow.bytes[3]).toBe(0x01);
  });

  it('undefined mode and explicit "off" mode hash identically (default is OFF)', () => {
    const implicit = compile_logic_graph({ ...graph_body });
    const explicit = compile_logic_graph({ ...graph_body, mode: 'off' });
    expect(implicit.ok).toBe(true);
    expect(explicit.ok).toBe(true);
    if (!implicit.ok || !explicit.ok) return;
    expect(implicit.hash).toBe(explicit.hash);
  });
});
