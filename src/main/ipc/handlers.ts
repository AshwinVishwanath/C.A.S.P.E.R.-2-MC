/**
 * Main-process IPC handler registration for C.A.S.P.E.R. 2 Mission Control.
 *
 * Wires Electron IPC channels to the application's runtime dependencies
 * (transport, store, CAC machine, config serialiser). Returns a cleanup
 * function that removes all handlers on teardown.
 *
 * Channel directions:
 *   - ipcMain.handle()  — renderer invokes, expects a returned Promise
 *   - ipcMain.on()      — renderer sends fire-and-forget
 *   - webContents.send() — main pushes data to renderer
 *
 * @module ipc/handlers
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { TelemetryStore } from '../store/telemetry_store';
import type { CacMachine } from '../command/cac_machine';
import type { FcUsb } from '../transport/fc_usb';
import type { GsUsb } from '../transport/gs_usb';
import { scan_ports } from '../transport/port_scanner';
import { serialise_config, config_hash } from '../protocol/config_serialiser';
import type { FlightConfig } from '../protocol/types';
import {
  CH_TELEMETRY,
  CH_CAC_UPDATE,
  CH_DIAG_RESULT,
  CH_SERIAL_PORTS,
  CH_CONNECT_FC,
  CH_CONNECT_GS,
  CH_UPLOAD_CONFIG,
  CH_VERIFY_CONFIG,
  CH_DOWNLOAD_LOG,
  CH_DISCONNECT_FC,
  CH_DISCONNECT_GS,
  CH_SCAN_PORTS,
  CH_CMD_ARM,
  CH_CMD_DISARM,
  CH_CMD_FIRE,
  CH_CMD_CONFIRM,
  CH_CMD_ABORT,
  CH_CMD_ENTER_TEST,
  CH_CMD_EXIT_TEST,
  CH_RUN_DIAG,
  CH_ERASE_LOG
} from './channels';

// ---------------------------------------------------------------------------
// Dependency interface
// ---------------------------------------------------------------------------

/** Runtime dependencies required by the IPC handler layer. */
export interface IpcDependencies {
  /** Main application window whose webContents receives push messages. */
  window: BrowserWindow;
  /** Reactive telemetry store. */
  store: TelemetryStore;
  /** CAC command state machine. */
  cac: CacMachine;
  /** Flight computer USB transport. */
  fc: FcUsb;
  /** Ground station USB transport. */
  gs: GsUsb;
}

// ---------------------------------------------------------------------------
// Safe sender
// ---------------------------------------------------------------------------

/**
 * Safely send a message to the renderer. Guards against the window being
 * destroyed between the time the event fires and the send executes.
 */
