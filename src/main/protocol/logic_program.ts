/**
 * Logic Graph IR types and enum definitions for C.A.S.P.E.R. 2 Logic VM.
 *
 * The LogicGraphIR is a JSON-serialisable directed acyclic graph emitted by
 * the renderer's logic graph editor. The compiler in logic_compiler.ts
 * transforms it into the binary format described in LOGIC_VM_SPEC.md.
 *
 * @module protocol/logic_program
 */

// ---------------------------------------------------------------------------
// Graph IR — JSON-serialisable
// ---------------------------------------------------------------------------

/** All valid node kinds in the logic graph. */
export type NodeKind =
  // Inputs
  | 'altitude'
  | 'vel'
  | 'accel'
  | 'tilt'
  | 'mach'
  | 'met'
  | 'stateT'
  | 'continuity'
  | 'armed'
  | 'motor_num'
  | 'constant'
  // State
  | 'fsm_event'
  | 'fsm_is'
  | 'fsm_in'
  | 'past_pad'
  | 'test_mode'
  // Logic
  | 'cmp'
  | 'thresh'
  | 'and'
  | 'or'
  | 'not'
  | 'xor'
  | 'edge'
  // Math
  | 'add'
  | 'sub'
  | 'mul'
  | 'div'
  | 'min'
  | 'max'
  | 'abs'
  | 'lowpass'
  // Timing
  | 'delay'
  | 'hold'
  | 'pulse'
  // Outputs
  | 'pyro_1'
  | 'pyro_2'
  | 'pyro_3';

/** A single node in the logic graph. */
export interface LogicNode {
  /** Unique node identifier, e.g. "n_abc1234". */
  id: string;
  /** Functional category of this node. */
  kind: NodeKind;
  /** Per-kind parameters — see NodeKind documentation for valid fields. */
  params?: Record<string, unknown>;
}

/** A directed edge connecting an output port of one node to an input port of another. */
export interface LogicEdge {
  /** Unique edge identifier (not used by the compiler). */
  id: string;
  /** Source port descriptor. */
  from: { node: string; port: string };
  /** Destination port descriptor. */
  to: { node: string; port: string };
}

/** The complete logic graph IR, as emitted by the renderer. */
export interface LogicGraphIR {
  nodes: LogicNode[];
  edges: LogicEdge[];
}

// ---------------------------------------------------------------------------
// OpCode — binary opcode byte for each VM instruction
// ---------------------------------------------------------------------------

export const enum OpCode {
  LOAD_INPUT   = 0x00,
  LOAD_CONST_F = 0x01,
  LOAD_CONST_B = 0x02,

  CMP          = 0x10,
  THRESH       = 0x11,
  AND          = 0x12,
  OR           = 0x13,
  NOT          = 0x14,
  XOR          = 0x15,
  EDGE         = 0x16,

  ADD          = 0x20,
  SUB          = 0x21,
  MUL          = 0x22,
  DIV          = 0x23,
  MIN          = 0x24,
  MAX          = 0x25,
  ABS          = 0x26,
  LOWPASS      = 0x27,

  DELAY        = 0x30,
  HOLD         = 0x31,
  PULSE        = 0x32,

  FSM_IS       = 0x40,
  FSM_IN       = 0x41,
  FSM_EVENT    = 0x42,
  PAST_PAD     = 0x43,
  TEST_MODE    = 0x44,

  FIRE_PYRO    = 0xF0,
}

// ---------------------------------------------------------------------------
// SignalSource — operand byte for LOAD_INPUT
// ---------------------------------------------------------------------------

export const enum SignalSource {
  ALTITUDE_EKF   = 0x00,
  ALTITUDE_BARO  = 0x01,
  ALTITUDE_GPS   = 0x02,
  VEL            = 0x03,
  ACCEL          = 0x04,
  TILT           = 0x05,
  MACH           = 0x06,
  MET            = 0x07,
  STATE_T        = 0x08,
  CONTINUITY_CH1 = 0x09,
  CONTINUITY_CH2 = 0x0A,
  CONTINUITY_CH3 = 0x0B,
  ARMED_CH1      = 0x0C,
  ARMED_CH2      = 0x0D,
  ARMED_CH3      = 0x0E,
  MOTOR_NUM      = 0x0F,
}

// ---------------------------------------------------------------------------
// FsmStateId — numeric index for each FSM state
// ---------------------------------------------------------------------------

export const enum FsmStateId {
  PAD       = 0,
  BOOST     = 1,
  COAST     = 2,
  COAST_1   = 3,
  SUSTAIN   = 4,
  COAST_2   = 5,
  APOGEE    = 6,
  DROGUE    = 7,
  MAIN      = 8,
  RECOVERY  = 9,
  TUMBLE    = 10,
  LANDED    = 11,
}

/** String names for FSM states, indexed by FsmStateId. */
export const FSM_STATE_NAMES: readonly string[] = [
  'PAD', 'BOOST', 'COAST', 'COAST_1', 'SUSTAIN', 'COAST_2',
  'APOGEE', 'DROGUE', 'MAIN', 'RECOVERY', 'TUMBLE', 'LANDED'
];

// ---------------------------------------------------------------------------
// FsmEventId — numeric index for each FSM event
// ---------------------------------------------------------------------------

export const enum FsmEventId {
  LAUNCH  = 0,
  BURNOUT = 1,
  APOGEE  = 2,
}

// ---------------------------------------------------------------------------
// CmpOp — comparison operator byte
// ---------------------------------------------------------------------------

export const enum CmpOp {
  LT  = 0,  // <
  LTE = 1,  // <=
  GT  = 2,  // >
  GTE = 3,  // >=
  EQ  = 4,  // ==
  NEQ = 5,  // !=
}

// ---------------------------------------------------------------------------
// EdgeMode — edge-detector mode byte
// ---------------------------------------------------------------------------

export const enum EdgeMode {
  RISING  = 0,
  FALLING = 1,
  EITHER  = 2,
}

// ---------------------------------------------------------------------------
// Binary format constants
// ---------------------------------------------------------------------------

/** Magic byte 1 — same as protocol magic. */
export const LOGIC_VM_MAGIC_1 = 0xCA;

/** Magic byte 2 — same as protocol magic. */
export const LOGIC_VM_MAGIC_2 = 0x5A;

/** Logic VM binary format version. */
export const LOGIC_VM_VERSION = 0x01;

/** Header size in bytes (magic×2 + version + flags + total_length + slot_count + op_count + reserved). */
export const LOGIC_VM_HEADER_SIZE = 12;

/** CRC trailer size in bytes. */
export const LOGIC_VM_CRC_SIZE = 4;
