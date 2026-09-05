import { contextBridge, ipcRenderer } from 'electron'

/**
 * CasperBridge — Preload API exposed to the renderer via window.casper.
 * Stub implementation: all methods are no-ops until backend modules are wired in Phase 3.
 */
const casper_api = {
  // --- Subscriptions (main → renderer) ---
  on_telemetry: (cb: (snapshot: unknown) => void): (() => void) => {
    const handler = (_event: unknown, snapshot: unknown) => cb(snapshot)
    ipcRenderer.on('casper:telemetry', handler)
    return () => ipcRenderer.removeListener('casper:telemetry', handler)
  },

  on_cac_update: (cb: (state: unknown) => void): (() => void) => {
    const handler = (_event: unknown, state: unknown) => cb(state)
    ipcRenderer.on('casper:cac-update', handler)
    return () => ipcRenderer.removeListener('casper:cac-update', handler)
  },

  on_diag_result: (cb: (results: unknown) => void): (() => void) => {
    const handler = (_event: unknown, results: unknown) => cb(results)
    ipcRenderer.on('casper:diag-result', handler)
    return () => ipcRenderer.removeListener('casper:diag-result', handler)
  },

  on_serial_ports: (cb: (ports: unknown) => void): (() => void) => {
    const handler = (_event: unknown, ports: unknown) => cb(ports)
    ipcRenderer.on('casper:serial-ports', handler)
    return () => ipcRenderer.removeListener('casper:serial-ports', handler)
  },

  // --- Connection (renderer → main) ---
  connect_fc: (port: string): Promise<unknown> => {
    return ipcRenderer.invoke('casper:connect-fc', port)
  },

  disconnect_fc: (): void => {
    ipcRenderer.send('casper:disconnect-fc')
  },

  connect_gs: (port: string): Promise<void> => {
    return ipcRenderer.invoke('casper:connect-gs', port)
  },

  disconnect_gs: (): void => {
    ipcRenderer.send('casper:disconnect-gs')
  },

  scan_ports: (): void => {
    ipcRenderer.send('casper:scan-ports')
  },

  // --- CAC Commands ---
  cmd_arm: (channel: number): void => {
    ipcRenderer.send('casper:cmd-arm', channel)
  },

  cmd_disarm: (channel: number): void => {
    ipcRenderer.send('casper:cmd-disarm', channel)
  },

  cmd_enter_test_mode: (): void => {
    ipcRenderer.send('casper:cmd-enter-test-mode')
  },

  cmd_exit_test_mode: (): void => {
    ipcRenderer.send('casper:cmd-exit-test-mode')
  },

  cmd_fire: (channel: number, duration_ms: number): void => {
    ipcRenderer.send('casper:cmd-fire', channel, duration_ms)
  },

  cmd_confirm: (): void => {
    ipcRenderer.send('casper:cmd-confirm')
  },

  cmd_abort: (): void => {
    ipcRenderer.send('casper:cmd-abort')
  },

  // --- Setup ---
  upload_config: (config: unknown): Promise<unknown> => {
    return ipcRenderer.invoke('casper:upload-config', config)
  },

  verify_config_hash: (): Promise<unknown> => {
    return ipcRenderer.invoke('casper:verify-config-hash')
  },

  run_diagnostics: (): void => {
    ipcRenderer.send('casper:run-diagnostics')
  },

  download_flight_log: (): Promise<unknown> => {
    return ipcRenderer.invoke('casper:download-flight-log')
  },

  erase_flight_log: (): void => {
    ipcRenderer.send('casper:erase-flight-log')
  },

  on_log_progress: (cb: (progress: unknown) => void): (() => void) => {
    const handler = (_event: unknown, progress: unknown) => cb(progress)
    ipcRenderer.on('casper:log-progress', handler)
    return () => ipcRenderer.removeListener('casper:log-progress', handler)
  },

  export_flight_log_csv: (type: string): Promise<unknown> => {
    return ipcRenderer.invoke('casper:export-log-csv', type)
  },

  cmd_sim_flight: (): void => {
    ipcRenderer.send('casper:cmd-sim-flight')
  },

  /**
   * Upload a logic graph to the FC.
   *
   * Compiles the graph in the main process and, if the FC is connected,
   * transmits the binary Logic VM program. Returns compile errors, hash,
   * stats, and a `sent` flag indicating whether the FC received it.
   */
  upload_logic: (graph: unknown): Promise<unknown> => {
    return ipcRenderer.invoke('casper:upload-logic', graph)
  },

  /**
   * Compile a logic graph without sending it to the FC.
   *
   * Returns `{ ok, bytes: number[], hash, stats }` for offline preview.
   * Useful for the renderer to display compile errors or show program size
   * before the FC is connected.
   */
  compile_logic: (graph: unknown): Promise<unknown> => {
    return ipcRenderer.invoke('casper:compile-logic', graph)
  },

  // --- OpenRocket sim mode ---

  /**
   * Open a file dialog and load a flight simulation (CSV now, .ork later).
   * Resolves to `{ ok, profile, filename }` or `{ ok: false, error|canceled }`.
   */
  sim_load: (): Promise<unknown> => {
    return ipcRenderer.invoke('casper:sim-load')
  },

  /** Push one playback sample into the telemetry store (fire-and-forget). */
  sim_push: (sample: unknown): void => {
    ipcRenderer.send('casper:sim-push', sample)
  },

  /** Mark simulation active/inactive (drives live indicators + reset). */
  sim_active: (active: boolean): void => {
    ipcRenderer.send('casper:sim-active', active)
  },

  // --- Clipboard (recovery panel "copy coordinates") ---

  /** Write text to the system clipboard. Resolves { ok, error? }. */
  copy_to_clipboard: (text: string): Promise<unknown> => {
    return ipcRenderer.invoke('casper:clipboard-write', text)
  },

  // --- Debrief (Casper-3 flash dump + flight analysis) ---
  // Separate from download_flight_log() above, which is the Casper-2 readout.

  /**
   * Pull the FC's flash over the CDMP dump protocol, save the .bin, and
   * resolve to the flight list. `include_prelaunch` adds the 39 MiB PAD wrap
   * region — needed only when launch detect missed.
   */
  debrief_download: (opts: { include_prelaunch?: boolean }): Promise<unknown> => {
    return ipcRenderer.invoke('casper:debrief-download', opts)
  },

  /** Open a previously saved .bin through a file dialog. */
  debrief_open: (): Promise<unknown> => {
    return ipcRenderer.invoke('casper:debrief-open')
  },

  /**
   * Decode one flight out of the loaded image and get its chart series.
   * `range` ({ t0, t1 } in seconds from the flight's first record) re-decimates
   * the series over just that window at full record resolution — that is what
   * makes the charts' drag-zoom reveal detail. Statistics stay whole-flight.
   */
  debrief_flight: (
    flight_id: number,
    range?: { t0: number; t1: number } | null
  ): Promise<unknown> => {
    return ipcRenderer.invoke('casper:debrief-flight', flight_id, range ?? null)
  },

  /** Reveal the saved .bin in the OS file manager. */
  debrief_reveal: (): Promise<unknown> => {
    return ipcRenderer.invoke('casper:debrief-reveal')
  },

  /** Ask an in-progress dump to stop at the next chunk boundary. */
  debrief_cancel: (): void => {
    ipcRenderer.send('casper:debrief-cancel')
  },

  /**
   * Export one stream of one flight as CSV. Opens a Save dialog so the
   * operator picks the location. Resolves { ok, path, rows } or
   * { ok: false, cancelled | error }.
   */
  debrief_export_csv: (flight_id: number, stream: 'hr' | 'lr' | 'bmi'): Promise<unknown> => {
    return ipcRenderer.invoke('casper:debrief-export-csv', flight_id, stream)
  },

  /** Subscribe to dump progress. Returns an unsubscribe function. */
  on_debrief_progress: (cb: (progress: unknown) => void): (() => void) => {
    const handler = (_e: unknown, progress: unknown): void => cb(progress)
    ipcRenderer.on('casper:debrief-progress', handler)
    return () => ipcRenderer.removeListener('casper:debrief-progress', handler)
  }
}

contextBridge.exposeInMainWorld('casper', casper_api)