function safe_send(window: BrowserWindow, channel: string, ...args: unknown[]): void {
  try {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, ...args);
    }
  } catch {
    // Window may have been closed mid-send — silently ignore.
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Register all IPC handlers for the application.
 *
 * Subscribes to store/CAC state changes for main-to-renderer push,
 * registers ipcMain handlers and listeners for renderer-to-main calls,
 * and returns a cleanup function that tears everything down.
 *
 * @param deps - Runtime dependencies (window, store, cac, fc, gs).
 * @returns A cleanup function. Call it before quitting or recreating
 *   the window to remove all handlers and subscriptions.
 */
export function register_ipc_handlers(deps: IpcDependencies): () => void {
  const { window, store, cac, fc, gs } = deps;

  // -----------------------------------------------------------------------
  // 1. Telemetry subscription — push every snapshot update to renderer
  // -----------------------------------------------------------------------

  const unsub_telemetry = store.subscribe((snapshot) => {
    safe_send(window, CH_TELEMETRY, snapshot);
  });

  // -----------------------------------------------------------------------
  // 2. CAC state subscription — push UI state on every phase change
  // -----------------------------------------------------------------------

  const on_cac_phase_change = (): void => {
    try {
      safe_send(window, CH_CAC_UPDATE, cac.get_ui_state());
    } catch {
      // Defensive — get_ui_state() should never throw, but guard anyway.
    }
  };
  cac.on('phase_change', on_cac_phase_change);

  // -----------------------------------------------------------------------
  // 3. Serial port scan
  // -----------------------------------------------------------------------

  const on_scan_ports = async (): Promise<void> => {
    try {
      const ports = await scan_ports();
      safe_send(window, CH_SERIAL_PORTS, ports);
    } catch {
      safe_send(window, CH_SERIAL_PORTS, []);
    }
  };
  ipcMain.on(CH_SCAN_PORTS, on_scan_ports);

  // -----------------------------------------------------------------------
  // 4. Connection handlers
  // -----------------------------------------------------------------------

  // FC connect (invoke — returns promise)
  ipcMain.handle(CH_CONNECT_FC, async (_event, port: string) => {
    try {
      await fc.connect(port);
      store.set_connection('fc', true);
    } catch (err) {
      throw new Error(
        `Failed to connect to FC: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  // GS connect (invoke — returns promise)
  ipcMain.handle(CH_CONNECT_GS, async (_event, port: string) => {
    try {
      await gs.connect(port);
      store.set_connection('gs', true);
    } catch (err) {
      throw new Error(
        `Failed to connect to GS: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  // FC disconnect (fire-and-forget)
  const on_disconnect_fc = (): void => {
    try {
      fc.disconnect();
      store.set_connection('fc', false);
    } catch {
      // disconnect() is safe to call when already disconnected
    }
  };
  ipcMain.on(CH_DISCONNECT_FC, on_disconnect_fc);

  // GS disconnect (fire-and-forget)
  const on_disconnect_gs = (): void => {
    try {
      gs.disconnect();
      store.set_connection('gs', false);
    } catch {
      // disconnect() is safe to call when already disconnected
    }
  };
  ipcMain.on(CH_DISCONNECT_GS, on_disconnect_gs);

  // -----------------------------------------------------------------------
  // 5. CAC command handlers (fire-and-forget)
  // -----------------------------------------------------------------------

  const on_cmd_arm = (_event: Electron.IpcMainEvent, channel: number): void => {
    try {
      cac.cmd_arm(channel, true);
    } catch (err) {
      console.error('[IPC] cmd_arm error:', err instanceof Error ? err.message : err);
    }
  };
  ipcMain.on(CH_CMD_ARM, on_cmd_arm);

  const on_cmd_disarm = (_event: Electron.IpcMainEvent, channel: number): void => {
    try {
      cac.cmd_arm(channel, false);
    } catch (err) {
      console.error('[IPC] cmd_disarm error:', err instanceof Error ? err.message : err);
    }
  };
  ipcMain.on(CH_CMD_DISARM, on_cmd_disarm);

  const on_cmd_fire = (
    _event: Electron.IpcMainEvent,
    channel: number,
    duration_ms: number
  ): void => {
    try {
      cac.cmd_fire(channel, duration_ms);
    } catch (err) {
      console.error('[IPC] cmd_fire error:', err instanceof Error ? err.message : err);
    }
  };
  ipcMain.on(CH_CMD_FIRE, on_cmd_fire);

  const on_cmd_confirm = (): void => {
    // Confirm is handled internally by the CAC machine's auto-confirm delay.
    // This channel exists for future manual-confirm override if needed.
    console.warn('[IPC] cmd_confirm received — manual confirm not yet implemented');
  };
  ipcMain.on(CH_CMD_CONFIRM, on_cmd_confirm);

  const on_cmd_abort = (): void => {
    try {
      cac.abort();
    } catch (err) {
      console.error('[IPC] cmd_abort error:', err instanceof Error ? err.message : err);
    }
  };
  ipcMain.on(CH_CMD_ABORT, on_cmd_abort);

  // -----------------------------------------------------------------------
  // 6. Test mode (fire-and-forget stubs)
  // -----------------------------------------------------------------------

  const on_enter_test = (): void => {
    // TODO: Implement test-mode enter command when FC protocol supports it.
    console.warn('[IPC] enter-test-mode: not yet implemented');
  };
  ipcMain.on(CH_CMD_ENTER_TEST, on_enter_test);

  const on_exit_test = (): void => {
    // TODO: Implement test-mode exit command when FC protocol supports it.
    console.warn('[IPC] exit-test-mode: not yet implemented');
  };
  ipcMain.on(CH_CMD_EXIT_TEST, on_exit_test);

  // -----------------------------------------------------------------------
  // 7. Config upload and verification (invoke — returns promise)
  // -----------------------------------------------------------------------

  ipcMain.handle(CH_UPLOAD_CONFIG, async (_event, config: FlightConfig) => {
    try {
      const binary = serialise_config(config);
      await fc.send(binary);
      return { ok: true, hash: config_hash(config) };
    } catch (err) {
      return {
        ok: false,
        error: `Config upload failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  });

  ipcMain.handle(CH_VERIFY_CONFIG, async () => {
    // Config hash verification compares the MC-local config hash against
    // the hash reported by the FC in its last ACK_CONFIG or telemetry.
    // The FC-reported hash is stored in the telemetry snapshot.
    try {
      const snapshot = store.get_snapshot();
      return {
        ok: true,
        fc_hash: snapshot.config_hash,
        verified: snapshot.config_hash_verified
      };
    } catch (err) {
      return {
        ok: false,
        error: `Hash verification failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  });

  // -----------------------------------------------------------------------
  // 8. Diagnostics (fire-and-forget)
  // -----------------------------------------------------------------------

  const on_run_diag = (): void => {
    // TODO: Send self-test command to FC, collect results, push via CH_DIAG_RESULT.
    // Stub: push a placeholder result so the renderer knows the request was received.
    try {
      safe_send(window, CH_DIAG_RESULT, {
        ok: false,
        error: 'Diagnostics not yet implemented'
      });
    } catch {
      // Ignore send failures
    }
  };
  ipcMain.on(CH_RUN_DIAG, on_run_diag);

  // -----------------------------------------------------------------------
  // 9. Flight log download and erase
  // -----------------------------------------------------------------------

  ipcMain.handle(CH_DOWNLOAD_LOG, async () => {
    // TODO: Implement flight log download from FC QSPI flash.
    // Stub: return empty array.
    return new Uint8Array(0);
  });

  const on_erase_log = (): void => {
    // TODO: Send flash erase command to FC.
    console.warn('[IPC] erase-flight-log: not yet implemented');
  };
  ipcMain.on(CH_ERASE_LOG, on_erase_log);

  // -----------------------------------------------------------------------
  // Cleanup function
  // -----------------------------------------------------------------------

  return () => {
    // Unsubscribe store and CAC listeners
    unsub_telemetry();
    cac.removeListener('phase_change', on_cac_phase_change);

    // Remove invoke handlers (promise-returning channels)
    ipcMain.removeHandler(CH_CONNECT_FC);
    ipcMain.removeHandler(CH_CONNECT_GS);
    ipcMain.removeHandler(CH_UPLOAD_CONFIG);
    ipcMain.removeHandler(CH_VERIFY_CONFIG);
    ipcMain.removeHandler(CH_DOWNLOAD_LOG);

    // Remove fire-and-forget listeners
    ipcMain.removeListener(CH_SCAN_PORTS, on_scan_ports);
    ipcMain.removeListener(CH_DISCONNECT_FC, on_disconnect_fc);
    ipcMain.removeListener(CH_DISCONNECT_GS, on_disconnect_gs);
    ipcMain.removeListener(CH_CMD_ARM, on_cmd_arm);
    ipcMain.removeListener(CH_CMD_DISARM, on_cmd_disarm);
    ipcMain.removeListener(CH_CMD_FIRE, on_cmd_fire);
    ipcMain.removeListener(CH_CMD_CONFIRM, on_cmd_confirm);
    ipcMain.removeListener(CH_CMD_ABORT, on_cmd_abort);
    ipcMain.removeListener(CH_CMD_ENTER_TEST, on_enter_test);
    ipcMain.removeListener(CH_CMD_EXIT_TEST, on_exit_test);
    ipcMain.removeListener(CH_RUN_DIAG, on_run_diag);
    ipcMain.removeListener(CH_ERASE_LOG, on_erase_log);
  };
}
