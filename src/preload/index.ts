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

  download_flight_log: (): Promise<Uint8Array> => {
    return ipcRenderer.invoke('casper:download-flight-log')
  },

  erase_flight_log: (): void => {
    ipcRenderer.send('casper:erase-flight-log')
  },

  cmd_sim_flight: (): void => {
    ipcRenderer.send('casper:cmd-sim-flight')
  }
}

contextBridge.exposeInMainWorld('casper', casper_api)
