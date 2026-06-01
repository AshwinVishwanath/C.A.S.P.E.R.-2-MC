/**
 * IPC channel name constants for C.A.S.P.E.R. 2 Mission Control.
 *
 * These must stay in sync with the preload bridge (src/preload/index.ts).
 * Channels are grouped by direction:
 *   - Main -> Renderer push channels (webContents.send)
 *   - Renderer -> Main invoke channels (ipcMain.handle, returns a value)
 *   - Renderer -> Main send channels (ipcMain.on, fire-and-forget)
 *
 * @module ipc/channels
 */

// ---------------------------------------------------------------------------
// Main -> Renderer push channels
// ---------------------------------------------------------------------------

/** Telemetry snapshot pushed on every store update. */
export const CH_TELEMETRY = 'casper:telemetry';

/** CAC state machine UI state pushed on every phase transition. */
export const CH_CAC_UPDATE = 'casper:cac-update';

/** Diagnostics result pushed after self-test completes. */
export const CH_DIAG_RESULT = 'casper:diag-result';

/** Serial port list pushed after a scan. */
export const CH_SERIAL_PORTS = 'casper:serial-ports';

/** Flight log download progress pushed during readout. */
export const CH_LOG_PROGRESS = 'casper:log-progress';

// ---------------------------------------------------------------------------
// Simulation (OpenRocket-driven sim mode)
// ---------------------------------------------------------------------------

/**
 * Load a flight simulation file. Opens a file dialog, parses the selection,
 * and returns `{ ok, profile, filename }` or `{ ok: false, error }`.
 * Renderer → Main invoke. Args: none.
 */
export const CH_SIM_LOAD = 'casper:sim-load';

/**
 * Push one playback sample into the telemetry store so the dashboard animates.
 * Renderer → Main fire-and-forget. Args: (sample: SimSamplePush).
 */
export const CH_SIM_PUSH = 'casper:sim-push';

/**
 * Mark simulation active/inactive (drives the "live" indicators; resets the
 * store on deactivate). Renderer → Main fire-and-forget. Args: (active: boolean).
 */
export const CH_SIM_ACTIVE = 'casper:sim-active';

// ---------------------------------------------------------------------------
// Renderer -> Main invoke channels (expect return value)
// ---------------------------------------------------------------------------

/** Connect to FC over USB serial. Args: (port: string). */
export const CH_CONNECT_FC = 'casper:connect-fc';

/** Connect to GS over USB serial. Args: (port: string). */
export const CH_CONNECT_GS = 'casper:connect-gs';

/** Upload flight config to FC. Args: (config: FlightConfig). */
export const CH_UPLOAD_CONFIG = 'casper:upload-config';

/** Verify config hash against MC-side config. Args: none. */
export const CH_VERIFY_CONFIG = 'casper:verify-config-hash';

/** Download flight log from FC flash. Args: none. */
export const CH_DOWNLOAD_LOG = 'casper:download-flight-log';

/** Export flight log data as CSV files. Args: (type: 'hr' | 'lr' | 'summary' | 'all'). */
export const CH_EXPORT_LOG_CSV = 'casper:export-log-csv';

// ---------------------------------------------------------------------------
// Renderer -> Main send channels (fire-and-forget)
// ---------------------------------------------------------------------------

/** Disconnect FC USB link. */
export const CH_DISCONNECT_FC = 'casper:disconnect-fc';

/** Disconnect GS USB link. */
export const CH_DISCONNECT_GS = 'casper:disconnect-gs';

/** Trigger a serial port scan. */
export const CH_SCAN_PORTS = 'casper:scan-ports';

/** Arm a pyro channel. Args: (channel: number). */
export const CH_CMD_ARM = 'casper:cmd-arm';

/** Disarm a pyro channel. Args: (channel: number). */
export const CH_CMD_DISARM = 'casper:cmd-disarm';

/** Fire a pyro channel. Args: (channel: number, duration_ms: number). */
export const CH_CMD_FIRE = 'casper:cmd-fire';

/** Operator confirm (used during CAC exchange). */
export const CH_CMD_CONFIRM = 'casper:cmd-confirm';

/** Operator abort (cancels current CAC exchange). */
export const CH_CMD_ABORT = 'casper:cmd-abort';

/** Enter test mode on FC. */
export const CH_CMD_ENTER_TEST = 'casper:cmd-enter-test-mode';

/** Exit test mode on FC. */
export const CH_CMD_EXIT_TEST = 'casper:cmd-exit-test-mode';

/** Run FC self-test diagnostics. */
export const CH_RUN_DIAG = 'casper:run-diagnostics';

/** Erase flight log from FC flash. */
export const CH_ERASE_LOG = 'casper:erase-flight-log';

/** Start a simulated flight on the FC. */
export const CH_CMD_SIM_FLIGHT = 'casper:cmd-sim-flight';

/** Upload a compiled Logic VM program to the FC. Args: (graph: LogicGraphIR). */
export const CH_UPLOAD_LOGIC = 'casper:upload-logic';

/** Compile a logic graph offline (no FC required). Args: (graph: LogicGraphIR). */
export const CH_COMPILE_LOGIC = 'casper:compile-logic';
