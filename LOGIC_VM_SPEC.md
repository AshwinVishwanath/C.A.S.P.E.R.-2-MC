# C.A.S.P.E.R.-2 Logic VM Binary Format Specification

**Version:** 1  
**Status:** Defined — FC-side parser not yet implemented

---

## Overview

The Logic VM is a simple stack/slot machine operating on `f32` storage slots. A compiled program (emitted by the mission control Logic Graph compiler) consists of a fixed 12-byte header, a variable-length op stream, and a trailing CRC-32.

The FC interpreter allocates `slot_count` f32 slots, then executes each op in order. At the end of the op stream, each `FIRE_PYRO` instruction reads a boolean result from the designated slot and fires the pyro channel if the value is non-zero.

All multi-byte integers are **little-endian**. Floating-point values are **IEEE-754 single precision** (f32) **little-endian**.

---

## Blob Layout

```
Offset  Size  Type    Field
------  ----  ------  ----------------------------------------------------------
0       1     u8      MAGIC_1       = 0xCA
1       1     u8      MAGIC_2       = 0x5A
2       1     u8      version       = 0x01
3       1     u8      flags         = 0x00 (reserved)
4       2     u16 LE  total_length  entire blob length including this header and CRC
6       2     u16 LE  slot_count    number of f32 slots the VM must allocate
8       2     u16 LE  op_count      number of opcodes in the op stream
10      2     u16 LE  reserved      = 0x0000
12      ?     bytes   op_stream     variable-length sequence of encoded ops
N-4     4     u32 LE  crc32         CRC-32/ISO-HDLC over bytes [0 .. N-5] inclusive
```

The "hash" used for ACK matching is the trailing `crc32` value.

---

## CRC Convention

- Algorithm: CRC-32/ISO-HDLC  
- Polynomial: 0x04C11DB7 (reflected: 0xEDB88320)  
- Initial value: 0xFFFFFFFF  
- Reflect input: YES  
- Reflect output: YES  
- Final XOR: 0xFFFFFFFF  
- Coverage: bytes `[0 .. total_length - 5]` (everything except the 4 CRC bytes at the end)

Test vector: CRC-32 of ASCII `"123456789"` = `0xCBF43926`.

---

## Opcode Table

Each opcode entry starts with the 1-byte opcode, followed by its operands. All slot indices are `u16 LE`. The total byte size per op is shown in the Size column.

### Load Instructions

| Opcode | Mnemonic     | Size | Operands                             | Description                          |
|--------|-------------|------|--------------------------------------|--------------------------------------|
| 0x00   | LOAD_INPUT  | 4    | out:u16, source:u8                   | Load a hardware signal into slot     |
| 0x01   | LOAD_CONST_F| 7    | out:u16, value:f32                   | Load a float constant into slot      |
| 0x02   | LOAD_CONST_B| 4    | out:u16, value:u8 (0 or 1)           | Load a boolean constant into slot    |

### Logic Instructions

| Opcode | Mnemonic | Size           | Operands                                                        | Description                          |
|--------|---------|----------------|------------------------------------------------------------------|--------------------------------------|
| 0x10   | CMP     | 12             | out:u16, a:u16, b:u16, op:u8, hyst:f32                          | Compare two slots with hysteresis    |
| 0x11   | THRESH  | 12 + 2*count   | out:u16, count:u8, ins:[u16 × count], op:u8, threshold:f32, hyst:f32 | Threshold with multiple inputs  |
| 0x12   | AND     | 4 + 2*count    | out:u16, count:u8, ins:[u16 × count]                            | Logical AND of count bool slots      |
| 0x13   | OR      | 4 + 2*count    | out:u16, count:u8, ins:[u16 × count]                            | Logical OR of count bool slots       |
| 0x14   | NOT     | 5              | out:u16, a:u16                                                  | Logical NOT                          |
| 0x15   | XOR     | 7              | out:u16, a:u16, b:u16                                           | Logical XOR                          |
| 0x16   | EDGE    | 6              | out:u16, a:u16, mode:u8                                         | Edge detector (rising/falling/either)|

### Math Instructions

| Opcode | Mnemonic | Size | Operands               | Description             |
|--------|---------|------|------------------------|-------------------------|
| 0x20   | ADD     | 7    | out:u16, a:u16, b:u16  | a + b                   |
| 0x21   | SUB     | 7    | out:u16, a:u16, b:u16  | a - b                   |
| 0x22   | MUL     | 7    | out:u16, a:u16, b:u16  | a * b                   |
| 0x23   | DIV     | 7    | out:u16, a:u16, b:u16  | a / b                   |
| 0x24   | MIN     | 7    | out:u16, a:u16, b:u16  | min(a, b)               |
| 0x25   | MAX     | 7    | out:u16, a:u16, b:u16  | max(a, b)               |
| 0x26   | ABS     | 5    | out:u16, a:u16         | |a|                      |
| 0x27   | LOWPASS | 9    | out:u16, a:u16, tau_ms:u32 | 1st-order LPF, tau in ms|

