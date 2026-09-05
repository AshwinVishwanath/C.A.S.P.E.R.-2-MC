# Task: Align Mission Control telemetry parsers to the canonical v5 firmware wire format

The flight firmware (C.A.S.P.E.R.-2, `casper3-port-layer` branch) is the source of truth
for the v5 telemetry protocol. MC's parsers currently decode an older/divergent layout, so
**every FC_MSG_FAST and FC_MSG_GPS packet fails to decode** (wrong field offsets + wrong CRC
range). MC connects but shows nothing. Bring MC's parsers in line with the layouts below.

## What is already correct (DO NOT change)
- **Transport:** `transport/cobs.ts` + `transport/gs_usb.ts` — standard COBS, trailing `0x00`
  delimiter, 115200 baud. Matches firmware exactly. No change.
- **CRC-32:** params in `constants.ts` (poly `0xEDB88320` reflected, init `0xFFFFFFFF`,
  xor-out `0xFFFFFFFF`) already match the firmware's hardware CRC. No change.
- **FC_MSG_EVENT (0x03, 11 bytes):** already matches. No change.
- All packets are little-endian. CRC-32 is the **last 4 bytes**, computed over **all preceding
  bytes** (id through last data byte).

## Root cause
Firmware encodes **altitude as u24 (3 bytes, 0.01 m/LSB = cm)**; MC currently decodes it as
**u16 (2 bytes, 1 m/LSB)**. That 1-byte width difference shifts every field after altitude and
makes the CRC range wrong. Fix = adopt the firmware layouts below.

## Canonical layouts to implement

### FC_MSG_FAST — msg_id 0x01 — **21 bytes** (was 20)
| Off | Field | Type | Scale | Notes |
|----|-------|------|-------|-------|
| 0 | msg_id | u8 | — | 0x01 |
| 1–2 | status | u16 LE | — | bitmap (unchanged) |
| 3–5 | altitude | **u24 LE** | ×0.01 → m | **3 bytes**, cm resolution |
| 6–7 | velocity | i16 LE | ×0.1 → m/s | |
| 8–12 | quaternion | 5 bytes | — | smallest-three |
| 13–14 | flight_time | u16 LE | ×0.1 → s | |
| 15 | battery | u8 | 6.0 + raw×0.012 → V | |
| 16 | seq | u8 | — | |
| 17–20 | crc32 | u32 LE | — | **CRC over bytes [0..16]** |

### FC_MSG_GPS — msg_id 0x02 — **18 bytes** (was 17)
| Off | Field | Type | Scale | Notes |
|----|-------|------|-------|-------|
| 0 | msg_id | u8 | — | 0x02 |
| 1–4 | dlat | i32 LE | mm | delta latitude |
| 5–8 | dlon | i32 LE | mm | delta longitude |
| 9–11 | alt_msl | **u24 LE** | ×0.01 → m | **3 bytes**, cm resolution |
| 12 | fix_type | u8 | — | |
| 13 | sat_count | u8 | — | |
| 14–17 | crc32 | u32 LE | — | **CRC over bytes [0..13]** |

### GS_MSG_TELEM — msg_id 0x10 — **39 bytes** (was 38)
The ground station repackages each received FC_MSG_FAST as this, adding link metadata.
> Note: the firmware `INTERFACE_SPEC.md` §7.1 is internally inconsistent (mentions a
> "reserved" byte AND a 39-byte size). **This table is authoritative** — no reserved byte;
> CRC immediately follows yaw.

| Off | Field | Type | Scale | Notes |
|----|-------|------|-------|-------|
| 0 | msg_id | u8 | — | 0x10 |
| 1–2 | status | u16 LE | — | same bitmap as FAST |
| 3–5 | altitude | **u24 LE** | ×0.01 → m | |
| 6–7 | velocity | i16 LE | ×0.1 → m/s | |
| 8–12 | quaternion | 5 bytes | — | smallest-three |
| 13–14 | flight_time | u16 LE | ×0.1 → s | |
| 15 | battery | u8 | 6.0 + raw×0.012 → V | |
| 16 | seq | u8 | — | GS sequence |
| 17–18 | rssi | i16 LE | ×0.1 → dBm | populated by GS |
| 19 | snr | i8 | ×0.25 → dB | populated by GS |
| 20–21 | freq_err | i16 LE | Hz | **0 (reserved, not populated)** |
| 22–23 | data_age | u16 LE | ms | populated, but ≈0 (GS emits on RX) — see note |
| 24 | recovery | u8 | — | bit7 recovered, bits6:4 method, bits3:0 confidence; **0 (reserved)** |
| 25–26 | mach | u16 LE | ×0.001 | **populated by GS** (ISA model from alt+vel) |
| 27–28 | qbar | u16 LE | Pa | **populated by GS** (½·ρ·v², clamped at 65535) |
| 29–30 | roll | i16 LE | ×0.1 → deg | **populated by GS** — nose spin (body Y), full ±180° |
| 31–32 | pitch | i16 LE | ×0.1 → deg | **populated by GS** — fore/aft tilt (body X), 0 = vertical |
| 33–34 | yaw | i16 LE | ×0.1 → deg | **populated by GS** — side tilt / heading (body Z) |
| 35–38 | crc32 | u32 LE | — | **CRC over bytes [0..34]** |

