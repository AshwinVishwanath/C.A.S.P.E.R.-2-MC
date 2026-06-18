# C.A.S.P.E.R. — Messaging & Telemetry Protocol, Version 6

**Protocol Version:** 6
**Status:** DRAFT — clean-break redesign of v5. Not wire-compatible with v5.
**Scope:** the **wire contract** between Flight Computer (FC), Ground Station (GS), and
Mission Control (MC). App internals (Electron IPC, preload bridge, React hooks, UI) are out of
scope and live in `APP_ARCHITECTURE.md`.
**Integrity:** CRC-32/ISO-HDLC (poly `0xEDB88320`, init `0xFFFFFFFF`, reflect in/out, final XOR
`0xFFFFFFFF`; test vector `CRC32("123456789") = 0xCBF43926`).
**Byte order:** little-endian throughout.
**Bands:** 868 MHz (EU/UK) / 915 MHz (US), license-free ISM.

> This document supersedes `INTERFACE_SPEC.md` (v5). It exists because v5 accreted message types
> ad hoc, drifted from the implementation (size mismatches, undocumented IDs, a parser-less
> `ACK_LOGIC`, a readout protocol whose command bytes collide with telemetry IDs), and its
> "security" (magic bytes + CRC + cleartext nonce) was decorative — an ISM-band attacker can forge
> a byte-perfect ARM/FIRE. v6 fixes the structure, adds real identity, and authenticates the
> safety-critical command path.

---

## 0. Design priorities

In strict priority order, because they trade against each other:

1. **Range** — minimize per-frame airtime on the LoRa downlink. Every byte added to a high-rate
   frame costs link budget.
2. **Recovery** — the GPS/position + beacon path must survive to maximum range.
3. **Safety** — pyro ARM/FIRE/CONFIG commands are cryptographically authenticated (anti-spoof,
   anti-replay). This is non-negotiable.
4. **Simplicity** — one framing, one crypto primitive (AES), one pre-shared key, minimal fault
   layers.

The resulting model is **asymmetric**: commands (rare) are fully authenticated; high-rate telemetry
is kept lean; only the GPS/position block is encrypted (location privacy at minimal airtime cost).

---

## 1. Architecture

```
                  ┌────── FC Direct (USB, bench) ───────┐
 ┌───────────┐    │                                     ▼
 │ Flight    │────┘                              ┌──────────────┐
 │ Computer  │                                   │  Mission     │
 │ (STM32H7) │──LoRa──▶┌──────────┐──USB(COBS)──▶│  Control     │
 └───────────┘  868/915│ Ground   │              │  (Electron)  │
        ▲              │ Station  │◀─USB(COBS)────│              │
        └────LoRa──────│ (relay)  │   commands    └──────────────┘
          commands     └──────────┘
```

- **FC Direct:** MC ↔ FC over USB (bench / pad-side). Telemetry = class `0x0_`. Commands sent
  directly.
- **GS Relay:** FC ↔ GS over LoRa; GS ↔ MC over USB. GS **relays** FC frames and **wraps** telemetry
  with measured link quality (class `0x1_`). Commands flow MC → GS → (LoRa) → FC.
- Both modes may be active; MC prefers GS when connected, falls back to FC.

**Trust boundary:** authentication is **end-to-end FC ↔ MC**. The GS is a **keyless** relay — it
never holds the PSK, never signs, never decrypts. (See §5.)

---

## 2. Transport & framing

### 2.1 Interactive framing (COBS)
All interactive messages use COBS framing with a `0x00` delimiter, unchanged from v5:

`wire = [COBS(payload)] [0x00]`

- Max COBS block 254 data bytes; empty payload encodes to `[0x01]`.
- Receiver accumulates to `0x00`, COBS-decodes, then dispatches on `payload[0]` (the classed
  msg-ID, §4). Decode failures are silently discarded. RX buffer guard 65536 B.
- Serial: 115200 8N1, no flow control (both FC and GS USB links).

### 2.2 Bulk framing (flight-log readout) — explicit mode, no collision
The flash-dump path is high-throughput and must not pay per-frame COBS overhead. In v5 it was an
implicit "raw mode" whose command bytes `0x01–0x05` collided with telemetry IDs. In v6 it is an
**explicit session**:

1. MC sends framed `CMD_BULK (0x27)` (authenticated, §9) to request entry into bulk mode.
2. FC replies framed `ACK_BULK` confirming, then **both ends switch to raw block transfer** for the
   duration of the session.
3. Bulk sub-commands and stream headers live **inside** the session (§12), so they share **no**
   namespace with the top-level classed msg-IDs. Collision eliminated.
4. Session ends on an explicit `BULK_END` marker or transport close; both ends return to COBS framing.

### 2.3 CRC-32 placement
Every framed message ends with a 4-byte CRC-32 (LE) over **all preceding bytes** (including any auth
tag). CRC is the **integrity** check (catches corruption); it is **not** the security boundary —
authentication is the auth tag (§5).

---

## 3. Identity

v5 had no way to tell two CASPER units apart. v6 adds two identifiers:

- **Device UID** — the STM32 96-bit factory unique ID (`UID[0..2]`), or a 32-bit truncation
  `dev_id = CRC32(UID[0..11])`. Carried in the handshake/identity messages (§11). MC **pins** the
  expected `dev_id` on first connect and warns on mismatch ("wrong flight computer").
- **Airframe ID** (`af_id`, u8) — a small operator-assigned vehicle ID, present in **every**
  telemetry and command frame header. Purpose:
  - MC **filters** incoming frames by the expected `af_id` → rejects same-frequency cross-talk from
    another rocket.
  - The `af_id` is part of the authenticated command header and the AEAD nonce → a command is
    **bound to one vehicle** and cannot be replayed against another.

`af_id` is set in the flight config (§14) and reported in the handshake so MC and FC agree.

---

## 4. Message-ID class map

Classed, with reserved ranges for growth. The high nibble is the class.

| Class | Range | Direction | Purpose |
|---|---|---|---|
| `0x0_` | 0x00–0x0F | FC → MC | FC telemetry |
| `0x1_` | 0x10–0x1F | GS → MC | GS relay (FC core + GS envelope) |
| `0x2_` | 0x20–0x2F | MC → FC | Commands (authenticated) |
| `0x3_` | 0x30–0x3F | FC → MC | Responses (ack/nack) |
| `0x4_` | 0x40–0x4F | bidir | System (handshake/identity/time) |
| `0x5_`–`0x7_` | 0x50–0x7F | — | **Reserved** |
| `0x8_`+ | 0x80–0xFF | — | **Reserved** (do not assign without a spec revision) |

### Assigned IDs

| ID | Name | Dir | Auth | Notes |
|---|---|---|---|---|
| `0x01` | FC_FAST | FC→MC | none | High-rate telemetry |
| `0x02` | FC_GPS | FC→MC | enc | GPS/position (encrypted block) |
| `0x03` | FC_EVENT | FC→MC | none | Discrete event |
| `0x04`–`0x0F` | — | | | reserved (FC telemetry) |
| `0x10` | GS_TELEM | GS→MC | none | FC_FAST core + GS link envelope |
| `0x11` | GS_GPS | GS→MC | enc | FC_GPS core + GS envelope |
| `0x12` | GS_EVENT | GS→MC | none | FC_EVENT core + GS envelope |
| `0x13` | GS_LINK | GS→MC | none | GS-only link/health status |
| `0x14` | GS_CORRUPT | GS→MC | none | Uncorrectable-frame report |
| `0x20` | CMD_ARM | MC→FC | **tag** | Arm/disarm |
| `0x21` | CMD_FIRE | MC→FC | **tag** | Fire |
| `0x22` | CMD_TESTMODE | MC→FC | **tag** | Toggle test mode (PAD only) |
| `0x23` | CMD_CONFIG | MC→FC | **tag** | Upload flight config |
| `0x24` | CMD_LOGIC | MC→FC | **tag** | Upload Logic VM program |
| `0x25` | CMD_CONFIRM | MC→FC | **tag** | Operator confirm (FIRE) |
| `0x26` | CMD_ABORT | MC→FC | **tag** | Abort current exchange |
| `0x27` | CMD_BULK | MC→FC | **tag** | Enter bulk/readout session |
| `0x28` | CMD_SIM_FLIGHT | MC→FC | **tag** | Trigger sim flight (bench) |
| `0x30` | ACK_ARM | FC→MC | **tag** | |
| `0x31` | ACK_FIRE | FC→MC | **tag** | |
| `0x32` | ACK_CONFIG | FC→MC | **tag** | Echoes config hash |
| `0x33` | ACK_LOGIC | FC→MC | **tag** | Echoes program hash (parser REQUIRED) |
| `0x34` | ACK_BULK | FC→MC | **tag** | Confirms bulk entry |
| `0x3E` | NACK | FC→MC | **tag** | Rejection + reason code |
| `0x40` | HS_REQ | MC→FC | none | Handshake request |
| `0x41` | HS_RESP | FC→MC | none | Handshake response (UID, versions) |
| `0x42` | IDENTITY | FC→MC | none | Extended identity report |

