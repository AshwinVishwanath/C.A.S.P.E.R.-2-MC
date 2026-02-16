# C.A.S.P.E.R. 2 Mission Control

Ground control station for the C.A.S.P.E.R.-2 (Control and Stability Package for Experimental Rocketry) flight computer. Electron desktop application that communicates with the STM32H750 FC over USB serial, displaying real-time telemetry and providing pyro channel command-and-control.

## Features

- **Real-time telemetry** at 10Hz: altitude, velocity, attitude (quaternion + Euler), Mach, dynamic pressure, battery
- **GPS tracking** with delta-from-pad positioning and 3D fix status
- **4-channel pyro control** with CAC (Command-Acknowledge-Confirm) safety protocol
- **Dual-mode connectivity**: Direct FC USB or Ground Station LoRa relay
- **Link quality monitoring**: RSSI, SNR, frequency error, stale detection, data integrity
- **Error recovery**: Single-bit CRC-32 correction, zero-order hold for stale data
- **Flight event log**: State transitions, pyro firings, apogee detection, errors
- **Pre-launch checklist**: Battery, GPS, continuity, IMU orientation, link quality
- **FC diagnostics**: IMU, barometer, magnetometer, EKF, flash, config self-tests
- **3D attitude display**: Real-time roll/pitch/yaw visualization

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Electron Main Process              │
│                                                     │
│  USB Serial ──► Transport ──► Parser ──► Store ──►──┤──► IPC ──► Renderer
│  (FC / GS)      (COBS)       (CRC-32)   (Ring      │
│                                          Buffers)   │
│  Commands ◄── CAC Machine ◄─────────────────────────┤◄── IPC ◄── React UI
│              (Retry/Timeout/Echo)                    │
└─────────────────────────────────────────────────────┘
```

| Layer | Language | Purpose |
|-------|----------|---------|
| Main process | TypeScript | Serial I/O, protocol parsing, command state machine, telemetry store |
| Preload | TypeScript | contextBridge IPC API (`window.casper`) |
| Renderer | JSX (React 18) | Dashboard UI, hooks, components |

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
npm install
npm run dev
```

This launches the Electron app with hot-reload for the renderer. The main process uses `electron-vite` for development.

### Build

```bash
npm run build
```

Outputs production bundles to `out/` (main, preload, renderer).

### Test

```bash
npm test              # Run all tests (254 tests, ~700ms)
npm run test:watch    # Watch mode
```

## Hardware Setup

### Flight Computer (Direct USB)

Connect the STM32H750 FC board via USB-C. The app detects it by VID/PID and establishes an unframed serial link for command-response communication.

### Ground Station (LoRa Relay)

Connect the GS board via USB-C. The GS receives LoRa telemetry from the FC and relays it over USB with COBS framing. This is the primary operational mode for flight.

### Connection Modes

| Mode | Transport | Use Case |
|------|-----------|----------|
| DIRECT | FC USB only | Bench testing, pre-flight setup, diagnostics |
| RELAY | GS USB + LoRa | Flight operations, range > cable length |

## Protocol

The communication protocol uses binary packets with STM32-compatible CRC-32 checksums.

### Message Types

| ID | Name | Direction | Rate | Description |
|----|------|-----------|------|-------------|
| 0x01 | FC_MSG_FAST | FC -> MC | 10 Hz | Core telemetry (alt, vel, quat, batt, FSM state) |
| 0x02 | FC_MSG_GPS | FC -> MC | 1-5 Hz | GPS position (delta from pad, fix, sats) |
| 0x03 | FC_MSG_EVENT | FC -> MC | Event | State changes, pyro firings, apogee, errors |
| 0x10 | GS_MSG_TELEM | GS -> MC | 10 Hz | FC telemetry + GS link quality (RSSI, SNR) |
| 0x80 | CMD_ARM | MC -> FC | Command | Arm/disarm pyro channel |
| 0x81 | CMD_FIRE | MC -> FC | Command | Fire pyro channel with duration |
| 0xA0 | ACK_ARM | FC -> MC | Response | Echo-back acknowledgement for arm |
| 0xA1 | ACK_FIRE | FC -> MC | Response | Echo-back acknowledgement for fire |
| 0xE0 | NACK | FC -> MC | Response | Negative acknowledgement with error code |
| 0xF0 | CONFIRM | MC -> FC | Command | Final confirmation after ACK verification |
| 0xF1 | ABORT | MC -> FC | Command | Cancel in-progress exchange |

