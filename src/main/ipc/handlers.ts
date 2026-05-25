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
import { build_handshake, build_sim_flight, build_testmode } from '../protocol/command_builder';
import type { FlightConfig } from '../protocol/types';
import { run_readout, run_erase } from '../readout/readout_orchestrator';
import { export_all_csv, export_hr_csv, export_lr_csv, export_summary_csv } from '../readout/csv_export';
import type { ReadoutResult } from '../readout/readout_types';
import { compile_logic_graph } from '../protocol/logic_compiler';
import type { LogicGraphIR } from '../protocol/logic_program';
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
  CH_ERASE_LOG,
  CH_CMD_SIM_FLIGHT,
  CH_LOG_PROGRESS,
  CH_EXPORT_LOG_CSV,
  CH_UPLOAD_LOGIC,
  CH_COMPILE_LOGIC
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

  /** Holds the last successful readout result for CSV export. */
  let last_readout: ReadoutResult | null = null;

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

      // Send handshake to validate protocol version
      const handshake = build_handshake();
      await fc.send(handshake);
      // The handshake response will be handled by wire_fc_pipeline when it arrives
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

  /**
   * Reset the CAC machine if it's stuck (e.g. waiting for an ACK that
   * never arrived). This lets the operator retry without waiting for
   * the full 10-second overall timeout.
   */
  const reset_cac_if_busy = (): void => {
    if (cac.is_busy()) {
      console.warn('[IPC] CAC was busy — resetting for new command');
      cac.reset();
    }
  };

  const on_cmd_arm = (_event: Electron.IpcMainEvent, channel: number): void => {
    try {
      reset_cac_if_busy();
      cac.cmd_arm(channel, true);
    } catch (err) {
      console.error('[IPC] cmd_arm error:', err instanceof Error ? err.message : err);
    }
  };
  ipcMain.on(CH_CMD_ARM, on_cmd_arm);

  const on_cmd_disarm = (_event: Electron.IpcMainEvent, channel: number): void => {
    try {
      reset_cac_if_busy();
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
      reset_cac_if_busy();
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
    try {
      const cmd = build_testmode();
      if (fc.is_connected()) {
        fc.send(cmd);
      } else {
        console.warn('[IPC] enter-test-mode: FC not connected');
      }
    } catch (err) {
      console.error('[IPC] enter-test-mode error:', err instanceof Error ? err.message : err);
    }
  };
  ipcMain.on(CH_CMD_ENTER_TEST, on_enter_test);

  const on_exit_test = (): void => {
    try {
      const cmd = build_testmode();
      if (fc.is_connected()) {
        fc.send(cmd);
      } else {
        console.warn('[IPC] exit-test-mode: FC not connected');
      }
    } catch (err) {
      console.error('[IPC] exit-test-mode error:', err instanceof Error ? err.message : err);
    }
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
    try {
      const progress_cb = (p: import('../readout/readout_types').ReadoutProgress) => {
        safe_send(window, CH_LOG_PROGRESS, p);
      };
      const result = await run_readout(fc, progress_cb);
      last_readout = result;
      return result;
    } catch (err) {
      safe_send(window, CH_LOG_PROGRESS, {
        phase: 'error',
        pct: 0,
        detail: 'Download failed',
        error: err instanceof Error ? err.message : String(err)
      });
      throw new Error(
        `Flight log download failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });

  const on_erase_log = async (): Promise<void> => {
    try {
      const progress_cb = (p: import('../readout/readout_types').ReadoutProgress) => {
        safe_send(window, CH_LOG_PROGRESS, p);
      };
      await run_erase(fc, progress_cb);
      last_readout = null;
    } catch (err) {
      safe_send(window, CH_LOG_PROGRESS, {
        phase: 'error',
        pct: 0,
        detail: 'Erase failed',
        error: err instanceof Error ? err.message : String(err)
      });
      console.error('[IPC] erase error:', err instanceof Error ? err.message : err);
    }
  };
  ipcMain.on(CH_ERASE_LOG, on_erase_log);

  // CSV export handler
  ipcMain.handle(CH_EXPORT_LOG_CSV, async (_event, type: string) => {
    if (!last_readout) {
      return { ok: false, error: 'No flight log data — download first' };
    }
    try {
      let saved = false;
      switch (type) {
        case 'hr':
          saved = await export_hr_csv(last_readout.hr_entries, window);
          break;
        case 'lr':
          saved = await export_lr_csv(last_readout.lr_entries, window);
          break;
        case 'summary':
          saved = await export_summary_csv(last_readout.summary_entries, window);
          break;
        case 'all':
        default:
          saved = await export_all_csv(last_readout, window);
          break;
      }
      return { ok: saved };
    } catch (err) {
      return {
        ok: false,
        error: `CSV export failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  });

  // -----------------------------------------------------------------------
  // 10. Logic VM — compile and upload
  // -----------------------------------------------------------------------

  /**
   * Upload a logic graph to the FC.
   *
   * Compiles the graph to the binary Logic VM format. If the FC is connected,
   * the binary is transmitted immediately and the result includes `sent: true`.
   * If the FC is not connected the compile succeeds and `sent: false` is returned
   * (useful for offline preview from the renderer).
   */
  ipcMain.handle(CH_UPLOAD_LOGIC, async (_event, graph: LogicGraphIR) => {
    const compile_result = compile_logic_graph(graph);
    if (!compile_result.ok) {
      return { ok: false, errors: compile_result.errors };
    }
    const { bytes, hash, stats } = compile_result;
    if (fc.is_connected()) {
      try {
        await fc.send(bytes);
        return { ok: true, hash, stats, sent: true };
      } catch (err) {
        return {
          ok: false,
          errors: [
            `Compile succeeded but FC send failed: ${err instanceof Error ? err.message : String(err)}`
          ]
        };
      }
    }
    // FC not connected — compile-only path
    return { ok: true, hash, stats, sent: false };
  });

  /**
   * Compile a logic graph without sending it to the FC.
   *
   * Returns the compiled bytes as a number[] (IPC-serialisable) along with
   * the CRC hash and compile statistics. Useful for offline validation and
   * preview in the renderer.
   */
  ipcMain.handle(CH_COMPILE_LOGIC, async (_event, graph: LogicGraphIR) => {
    const compile_result = compile_logic_graph(graph);
    if (!compile_result.ok) {
      return { ok: false, errors: compile_result.errors };
    }
    const { bytes, hash, stats } = compile_result;
    // Convert Uint8Array → number[] for structured-clone IPC serialisation
    return { ok: true, bytes: Array.from(bytes), hash, stats };
  });

  // -----------------------------------------------------------------------
  // 11. Simulated flight (fire-and-forget)
  // -----------------------------------------------------------------------

  const on_sim_flight = (): void => {
    try {
      const cmd = build_sim_flight();
      if (fc.is_connected()) {
        fc.send(cmd);
      }
    } catch (err) {
      console.error('[IPC] sim_flight error:', err);
    }
  };
  ipcMain.on(CH_CMD_SIM_FLIGHT, on_sim_flight);

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
    ipcMain.removeHandler(CH_EXPORT_LOG_CSV);
    ipcMain.removeHandler(CH_UPLOAD_LOGIC);
    ipcMain.removeHandler(CH_COMPILE_LOGIC);

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
    ipcMain.removeListener(CH_CMD_SIM_FLIGHT, on_sim_flight);
  };
}