### Timing Instructions

| Opcode | Mnemonic | Size | Operands                        | Description                      |
|--------|---------|------|---------------------------------|----------------------------------|
| 0x30   | DELAY   | 9    | out:u16, a:u16, duration_ms:u32 | Output follows input after delay |
| 0x31   | HOLD    | 9    | out:u16, a:u16, duration_ms:u32 | Latch high for duration on input |
| 0x32   | PULSE   | 9    | out:u16, a:u16, duration_ms:u32 | One-shot pulse on rising edge    |

### FSM / State Instructions

| Opcode | Mnemonic  | Size       | Operands                          | Description                          |
|--------|----------|------------|-----------------------------------|--------------------------------------|
| 0x40   | FSM_IS   | 4          | out:u16, state_id:u8              | True when FSM is in exact state      |
| 0x41   | FSM_IN   | 4 + count  | out:u16, count:u8, ids:[u8×count] | True when FSM is in any listed state |
| 0x42   | FSM_EVENT| 4          | out:u16, event_id:u8              | True on the tick the event fires     |
| 0x43   | PAST_PAD | 3          | out:u16                           | True when FSM has left PAD           |
| 0x44   | TEST_MODE| 3          | out:u16                           | True when test mode is active        |

### Output Instruction

| Opcode | Mnemonic  | Size | Operands                                              | Description                     |
|--------|----------|------|-------------------------------------------------------|---------------------------------|
| 0xF0   | FIRE_PYRO | 7   | channel:u8, input_slot:u16, duration_ms:u16, role_tag:u8 | Fire pyro if input slot is true |

`role_tag` is an informational byte (sum of role string characters mod 256) and has no functional effect.

---

## Signal Source IDs (LOAD_INPUT operand)

| ID   | Name            | Type  | Description                       |
|------|----------------|-------|-----------------------------------|
| 0x00 | ALTITUDE_EKF   | float | EKF-estimated altitude (m)        |
| 0x01 | ALTITUDE_BARO  | float | Barometer altitude (m)            |
| 0x02 | ALTITUDE_GPS   | float | GPS altitude (m)                  |
| 0x03 | VEL            | float | Vertical velocity (m/s)           |
| 0x04 | ACCEL          | float | Total acceleration (m/s²)         |
| 0x05 | TILT           | float | Tilt angle from vertical (deg)    |
| 0x06 | MACH           | float | Mach number                       |
| 0x07 | MET            | float | Mission elapsed time (s)          |
| 0x08 | STATE_T        | float | Time in current FSM state (s)     |
| 0x09 | CONTINUITY_CH1 | bool  | Pyro channel 1 continuity         |
| 0x0A | CONTINUITY_CH2 | bool  | Pyro channel 2 continuity         |
| 0x0B | CONTINUITY_CH3 | bool  | Pyro channel 3 continuity         |
| 0x0C | ARMED_CH1      | bool  | Pyro channel 1 armed state        |
| 0x0D | ARMED_CH2      | bool  | Pyro channel 2 armed state        |
| 0x0E | ARMED_CH3      | bool  | Pyro channel 3 armed state        |
| 0x0F | MOTOR_NUM      | int   | Active motor stage number         |

---

## FSM State IDs

| ID | Name     |
|----|----------|
| 0  | PAD      |
| 1  | BOOST    |
| 2  | COAST    |
| 3  | COAST_1  |
| 4  | SUSTAIN  |
| 5  | COAST_2  |
| 6  | APOGEE   |
| 7  | DROGUE   |
| 8  | MAIN     |
| 9  | RECOVERY |
| 10 | TUMBLE   |
| 11 | LANDED   |

---

## FSM Event IDs

| ID | Name    | Description                              |
|----|---------|------------------------------------------|
| 0  | launch  | Launch detect (accel threshold crossed)  |
| 1  | burnout | Motor burnout detected                   |
| 2  | apogee  | Apogee detected (velocity sign change)   |

---

## Comparison Operator Codes (CmpOp)

| Code | Operator | Meaning           |
|------|---------|-------------------|
| 0    | <       | Less than         |
| 1    | <=      | Less or equal     |
| 2    | >       | Greater than      |
| 3    | >=      | Greater or equal  |
| 4    | ==      | Equal             |
| 5    | !=      | Not equal         |

---

## Edge Mode Codes

| Code | Mode    | Description                                |
|------|---------|--------------------------------------------|
| 0    | rising  | True for one tick when input goes 0→1      |
| 1    | falling | True for one tick when input goes 1→0      |
| 2    | either  | True for one tick on any transition        |

---

## Example Program: Seed Graph

