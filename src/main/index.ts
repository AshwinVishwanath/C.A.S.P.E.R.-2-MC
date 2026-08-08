import { app, BrowserWindow, shell, Menu } from 'electron'
import { join } from 'path'
import { appendFileSync } from 'fs'
import { tmpdir } from 'os'

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

// --- TEMP DEBUG: GS pipeline file logger (uncommitted bring-up aid) ---
const GS_DEBUG_LOG = join(tmpdir(), 'casper_gs_debug.log')
function gslog(line: string): void {
  try {
    appendFileSync(GS_DEBUG_LOG, `${new Date().toISOString()} ${line}\n`)
  } catch {
    /* best-effort debug logging */
  }
}
function hex(frame: Uint8Array, max = 48): string {
  return Array.from(frame.subarray(0, max))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ') + (frame.length > max ? ' …' : '')
}

/**
 * Wire GS frames through the protocol parser into the telemetry store
 * and CAC machine. GS frames arrive COBS-decoded with msg_id as byte 0.
 */
function wire_gs_pipeline(): void {
  gs.on('frame', (frame: Uint8Array) => {
    if (frame.length < 1) return

    console.log(`[GS] frame received: ${frame.length} bytes, msg_id=0x${frame[0].toString(16).padStart(2, '0')}`)
    gslog(`RX ${frame.length}B id=0x${frame[0].toString(16).padStart(2, '0')} | ${hex(frame)}`)

    const result = parse_packet(frame)

    if (!result.ok) {
      console.warn(`[GS] parse error: ${result.error}${result.msg_id !== undefined ? ` (msg_id=0x${result.msg_id.toString(16).padStart(2, '0')})` : ''}`)
      gslog(`  PARSE-ERR ${result.error}${result.msg_id !== undefined ? ` (id=0x${result.msg_id.toString(16).padStart(2, '0')})` : ''}`)
      return
    }

    const msg = result.message
    console.log(`[GS] parsed message type: ${msg.type}`)
    switch (msg.type) {
      case 'gs_telem':
        gslog(`  gs_telem crc=${msg.data.crc_ok} seq=${msg.data.seq} alt=${msg.data.alt_m.toFixed(2)}m vel=${msg.data.vel_mps.toFixed(1)} batt=${msg.data.batt_v.toFixed(2)}V rssi=${msg.data.rssi_dbm.toFixed(1)} snr=${msg.data.snr_db.toFixed(1)} age=${msg.data.data_age_ms}ms`)
        store.update_from_gs_telem(msg.data)
        cac.on_telemetry_status(msg.data.status)
        break
      case 'fc_fast':
        gslog(`  fc_fast crc=${msg.data.crc_ok} seq=${msg.data.seq} alt=${msg.data.alt_m.toFixed(2)}m vel=${msg.data.vel_mps.toFixed(1)} batt=${msg.data.batt_v.toFixed(2)}V`)
        store.update_from_fc_fast(msg.data)
        cac.on_telemetry_status(msg.data.status)
        break
      case 'fc_gps':
        gslog(`  fc_gps crc=${msg.data.crc_ok} fix=${msg.data.fix_type} sats=${msg.data.sat_count} alt_msl=${msg.data.alt_msl_m.toFixed(2)}m`)
        store.update_from_gps(msg.data)
        break
      case 'fc_event':
        gslog(`  fc_event crc=${msg.data.crc_ok} type=${msg.data.event_type} data=${msg.data.event_data}`)
        store.update_from_event(msg.data)
        break
      case 'gs_status':
        gslog(`  gs_status crc=${msg.data.crc_ok} profile=${msg.data.radio_profile} rssi=${msg.data.last_rssi_dbm} snr=${msg.data.last_snr_db} rx=${msg.data.rx_pkt_count} crcfail=${msg.data.rx_crc_fail} gndP=${msg.data.ground_pressure_pa}Pa lat=${msg.data.ground_lat_deg.toFixed(6)} lon=${msg.data.ground_lon_deg.toFixed(6)}`)
        if (!msg.data.crc_ok) {
          console.warn('[GS] CRC mismatch on GS_MSG_STATUS — applying anyway')
        }
        store.update_from_gs_status(msg.data)
        break
      case 'ack_arm':
      case 'ack_fire':
      case 'nack':
        gslog(`  ${msg.type}`)
        cac.on_message(msg)
        break
      default:
        gslog(`  (unhandled type: ${msg.type})`)
    }
  })
}

/**
 * Wire FC direct-USB data through the protocol parser into the telemetry
 * store and CAC machine. Each frame event carries a decoded COBS payload
 * with msg_id as byte 0.
 */
function wire_fc_pipeline(): void {
  fc.on('frame', (data: Uint8Array) => {
    if (data.length < 1) return

    const result = parse_packet(data)

    if (!result.ok) {
      console.warn(`[FC] parse error: ${result.error}${result.msg_id !== undefined ? ` (msg_id=0x${result.msg_id.toString(16).padStart(2, '0')})` : ''}`)
      return
    }

    const msg = result.message
    switch (msg.type) {
      case 'fc_fast':
        if (!msg.data.crc_ok) {
          console.warn(`[FC] CRC mismatch on FC_MSG_FAST seq=${msg.data.seq}`)
        }
        store.update_from_fc_fast(msg.data)
        cac.on_telemetry_status(msg.data.status)
        break
      case 'fc_gps':
        if (!msg.data.crc_ok) {
          console.warn('[FC] CRC mismatch on FC_MSG_GPS')
        }
        store.update_from_gps(msg.data)
        break
      case 'fc_event':
        if (!msg.data.crc_ok) {
          console.warn('[FC] CRC mismatch on FC_MSG_EVENT')
        }
        store.update_from_event(msg.data)
        break
      case 'ack_arm':
      case 'ack_fire':
      case 'nack':
        cac.on_message(msg)
        break
      case 'ack_config':
        if (!msg.data.crc_ok) {
          console.warn('[FC] CRC mismatch on ACK_CONFIG')
        }
        store.update_from_ack_config(msg.data.config_hash)
        break
      case 'ack_logic':
        if (!msg.data.crc_ok) {
          console.warn('[FC] CRC mismatch on ACK_LOGIC')
        }
        store.update_from_ack_logic(msg.data.logic_hash)
        break
      case 'handshake':
        store.set_protocol_ok(true, msg.data.fw_version)
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
  gs.on('error', (err: Error) => {
    console.error('[GS] transport error:', err.message)
  })
  fc.on('close', () => {
    store.set_connection('fc', false)
  })
  fc.on('error', (err: Error) => {
    console.error('[FC] transport error:', err.message)
  })
}

// ---------------------------------------------------------------------------
// Application lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
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
