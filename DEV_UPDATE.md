# DEV_UPDATE.md — C.A.S.P.E.R. 2 Mission Control

## 2026-02-16: Full Electron Backend Implementation

### What Changed

Migrated from a single-file Vite/React dashboard with simulated telemetry to a full Electron application with a TypeScript main-process backend. The UI previously relied on a `useSim()` hook that generated fake telemetry data; it now connects to real STM32 hardware (Flight Computer + Ground Station) over USB serial.

### Architecture Overview

```
Electron Main Process (TypeScript)
├── Transport Layer — USB serial I/O (FC direct + GS COBS-framed)
├── Protocol Layer — Binary packet parsing, CRC-32, command building
├── Recovery Layer — Single-bit CRC correction, zero-order hold
├── Command Layer — CAC (Command-Acknowledge-Confirm) state machine
├── Telemetry Store — Reactive store with ring buffers + stale detection
└── IPC Bridge — 20 IPC channels wiring main↔renderer

Electron Preload (TypeScript)
└── contextBridge — Exposes window.casper API to renderer

Renderer (JSX)
├── Hooks — useTelemetry, useCommand, useSerial, useDiagnostics
├── Components — EventLog, InlineError, ConnectionMode, GsStatus, SerialPortPicker
└── App.jsx — Existing dashboard, now wired to real backend
```

### New Files (50 total)

**Main process backend (23 source files):**

| Module | Files | Purpose |
|--------|-------|---------|
| `src/main/transport/` | `cobs.ts`, `port_scanner.ts`, `fc_usb.ts`, `gs_usb.ts` | COBS framing, USB VID/PID scan, FC + GS serial managers |
| `src/main/protocol/` | `types.ts`, `constants.ts`, `crc32.ts`, `quaternion.ts`, `status_decode.ts`, `parser.ts`, `command_builder.ts`, `config_serialiser.ts`, `derived.ts` | Binary protocol: 14-variant message parser, STM32 CRC-32, smallest-three quaternion, Mach/qbar computation |
| `src/main/recovery/` | `stage1_crc_correct.ts`, `stage3_interpolator.ts`, `stage4_zoh.ts` | Single-bit CRC syndrome correction, interpolation stub, zero-order hold |
| `src/main/command/` | `cac_types.ts`, `cac_machine.ts` | CAC state machine: retry, timeout, echo verification, telemetry-as-ACK, NACK handling |
| `src/main/store/` | `store_types.ts`, `telemetry_store.ts` | Reactive telemetry snapshot with ring buffers (depth 150), stale detection (500ms threshold), subscriber pattern |
| `src/main/ipc/` | `channels.ts`, `handlers.ts` | 20 IPC channel constants + handler registration with full cleanup |
| `src/main/` | `index.ts` | Electron entry: module instantiation, data pipeline wiring, lifecycle management |

**Preload bridge (1 file):**
- `src/preload/index.ts` — contextBridge exposing `window.casper` with all IPC channels

**Renderer hooks (4 files):**
- `src/renderer/hooks/use_telemetry.jsx` — Drop-in replacement for `useSim()`, same return shape
- `src/renderer/hooks/use_command.jsx` — CAC command state subscription
- `src/renderer/hooks/use_serial.jsx` — Serial port scan, connect, disconnect
- `src/renderer/hooks/use_diagnostics.jsx` — Drop-in replacement for `useDiag()`

**Renderer components (5 files):**
- `src/renderer/components/EventLog.jsx` — Scrollable timestamped event log
- `src/renderer/components/InlineError.jsx` — Auto-dismissing error banner
- `src/renderer/components/ConnectionModeIndicator.jsx` — DIRECT/RELAY/OFFLINE badge
- `src/renderer/components/GsStatusPanel.jsx` — Ground station status panel
- `src/renderer/components/SerialPortPicker.jsx` — Port dropdown + connect/disconnect

**Tests (16 files, 254 tests):**
- 14 unit test files across transport, protocol, recovery, command, store
- 1 integration test (`test/integration/full_pipeline.test.ts`) — raw bytes through full pipeline
- 1 test fixture file (`test/fixtures/packets.ts`) — known-good byte arrays with valid CRC-32

**Build/Config (4 files):**
- `electron.vite.config.ts` — electron-vite config for main/preload/renderer
- `tsconfig.json`, `tsconfig.node.json` — TypeScript configs
- `scripts/generate_syndrome_table.ts` — CRC-32 syndrome table generator

### Modified Files

- `package.json` — Added Electron, serialport, electron-vite, TypeScript, vitest dependencies; updated scripts
- `.gitignore` — Added `out/` build directory
- `src/renderer/App.jsx` — Replaced `useSim()`/`useDiag()` with imported hooks; wired serial connection; removed ~110 lines of inline simulation code
- `src/renderer/index.html` — Updated script path after move to `src/renderer/`

### Data Pipeline

```
USB Serial → Transport (COBS decode if GS) → Protocol Parser → Recovery (CRC correct) → Telemetry Store → IPC push → Renderer hooks → React UI
                                                                                              ↑
Commands: React UI → IPC → CAC State Machine → Transport → USB Serial                        │
                              ↓ (ACK/NACK)                                                    │
                              └──────────────────────── Parser ────────────────────────────────┘
```

### Protocol Details

- **Message types:** FC_MSG_FAST (10Hz telemetry), FC_MSG_GPS (1-5Hz), FC_MSG_EVENT (discrete), GS_MSG_TELEM (relay), ACK_ARM, ACK_FIRE, NACK, CONFIRM, ABORT
- **CRC-32:** STM32 hardware CRC (poly 0x04C11DB7, init 0xFFFFFFFF, no reflection, no final XOR, 32-bit big-endian word processing)
- **COBS framing:** On GS↔MC USB link (0x00 delimiter)
- **CAC exchange:** Command → ACK (echo verify) → 1s delay → Confirm. Up to 10 retries, 2s leg timeout, 10s overall timeout.
- **Quaternion encoding:** Smallest-three, 5 bytes (40 bits), drop largest component

### Known Limitations / TODOs

1. **Stage 1 CRC correction not wired** — `wire_gs_pipeline()` has a TODO to call `try_correct_single_bit()` on CRC failures
2. **Test mode commands** — Enter/exit test mode are stub handlers (FC protocol not yet defined)
3. **Diagnostics** — `run_diagnostics` returns a placeholder result (FC self-test protocol TBD)
4. **Flight log download/erase** — Stub implementations (QSPI flash protocol TBD)
5. **FC handshake** — Protocol version check not implemented (response format TBD)
6. **GPS coordinate display** — Uses flat-earth delta approximation from pad origin (0, 0)
7. **New UI components not yet placed in App.jsx** — EventLog, GsStatusPanel, SerialPortPicker, ConnectionModeIndicator are built but need to be added to the layout

### Build & Run

```bash
npm install
npm run dev          # Launch Electron with HMR (auto-unsets ELECTRON_RUN_AS_NODE for VSCode)
npm run build        # Production build (main + preload + renderer)
npm test             # Run all 254 tests via vitest
```

### VSCode Compatibility

VSCode sets `ELECTRON_RUN_AS_NODE=1` which prevents Electron from loading its API. The dev/preview scripts include `unset ELECTRON_RUN_AS_NODE &&` to work around this. See [electron#8200](https://github.com/electron/electron/issues/8200).