> Status of derived fields (the GS is the source of truth):
> - **roll/pitch/yaw, mach, qbar — POPULATED.** Read and display these directly (see the
>   attitude section below; do NOT re-derive euler from the quaternion for 0x10). The quaternion
>   at bytes 8–12 is still present for optional 3D visualization.
> - **freq_err, recovery — 0** (reserved for future use).
> - **data_age — ~0 in 0x10** by construction (the GS relays the instant it receives a packet).
>   Use MC's own frame-absence timer (STALE_THRESHOLD_MS) for staleness, not this field.
> - mach/qbar caveat: computed from the FAST **AGL** altitude (ISA density) and the **vertical**
>   EKF velocity as a speed proxy — good for display; approximate at high-elevation sites or high
>   angle of attack. qbar saturates at u16 max (65535 Pa).

### GS_MSG_STATUS — msg_id 0x13 — 24 bytes (optional but recommended)
The GS sends this ~1 Hz with its own link/sensor status. MC currently stores it raw; decoding
it gives you live link quality even when no FC packets are arriving.
| Off | Field | Type | Notes |
|----|-------|------|-------|
| 0 | msg_id | u8 | 0x13 |
| 1 | radio_profile | u8 | 0=A (SF7), 1=B (SF8) |
| 2 | last_rssi | i8 | dBm |
| 3 | last_snr | i8 | dB |
| 4–5 | rx_pkt_count | u16 LE | |
| 6–7 | rx_crc_fail | u16 LE | |
| 8–11 | ground_pressure_pa | u32 LE | Pa |
| 12–15 | ground_lat_1e7 | i32 LE | deg ×1e7 |
| 16–19 | ground_lon_1e7 | i32 LE | deg ×1e7 |
| 20–23 | crc32 | u32 LE | CRC over [0..19] |

## Files to change (MC repo)
- `src/main/protocol/constants.ts`: `SIZE_FC_MSG_FAST` 20→**21**, `SIZE_FC_MSG_GPS` 17→**18**,
  `SIZE_GS_MSG_TELEM` 38→**39**. Altitude scaling: FAST/GS alt is now ×0.01 (cm), so
  `ALT_SCALE` 1.0→**0.01**; GPS alt is now u24 ×0.01, so retire `GPS_ALT_SCALE` (10.0) in favor
  of 0.01 for the GPS alt field.
- `src/main/protocol/parser.ts`: update `parse_fc_fast`, `parse_fc_gps`, and `parse_gs_telem`
  to the offsets/sizes/scales above (read u24 LE for altitude; shift all downstream offsets;
  fix the CRC coverage range in `verify_packet_crc` usage for each). Optionally add a real
  decoder for `GS_MSG_STATUS` (0x13) instead of storing raw.
- Tests: `src/main/protocol/__tests__/parser.test.ts` (and any fixtures) — regenerate expected
  byte arrays + CRCs for the new layouts. Ensure a known-good 21-byte FAST and 18-byte GPS
  round-trip with `crc_ok === true`.

## Acceptance
- A captured/synthesized 21-byte FAST and 18-byte GPS frame decode with `crc_ok === true` and
  correct altitude in metres (cm-resolution).