"Auth" column: `none` = CRC only; `enc` = GPS block encrypted (§5.3); `tag` = AES-CMAC
authenticated (§5.2). ACK/NACK from FC are tagged so MC can trust state changes.

---

## 5. Security envelope

**One primitive, one key.** AES-128 (STM32H7 has a hardware AES accelerator), a single
**pre-shared key (PSK)** provisioned to **FC + MC only**. GS is keyless.

- **Commands & FC responses:** authenticated with **AES-CMAC** (RFC 4493), tag truncated to **8
  bytes**, over the entire frame from `msg_id` through the last payload byte (everything before the
  tag and CRC).
- **GPS/position block:** encrypted+authenticated with **AES-CCM** (8-byte tag), nonce per §5.3.
- **Telemetry (FAST/EVENT):** **not** authenticated (range priority). Integrity = CRC only.

### 5.1 Authenticated command/response header
```
Offset  Field        Type     Notes
0       msg_id       u8       classed (§4)
1       af_id        u8       airframe binding
2–5     counter      u32 LE   monotonic per (direction, af_id)
6..     payload      …        message-specific
n..n+7  tag          8 bytes  AES-CMAC over [0 .. n-1]
n+8..   crc32        u32 LE   CRC over [0 .. tag end]
```
- **Replay protection:** FC stores `last_rx_counter[af_id]` (per direction) in non-volatile or
  session memory; **rejects** any command whose `counter <= last_rx_counter` (NACK `ReplayOrOrder`).
  MC persists `tx_counter` across sessions so it never reuses a value. Counter exhaustion (2³²) ⇒
  re-key.
- **Verification order on FC:** (1) CRC ok, (2) `af_id` == own, (3) `counter` strictly increasing,
  (4) CMAC tag valid → only then act. Any failure ⇒ drop or NACK; **never** act on tag-fail.
- MC verifies ACK/NACK tags the same way before trusting a state change (no more raw
  telemetry-as-ACK, §10).