### CAC Safety Protocol

All safety-critical commands (ARM, FIRE) follow a three-phase exchange:

1. **Command** -- MC sends command with unique 16-bit nonce
2. **Acknowledge** -- FC echoes command parameters back for verification
3. **Confirm** -- MC sends confirmation after 1-second operator review delay

The exchange includes automatic retry (up to 10 retries, 2s per leg, 10s overall), echo mismatch detection (sends ABORT on mismatch), and telemetry-as-parallel-ACK for ARM commands.

## Project Structure

```
src/
├── main/                        # Electron main process (TypeScript)
│   ├── index.ts                 # Entry point — module wiring + lifecycle
│   ├── transport/               # USB serial communication
│   │   ├── cobs.ts              # COBS encode/decode
│   │   ├── port_scanner.ts      # USB VID/PID enumeration
│   │   ├── fc_usb.ts            # Flight Computer USB manager
│   │   └── gs_usb.ts            # Ground Station USB + COBS deframing
│   ├── protocol/                # Binary packet protocol
│   │   ├── types.ts             # All TypeScript interfaces and enums
│   │   ├── constants.ts         # Message IDs, sizes, timeouts, CRC params
│   │   ├── parser.ts            # Dual-mode packet parser (14 message types)
│   │   ├── crc32.ts             # STM32 hardware CRC-32
│   │   ├── quaternion.ts        # Smallest-three quaternion unpacking
│   │   ├── status_decode.ts     # FC_TLM_STATUS bitmap decoder
│   │   ├── command_builder.ts   # ARM/FIRE/CONFIRM/ABORT packet construction
│   │   ├── config_serialiser.ts # FlightConfig binary serialization
│   │   └── derived.ts           # Mach number, dynamic pressure, Euler angles
│   ├── recovery/                # Error recovery pipeline
│   │   ├── stage1_crc_correct.ts # Single-bit CRC syndrome correction
│   │   ├── stage3_interpolator.ts # Interpolation stub
│   │   └── stage4_zoh.ts        # Zero-order hold for stale data
│   ├── command/                 # Command state machine
│   │   ├── cac_types.ts         # CAC type definitions
│   │   └── cac_machine.ts       # Full CAC state machine
│   ├── store/                   # Reactive telemetry store
│   │   ├── store_types.ts       # TelemetrySnapshot interface + defaults
│   │   └── telemetry_store.ts   # Store with ring buffers + stale detection
│   └── ipc/                     # Electron IPC bridge
│       ├── channels.ts          # IPC channel name constants
│       └── handlers.ts          # Main-process IPC handler registration
├── preload/
│   └── index.ts                 # contextBridge API (window.casper)
└── renderer/                    # React UI (JSX)
    ├── App.jsx                  # Main dashboard component
    ├── main.jsx                 # React entry point
    ├── hooks/                   # React hooks (replace simulation)
    │   ├── use_telemetry.jsx    # Real telemetry subscription
    │   ├── use_command.jsx      # CAC command state
    │   ├── use_serial.jsx       # Serial port management
    │   └── use_diagnostics.jsx  # FC diagnostics
    └── components/              # New UI components
        ├── EventLog.jsx         # Timestamped flight event log
        ├── InlineError.jsx      # Auto-dismissing error banner
        ├── ConnectionModeIndicator.jsx  # DIRECT/RELAY/OFFLINE badge
        ├── GsStatusPanel.jsx    # Ground station status panel
        └── SerialPortPicker.jsx # Port selection + connect/disconnect

test/
├── integration/
│   └── full_pipeline.test.ts    # End-to-end data pipeline tests
└── fixtures/
    └── packets.ts               # Known-good byte arrays with valid CRC-32
```

## Dependencies

| Package | Purpose |
|---------|---------|
| electron | Desktop application framework |
| serialport | USB serial communication |
| react, react-dom | UI framework |
| electron-vite | Build tool (main + preload + renderer) |
| vitest | Test runner |
| typescript | Main process type safety |

## License

Proprietary. Part of the C.A.S.P.E.R.-2 flight system.