- A 39-byte GS_MSG_TELEM decodes with `crc_ok === true`; attitude derived from the quaternion.
- `npm test` (or the repo's test command) passes.

---

## Background / context (from the firmware side)
- This alignment was decided after bench-testing the FC↔GS↔MC chain: the radio link and GS
  decode work, but MC showed only "connected" because of this layout skew.
- Decision: **firmware 21-byte `INTERFACE_SPEC` layout is canonical v5**; MC moves to it. The
  firmware FAST/GPS packing is unchanged. The GS will be updated (firmware side) to repackage
  FAST → `0x10 GS_MSG_TELEM`, COBS-frame it, and also emit `0x13 GS_MSG_STATUS`, behind a
  `GS_OUTPUT` build flag (ASCII serial-plotter mode vs COBS-to-MC mode).
- A helpful reference on the firmware side: `App/telemetry/cobs.c`, `App/telemetry/crc32_hw.c`,
  and `App/telemetry/tlm_manager.c` (the FC's own COBS TX path that MC's "direct FC mode"
  already targets).

---

## Attitude: the GS is the source of truth — read euler from the packet, do NOT derive it

To eliminate convention-drift bugs (an earlier roll/pitch/yaw mismatch came from MC re-deriving
attitude with a different convention than the firmware), **the ground station now computes the
euler angles itself** using the FC-authoritative `casper_quat_to_euler` and ships them in the
`GS_MSG_TELEM` (0x10) packet. MC must **display those fields directly** and must NOT recompute
attitude from the quaternion for the relay path.

> **Convention update (2026-06-30):** the firmware `casper_quat_to_euler` was reworked to a
> **tilt-from-vertical** convention (validated on hardware). The axis→name mapping is unchanged
> (Y=roll, X=pitch, Z=yaw), but the *reference* and *decomposition* changed, so the OLD MC advice
> ("MC's roll/pitch are swapped — swap them / derive with asin/atan2") is **OBSOLETE — delete it.**

### What the angles mean now (tilt-from-vertical)
- **Zero attitude = nose straight up.** A perfectly vertical, un-spun rocket reads **roll≈0,
  pitch≈0, yaw≈0** (was: pitch≈90).
- **roll** = spin about the nose (body Y), **full ±180°, continuous** (wraps at ±180).
- **pitch** = nose tilt fore/aft (about body X). **yaw** = nose tilt side / heading (about body Z).
- **Tilt is invariant under nose-spin**: spinning about the nose changes *only* roll; pitch/yaw stay
  put. Near vertical, pitch/yaw stay small regardless of spin/heading.
- Singularity is at **nose-horizontal** (pitch ±90), off the nominal flight envelope.

### GS_MSG_TELEM (0x10) — normal relay path: read the fields, don't derive
The `0x10` packet already carries euler at `[29..34]` (i16 ×0.1°), computed by the GS with the
corrected `casper_quat_to_euler`:

| Off | Field | Scale | Meaning |
|----|-------|-------|--------|
| 29–30 | roll  | ×0.1° | nose spin (body Y), full ±180° |
| 31–32 | pitch | ×0.1° | fore/aft tilt (body X) |
| 33–34 | yaw   | ×0.1° | side tilt / heading (body Z) |

MC action: in `parse_gs_telem`, decode these three i16 fields as `raw * 0.1` degrees and display
them directly. **Do NOT call `quat_to_euler_deg` for 0x10.** The quaternion at `[8..12]` is still
present if a 3D model wants raw orientation, but the numeric attitude comes from `[29..34]`.

### FC_MSG_FAST (0x01) — direct-FC-over-USB only
FAST has no euler fields (quaternion only, `[8..12]`). If MC supports direct-FC display it must
derive euler with the **new** convention so it matches the relay path. Algorithm (q = `[w,x,y,z]`):
```
s  = 0.70710678                       // sqrt(2)/2
// deviation from nose-up nominal q0=(s,-s,0,0):  qd = conj(q0) ⊗ q
wd = s*(w - x);  xd = s*(w + x);  yd = s*(y - z);  zd = s*(y + z)
// Z-X-Y extraction (roll about body Y = innermost):
pitch = asin ( clamp(2*(yd*zd + wd*xd), -1, 1) )
roll  = atan2( 2*(wd*yd - xd*zd), 1 - 2*(xd*xd + yd*yd) )   // full ±180
yaw   = atan2( 2*(wd*zd - xd*yd), 1 - 2*(xd*xd + zd*zd) )
```
(Simplest is to skip direct-FC euler entirely and always go through the GS `0x10` fields.) Update
`__tests__/derived.test.ts` / `quaternion.test.ts` fixtures to the new convention if you keep it.

### Acceptance
With the FC relaying via the GS: a near-vertical rocket reads **pitch≈0, yaw≈0**; spinning about the
**nose** moves **only roll** (full ±180°, no gimbal jump in pitch/yaw); tilting fore/aft moves
**pitch**; tilting side moves **yaw**; and the values match what the firmware reports.