Graph description:
- `fsm_event(apogee)` → `hold(500ms)` → `and.a`
- `fsm_in([COAST, APOGEE, DROGUE])` → `and.b`
- `and(count=2)` → `pyro_1(duration=1000ms, role="Apogee")`

Slot assignments:
- Slot 0: `fsm_event` output
- Slot 1: `fsm_in` output
- Slot 2: `hold` output
- Slot 3: `and` output

Op stream (5 ops):

```
Op 0 — FSM_EVENT (apogee → slot 0)
  42        ; opcode FSM_EVENT
  00 00     ; out_slot = 0
  02        ; event_id = 2 (apogee)

Op 1 — FSM_IN ([COAST=2, APOGEE=6, DROGUE=7] → slot 1)
  41        ; opcode FSM_IN
  01 00     ; out_slot = 1
  03        ; count = 3
  02        ; state_id COAST
  06        ; state_id APOGEE
  07        ; state_id DROGUE

Op 2 — HOLD (slot 0, 500 ms → slot 2)
  31        ; opcode HOLD
  02 00     ; out_slot = 2
  00 00     ; input_slot = 0
  F4 01 00 00  ; duration_ms = 500 (u32 LE)

Op 3 — AND (slots 2 & 1, count=2 → slot 3)
  12        ; opcode AND
  03 00     ; out_slot = 3
  02        ; count = 2
  02 00     ; ins[0] = slot 2
  01 00     ; ins[1] = slot 1

Op 4 — FIRE_PYRO (channel=1, from slot 3, 1000ms)
  F0        ; opcode FIRE_PYRO
  01        ; channel = 1
  03 00     ; input_slot = 3
  E8 03     ; duration_ms = 1000 (u16 LE)
  07        ; role_tag = sum("Apogee") % 256 = 65+112+111+103+101+101 = 593 % 256 = 81... (informational)
```

Full blob hex dump (header + ops + CRC), with annotations:

```
Offset  Bytes                          Comment
------  ----------------------------   -------
00      CA 5A                          MAGIC_1, MAGIC_2
02      01 00                          version=1, flags=0
04      XX XX                          total_length (u16 LE, computed at emit time)
06      04 00                          slot_count = 4
08      05 00                          op_count = 5
0A      00 00                          reserved
0C      42 00 00 02                    FSM_EVENT → slot 0, event apogee(2)
10      41 01 00 03 02 06 07           FSM_IN → slot 1, count=3, COAST/APOGEE/DROGUE
17      31 02 00 00 00 F4 01 00 00     HOLD → slot 2, in=slot0, 500ms
20      12 03 00 02 02 00 01 00        AND → slot 3, count=2, slots 2 & 1
28      F0 01 03 00 E8 03 XX           FIRE_PYRO ch=1, slot=3, 1000ms, role_tag
2F      XX XX XX XX                    CRC-32 (computed over [0..N-5])
```

Note: `XX` bytes are computed at compile time and depend on the exact role string and total blob length.

---

## IPC Protocol

Logic upload uses two IPC channels:

| Channel                 | Direction          | Args                  | Returns                                               |
|-------------------------|--------------------|-----------------------|-------------------------------------------------------|
| `casper:upload-logic`   | renderer → main    | graph: LogicGraphIR   | `{ ok, hash?, stats?, sent?, errors? }`               |
| `casper:compile-logic`  | renderer → main    | graph: LogicGraphIR   | `{ ok, bytes?: number[], hash?, stats?, errors? }`    |

`casper:upload-logic` compiles and, if the FC is connected, transmits the binary. `sent: false` is returned when the FC is offline (offline preview path). `casper:compile-logic` always returns the bytes as a `number[]` without transmitting.

The FC acknowledges logic upload with `MSG_ID_ACK_LOGIC = 0xA4`, returning the CRC-32 hash of the received program. The MC verifies it matches the `hash` from the compile result.

---

## Minimum FC-Side Interpreter (~200 lines C)

```c
// Pseudocode sketch — actual implementation on FC side
typedef struct { float slots[MAX_SLOTS]; } vm_state_t;

void vm_run(const uint8_t *prog, uint16_t prog_len, vm_state_t *state) {
    // Validate header: magic, version, CRC
    // Read slot_count, op_count from header
    const uint8_t *p = prog + 12; // skip header
    for (uint16_t i = 0; i < op_count; i++) {
        uint8_t op = *p++;
        switch (op) {
            case 0x00: { // LOAD_INPUT
                uint16_t out = read_u16_le(p); p+=2;
                uint8_t src  = *p++;
                state->slots[out] = read_signal(src);
                break;
            }
            // ... one case per opcode
            case 0xF0: { // FIRE_PYRO
                uint8_t ch  = *p++;
                uint16_t in = read_u16_le(p); p+=2;
                uint16_t dur= read_u16_le(p); p+=2;
                p++; // skip role_tag
                if (state->slots[in] != 0.0f) pyro_fire(ch, dur);
                break;
            }
        }
    }
}
```
