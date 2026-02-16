import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'

import { FcUsb } from './transport/fc_usb'
import { GsUsb } from './transport/gs_usb'
import { parse_packet } from './protocol/parser'
import { CacMachine } from './command/cac_machine'
import { TelemetryStore } from './store/telemetry_store'
import { register_ipc_handlers } from './ipc/handlers'

let main_window: BrowserWindow | null = null

// ---------------------------------------------------------------------------
// Module instances (created after window, used across the process lifetime)
// ---------------------------------------------------------------------------

let fc: FcUsb
let gs: GsUsb
let store: TelemetryStore
let cac: CacMachine
let stale_interval: ReturnType<typeof setInterval>
let cleanup_ipc: (() => void) | null = null

function create_window(): void {
  main_window = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'Casper Mission Control',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Open external links in browser
  main_window.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load renderer — dev server in development, built files in production
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    main_window.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    main_window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  main_window.on('closed', () => {
    main_window = null
  })
}

// ---------------------------------------------------------------------------
// Data pipeline wiring
// ---------------------------------------------------------------------------

/**
 * Wire GS frames through the protocol parser into the telemetry store
 * and CAC machine. GS frames arrive COBS-decoded with msg_id as byte 0.
 */
function wire_gs_pipeline(): void {
  gs.on('frame', (frame: Uint8Array) => {
    if (frame.length < 1) return

    const result = parse_packet(frame)

    if (!result.ok) {
      // TODO: Attempt stage 1 CRC correction
      return
    }

    const msg = result.message
    switch (msg.type) {
      case 'gs_telem':
        store.update_from_gs_telem(msg.data)
        cac.on_telemetry_status(msg.data.status)
        break
      case 'fc_fast':
        store.update_from_fc_fast(msg.data)
        cac.on_telemetry_status(msg.data.status)
        break
      case 'fc_gps':
        store.update_from_gps(msg.data)
        break
      case 'fc_event':
        store.update_from_event(msg.data)
        break
      case 'ack_arm':
      case 'ack_fire':
      case 'nack':
        cac.on_message(msg)
        break
    }
  })
}

/**
 * Wire FC direct-USB data through the protocol parser into the telemetry
 * store and CAC machine. Each data event carries raw bytes with msg_id
 * as byte 0.
 */
function wire_fc_pipeline(): void {
  fc.on('data', (data: Uint8Array) => {
    if (data.length < 1) return

    const result = parse_packet(data)

    if (!result.ok) return

    const msg = result.message
    switch (msg.type) {
      case 'fc_fast':
        store.update_from_fc_fast(msg.data)
        cac.on_telemetry_status(msg.data.status)
        break
      case 'fc_gps':
        store.update_from_gps(msg.data)
        break
      case 'fc_event':
        store.update_from_event(msg.data)
        break
      case 'ack_arm':
      case 'ack_fire':
      case 'nack':
        cac.on_message(msg)
        break
    }
  })
}

/**
 * Wire transport disconnect events to the telemetry store so the
 * renderer knows when a link drops.
 */
function wire_connection_events(): void {
  gs.on('close', () => {
    store.set_connection('gs', false)
  })
  fc.on('close', () => {
    store.set_connection('fc', false)
  })
}

// ---------------------------------------------------------------------------
// Application lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  create_window()

  // 1. Create transport managers
  fc = new FcUsb()
  gs = new GsUsb()

  // 2. Create telemetry store
  store = new TelemetryStore()

  // 3. Create CAC machine with transport callbacks
  cac = new CacMachine({
    send: (data: Uint8Array) => {
      // Prefer GS (LoRa relay) if connected, fall back to FC (direct USB)
      if (gs.is_connected()) {
        gs.send(data)
      } else if (fc.is_connected()) {
        fc.send(data)
      }
    },
    on_state_change: (_state) => {
      // State changes are pushed to renderer via IPC handler subscription
    }
  })

  // 4. Wire data pipelines
  wire_gs_pipeline()
  wire_fc_pipeline()
  wire_connection_events()

  // 5. Start stale-data tick (100 ms)
  stale_interval = setInterval(() => {
    store.tick_stale(Date.now())
  }, 100)

  // 6. Register IPC handlers (needs BrowserWindow instance)
  cleanup_ipc = register_ipc_handlers({
    window: main_window!,
    store,
    cac,
    fc,
    gs
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      create_window()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  clearInterval(stale_interval)
  if (cleanup_ipc) {
    cleanup_ipc()
    cleanup_ipc = null
  }
  cac.reset()
  fc.disconnect()
  gs.disconnect()
})