### 5.2 Why CMAC (not just a nonce)
CMAC over the counter+payload gives both **authentication** (only a PSK holder can produce a valid
tag → no forged FIRE) and, combined with the strictly-increasing counter, **replay protection** (a
captured FIRE can't be re-sent). The v5 magic bytes and 16-bit cleartext nonce provided neither.

### 5.3 GPS encryption (the one confidential field)
`FC_GPS (0x02)` / `GS_GPS (0x11)` carry the position in an **AES-CCM** block:
- **Nonce (13 B):** `af_id(1) ‖ dir(1) ‖ msg_counter(4) ‖ 0x00×7`. `msg_counter` is a **dedicated
  4-byte GPS counter** (GPS is low-rate, ~1–5 Hz → no nonce reuse within a flight under one key).
- **Plaintext:** `dlat_mm(i32) ‖ dlon_mm(i32)` (optionally `alt_msl`). **AAD:** the cleartext GPS
  header (`msg_id, af_id, fix_type, sat_count, msg_counter`).
- **Output:** ciphertext (8 B) + CCM tag (8 B). Everything else in the GPS frame stays clear.
- **Policy switch:** to change the downlink posture (full-clear for max range, or full-frame AEAD
  for max privacy) only this block's coverage changes — §0 priority decision is isolated here.

### 5.4 Key management
- PSK provisioned **out-of-band** at bench/build time; **never** committed to the repo and **never**
  stored in plaintext in the packaged MC `.exe` — MC keeps it in the OS keystore / encrypted-at-rest
  (ties to the app-hardening track). FC keeps it in protected flash.
- Rotation = re-provision both endpoints + reset counters.
- Threat note: PSK compromise ⇒ full break. Per-airframe keys are a future option (more provisioning
  complexity); single PSK is the v6 minimal-fault-layers choice.

---

## 6. FC telemetry (class 0x0_)

### 6.1 FC_FAST (0x01) — high-rate, unauthenticated
```
Offset  Field        Type      Scale/Unit
0       msg_id       u8        0x01
1       af_id        u8        airframe id
2–3     seq          u16 LE    rolling frame counter
4–5     status       u16 LE    status bitmap (§15.2)
6–7     altitude     u16 LE    ×1.0 m (AGL)
8–9     velocity     i16 LE    ×0.1 m/s (+up)
10–14   quaternion   5 B       smallest-three (§15.1)
15–16   flight_time  u16 LE    ×0.1 s
17      battery      u8        6.0 + raw×0.012 V
18–21   crc32        u32 LE    over [0..17]
```
**Size: 22 B** (+2 vs v5: `af_id` + widened seq; no auth → range preserved).

### 6.2 FC_GPS (0x02) — position, encrypted block
```
Offset  Field        Type      Notes
0       msg_id       u8        0x02
1       af_id        u8
2–5     msg_counter  u32 LE    GPS AEAD nonce counter (§5.3)
6       fix_type     u8        0=none, 2=2D, 3=3D
7       sat_count    u8
8–9     alt_msl      u16 LE    ×10.0 m (clear)
10–17   enc_pos      8 B       AES-CCM ciphertext of dlat_mm‖dlon_mm
18–25   ccm_tag      8 B       AES-CCM tag (AAD = [0..9])
26–29   crc32        u32 LE
```
**Size: 30 B.** (If posture changes to full-clear, drop CCM and inline `dlat_mm(i32)‖dlon_mm(i32)`.)

### 6.3 FC_EVENT (0x03) — discrete event, unauthenticated
```
0       msg_id       u8        0x03
1       af_id        u8
2       event_type   u8        (§15.3)
3–4     event_data   u16 LE    event-specific
5–6     flight_time  u16 LE    ×0.1 s
7–10    crc32        u32 LE
```
**Size: 11 B.**

---

## 7. GS relay (class 0x1_) — keyless wrap

The GS receives an FC frame over LoRa and **re-emits** it to MC with a GS envelope appended. It does
**not** modify the FC core bytes (so it cannot invalidate FC integrity and needs no key).

### 7.1 GS_TELEM (0x10)
```
0        msg_id        u8        0x10
1–21     fc_core       21 B      bytes [0..20] of FC_FAST verbatim (its own CRC dropped or kept*)
22–23    rssi          i16 LE    ×0.1 dBm
24       snr           i8        ×0.25 dB
25–26    freq_err      i16 LE    Hz
27–28    data_age_ms   u16 LE
29       recovery      u8        bit7 recovered, bits6:4 method, bits3:0 confidence
30–33    crc32         u32 LE    GS-computed over [0..29]
```
\* Implementation note: define whether the FC core is carried with or without its own CRC; MC must
know the exact split. (Resolve in §16 checklist with FC/GS.)

Derived values (mach/qbar/euler) that v5 packed into GS_TELEM are **MC-computed** (§15.4) — they are
deterministic from alt/vel/quat and waste airtime on the wire. Removing them shrinks the relayed
frame (range win). `GS_GPS (0x11)` wraps FC_GPS the same way (encrypted block passes through
untouched — GS can't read it, which is the point). `GS_EVENT (0x12)`, `GS_LINK (0x13)`,
`GS_CORRUPT (0x14)` per §16.

---

## 8. (Reserved)

---

## 9. Commands (class 0x2_) & responses (class 0x3_)

All use the authenticated header (§5.1): `msg_id, af_id, counter, payload…, tag(8), crc(4)`.

### 9.1 CMD_ARM (0x20)
payload: `channel(u8 0–3) ‖ action(u8: 1=arm,0=disarm)`
### 9.2 CMD_FIRE (0x21)
payload: `channel(u8 0–3) ‖ duration_ms(u16 LE)` — note: widened to u16 (v5 clamped to u8/255 ms).
### 9.3 CMD_CONFIRM (0x25) / CMD_ABORT (0x26)
payload: empty (the counter+tag bind it to the exchange; no separate nonce field needed).
### 9.4 CMD_TESTMODE (0x22), CMD_BULK (0x27), CMD_SIM_FLIGHT (0x28)
payload: empty (toggle/enter semantics).
### 9.5 CMD_CONFIG (0x23) — payload = flight-config block (§14). CMD_LOGIC (0x24) — payload = Logic VM blob (§13).

### 9.6 Responses
- **ACK_ARM (0x30):** `echo_channel, echo_action, arm_bitmap(u8), cont_bitmap(u8)`
- **ACK_FIRE (0x31):** `echo_channel, echo_duration(u16), flags(u8: bit0 test_mode, bit1 armed), cont_bitmap(u8)`
- **ACK_CONFIG (0x32):** `config_hash(u32)`
- **ACK_LOGIC (0x33):** `program_hash(u32), accepted(u8)` — **parser REQUIRED** (v5 dropped it).
- **ACK_BULK (0x34):** `ready(u8)`
- **NACK (0x3E):** `reason(u8)` — codes in §15.5 (adds `ReplayOrOrder`, `BadAuth`, `BadAirframe`).

All responses echo the command's `counter` in their header so MC matches them to the exchange, and
carry their own tag so MC can trust them.

---

## 10. Command exchange (simplified CAC)

Authentication now does the heavy lifting, so the v5 multi-leg machine collapses:

```
IDLE → SEND(cmd, counter, tag) → AWAIT_ACK ──(valid tag+counter)──▶ VERIFIED
                                     │                                  │
                              (timeout/retry ≤N)                 FIRE only: AWAIT_OPERATOR_CONFIRM
                                     │                                  │
                                   FAILED ◀──(NACK/retries/abort)──     ▼
                                                                  SEND(CONFIRM) → COMPLETE
```

- **FIRE requires an explicit operator CONFIRM** — replaces v5's 1 s auto-confirm (a safety
  regression). ARM/DISARM/CONFIG complete on a verified ACK.
- **Echo verification** (channel/action/duration match) stays as cheap defense-in-depth, **after**
  tag verification.
- **No telemetry-as-ACK.** Arm-state confirmation comes only from a tag-verified `ACK_ARM`, never
  from raw `FC_FAST` status bits (which are unauthenticated).
- Timers: leg timeout 2 s, retries ≤ 5, overall 10 s (retransmit reuses the **same counter+tag** so
  it isn't a replay). Operator CONFIRM window: 10 s, else auto-abort.

---

## 11. System messages (class 0x4_)

### 11.1 HS_REQ (0x40) — MC→FC
`msg_id` only (+CRC). Sent on connect.
### 11.2 HS_RESP (0x41) — FC→MC
```
0      msg_id          u8     0x41
1      protocol_ver    u8     = 6
2–5    dev_id          u32 LE CRC32(STM32 UID) — device identity (§3)
6      af_id           u8     airframe id the FC is configured for
7      caps            u8     capability bits (auth on, gps-enc on, bulk, logic…)
8–N    fw_version      ASCII  null-padded or length-prefixed
N+1..  crc32           u32 LE
```
### 11.3 IDENTITY (0x42) — optional extended report (full 96-bit UID, board rev, build hash).

MC pins `dev_id`+`af_id` on first successful connect; a later mismatch raises a **wrong-FC** warning
before any command is enabled.

---

## 12. Flight-log bulk readout (in-session sub-protocol)

Entered via `CMD_BULK (0x27)` → `ACK_BULK (0x34)` (§2.2). Inside the session, raw block transfer
(no COBS). Carries forward the v5 implementation, now formally specified:

- **Sub-commands** (1 byte, in-session namespace — no collision with §4):
  `HR=0x01, LR=0x02, SUMMARY=0x03, METADATA=0x04, ERASE=0x05, END=0xFF`.
- **Stream headers:** `CASP` (HR/LR, 16 B), `SUMM` (12 B), `META` (28 B) — layouts per the v5
  `readout_parser` (carried forward verbatim; documented here as the authority).
- **Entries:** HR 64 B, LR 64 B (layouts per readout_parser).
- **Each stream** ends with a 4-byte CRC-32 over its payload.
- **ERASE now ACKs:** FC replies `ERASE_DONE(0x06)` on completion (v5 was timing-only).

(Full byte tables to be transcribed from `src/main/readout/readout_parser.ts` into §12 appendix.)

---

## 13. Logic VM upload

- `CMD_LOGIC (0x24)` payload = compiled blob (header per `logic_program.ts`: magic `0xCA 0x5A`,
  version, flags, total_length u16, slot_count u16, op_count u16, reserved, op_stream, trailing
  CRC-32). **Add a max-size check** (bound by COBS/UART limits) — v5 was unbounded.
- The blob travels inside the authenticated `CMD_LOGIC` envelope (tag covers it).
- **ACK_LOGIC (0x33)** `program_hash(u32) ‖ accepted(u8)` — MC compares hash to the compile result.
  **A parser is mandatory** (v5 silently dropped 0xA4).

---

## 14. Flight configuration

Carried forward from v5's 163-byte block (§15 of v5), with two additions:
- prepend/extend the header with `af_id (u8)` so the airframe binding is configured here.
- bump the config block's own `config_version` to track changes alongside the protocol version.

Uploaded via `CMD_CONFIG (0x23)`; FC replies `ACK_CONFIG (0x32)` with the config hash
(`CRC32(block[0..len-5])`). Pyro channel layout, pad location, fallback thresholds, and pre-flight
thresholds are unchanged (transcribe the table from `config_serialiser.ts` into §14 appendix).

---

## 15. Encodings (carried forward — re-documented)

### 15.1 Smallest-three quaternion (5 B)
```
Byte0: C[7:0]                Byte1: B[3:0]|C[11:8]    Byte2: B[11:4]
Byte3: A[7:0]                Byte4: drop[7:6]|rsvd[5:4]|A[11:8]
```
- A,B,C are 12-bit signed, scale **4096.0** (`component = raw/4096`).
- `drop` (2 bits) = index of the dropped (largest, forced-positive) component (0=w,1=x,2=y,3=z),
  ascending order skipping the dropped index.
- Reconstruct: `dropped = sqrt(max(0, 1 − A² − B² − C²))`.

### 15.2 Status bitmap (u16 LE)
Byte0: `CNT1..4` (bits0–3), `ARM1..4` (bits4–7). Byte1: `ERROR` (bit2), `FIRED` (bit3),
`FSM_STATE` (bits4–7, 4-bit, §15.6 of v5: PAD..LANDED 0x0–0xB). Bits 8–9 reserved.

### 15.3 Event types
`State=0x01, Pyro=0x02, Apogee=0x03, Error=0x04, Origin=0x05, Burnout=0x06, Staging=0x07, Arm=0x08`.

### 15.4 MC-derived (NOT on the wire)
Mach (ISA model), q̄ (exp density, scale height 8500 m), Euler ZYX from quaternion — computed by MC
from alt/vel/quat. **Removed from GS_TELEM** (were redundant on the wire in v5).

### 15.5 NACK reasons
v5 codes `0x01–0x0A` (CrcFail, BadState, NotArmed, NoTestMode, NonceReuse→**deprecated**,
NoContinuity, LowBattery, SelfTest, CfgTooLarge, FlashFail) **plus** v6:
`BadAuth=0x0B` (tag fail), `ReplayOrOrder=0x0C` (counter), `BadAirframe=0x0D`.

### 15.6 Fixed-point scalings
alt ×1.0 m; vel ×0.1 m/s; time ×0.1 s; batt 6.0+raw×0.012 V; gps-alt ×10 m; rssi ×0.1 dBm; snr
×0.25 dB; freq_err ×1 Hz; gps delta mm/1000 → m. **Range caps:** alt u16 → 65535 m AGL (adequate;
flag if a target exceeds it). vel i16×0.1 → ±3276.7 m/s.

---

## 16. Per-endpoint implementation checklist

**FC firmware (separate repo):**
- [ ] Emit `dev_id` (STM32 UID) + `af_id` + `caps` in HS_RESP.
- [ ] Put `af_id` + rolling `seq` in FC_FAST; `af_id` + GPS counter + AES-CCM position block in FC_GPS.
- [ ] Verify command envelope: CRC → af_id → counter monotonic → AES-CMAC tag, in that order; NACK
      with new reason codes on failure; **never act on tag-fail**.
- [ ] Persist `tx`/`rx` counters across reset; re-key on exhaustion.
- [ ] Require explicit CONFIRM for FIRE.
- [ ] Bulk session entry/exit; ERASE_DONE ack; size-check Logic blobs.

**GS firmware (separate repo):**
- [ ] Keyless relay: forward command frames FC↔MC byte-exact (no re-sign).
- [ ] Wrap FC telemetry into `0x1_` with the link envelope appended; **do not** touch FC core bytes
      or the encrypted GPS block.
- [ ] Emit `GS_LINK`/`GS_CORRUPT` for health + uncorrectable frames.

**Mission Control (this repo):**
- [ ] New classed `constants`/`types`; v6 parser + builders; ACK_LOGIC parser.
- [ ] Crypto module: AES-CMAC tag/verify, AES-CCM GPS, counter store, af_id filter, PSK key store.
- [ ] Pin `dev_id`/`af_id` on connect (wrong-FC warning).
- [ ] Simplified CAC w/ explicit FIRE confirm; drop telemetry-as-ACK.
- [ ] GS-envelope unwrap; MC-side mach/q̄/euler derivation.
- [ ] App-hardening (CSP, IPC arg validation, navigation guard, fuses) from the security review.

---

## 17. Test vectors (to generate from the reference implementation)

For each message: a sample byte array + decoded values (mirroring the v5 CRC test-vector style).
Crypto vectors (CMAC tag, CCM ciphertext+tag) to be generated with a fixed **test PSK** (documented
here, used only in tests) so FC and MC can cross-check byte-for-byte. **TODO:** fill once the
reference crypto module lands (Task: MC crypto module).

---

## 18. Open items
- Exact FC-core split in GS wrap (with/without inner CRC) — §7.1.
- AES-128 vs ChaCha20-Poly1305 — defaulting to AES for STM32H7 hardware; revisit with FC firmware.
- Confirm LoRa max frame size + duty-cycle budget from GS firmware to bound frame growth.

---

## Appendix A — Flight-log bulk readout byte tables

Carried forward verbatim from `src/main/readout/readout_parser.ts`. Magics (ASCII):
`CASP = 43 41 53 50`, `SUMM = 53 55 4D 4D`, `META = 4D 45 54 41`. All multi-byte LE.

**HR/LR stream header (16 B):**
```
0–3   magic        4 B    "CASP"
4     stream_id    u8     0x01=HR, 0x02=LR
5     entry_size   u8     0x40 (64)
6–7   reserved     u16
8–11  count        u32    entry count
12–15 crc32        u32    over [0..11]
```
**Summary header (12 B):** `[SUMM:4][payload_size:u32@4][crc32:u32@8 over 0..7]`
**Metadata (28 B):** `[META:4][hr_count@4][lr_count@8][summary_bytes@12][hr_addr@16][lr_addr@20][crc32@24 over 0..23]`

**HR entry (64 B)** — packed `<IBBhhhhhhhhhhIhiihhhhhhB11s>`:
```
0–3   timestamp_us   u32     6–7  accel_x_mg    i16    8–9  accel_y_mg   i16   10–11 accel_z_mg i16
4     fresh          u8      12–17 gyro_xyz_raw  3×i16  18–19 imu_temp_c100 i16
5     fsm_state      u8      20–25 highg_xyz_10mg 3×i16 26–29 baro_pa      u32
30–31 baro_temp_c100 i16     32–35 ekf_alt_cm    i32    36–39 ekf_vel_cmps i32
40–41 ekf_abias_mmps2 i16    42–43 ekf_bbias_cm  i16    44–49 quat_packed[0..2] 3×i16
50–51 tilt_cdeg      i16     52    flags         u8     53–63 reserved (11 B)
```
fresh bits: imu(0), highg(1), baro(2). flags bits: baro_gated(0), launched(1), mag_valid(2).
gyro ×0.070 dps; accel /1000 g; highg /100 g; baro/100 hPa; ekf_alt/100 m; ekf_vel/100 m/s;
tilt/100 deg.

**LR entry (64 B)** — packed `<IBBhhhhHhBBBBiihhBBBBBBBbbB20s>`:
```
0–3   timestamp_us  u32    4 fsm_state u8   5 flags u8 (firing0,test_mode1,sim_active2)
6–11  mag_xyz_raw   3×i16  12–13 mag_temp_c100 i16 (0x7FFF=null)
14–15 batt_mv       u16    16–17 batt_ma i16
18–21 cont_scaled   4×u8   22–25 gps_lat_deg7 i32  26–29 gps_lon_deg7 i32  (÷1e7 deg)
30–31 gps_alt_dm    i16    32–33 gps_vel_d_cmps i16
34 gps_sats u8  35 gps_fix u8  36 gps_pdop u8  37 gps_fresh u8
38 radio_tx_seq u8  39 radio_rx_good u8  40 radio_rx_bad u8  41 radio_rssi i8  42 radio_snr i8
43 pyro_arm_cont u8 (arm=hi nibble, cont=lo nibble)   44–63 reserved (20 B)
```
**Summary entries (variable):** `[timestamp_ms:u32][len:u8][msg:len bytes]` repeated; `0xFFFFFFFF`
timestamp = erased-flash sentinel (stop). Each stream is followed by a 4-byte CRC-32 over its payload.

---

## Appendix B — Flight-config byte table (v6)

Carried forward from `src/main/protocol/config_serialiser.ts`. **v6 change:** the header gains
`af_id` (airframe binding, §3) and bumps `config_version`. Proposed v6 header:
```
0     config_version  u8     (bump on change)
1     af_id           u8     airframe id  ← NEW in v6
2–3   total_length    u16
```
Payload (unchanged from v5): `4 × pyro_channel(32) + pad(12) + fallback(8) + checks(8)`, then CRC-32.

**Pyro channel (32 B each):**
```
0 hw_channel u8   1 role u8   2 altitude_source u8 (0=ekf,1=baro)
3 flags u8 (early_deploy0, backup_height1)
4–7   fire_duration_s     f32     8–11  deploy_alt_m         f32
12–15 time_after_apogee_s f32     16–19 early_deploy_vel_mps f32
20–23 backup_time_s|height_m f32   24 motor_number u8
25 max_ignition_angle_deg u8      26 max_flight_angle_deg u8
27–28 min_velocity_mps i16 (×10)  29–30 min_altitude_m i16
31 fire_delay_s u8 (×10)
```
PyroRole: Apogee0, ApogeeBackup1, Main2, MainBackup3, Ignition4, IgnitionBackup5, Custom6.

**Tail blocks (after the 4 channels):**
```
pad_lat_deg f32 · pad_lon_deg f32 · pad_alt_msl_m f32          (12 B)
alt_threshold_m f32 · vel_threshold_mps f32                    (8 B, FSM fallback)
min_batt_v f32 · min_integrity_pct f32                         (8 B, pre-flight checks)
crc32 u32  (over all preceding bytes)
```
**v5 total 163 B** (3 + 128 + 28 + 4); **v6 total 164 B** with the added `af_id`.
**config_hash** = `CRC32(block[0 .. len−5])`, echoed in `ACK_CONFIG (0x32)`.
