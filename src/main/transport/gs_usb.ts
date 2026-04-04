/**
 * GS (Ground Station) USB connection manager with COBS deframing.
 *
 * Handles BOTH GS relay mode (GS relays telemetry from LoRa) AND
 * direct FC mode (FC connected directly via USB). Both use the same
 * COBS framing, so this class is agnostic to which is on the other end.
 *
 * Incoming bytes are accumulated into a buffer. When the 0x00 frame
 * delimiter is received, the buffered frame is COBS-decoded and emitted
 * as a `'frame'` event. Partial frames are discarded on disconnect.
 *
 * Outgoing data is COBS-encoded with a trailing 0x00 delimiter appended
 * automatically.
 */

import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';
import { cobs_encode, cobs_decode } from './cobs';

/** Frame delimiter byte (marks end of a COBS frame on the wire). */
const FRAME_DELIMITER = 0x00;

/** Default baud rate for the GS USB link. */
const DEFAULT_BAUD_RATE = 115200;

/** Maximum frame buffer size before forced reset (guard against runaway data). */
const MAX_FRAME_BUFFER_SIZE = 65536;

/**
 * Events emitted by {@link GsUsb}.
 *
 * - `'frame'` — Decoded COBS payload (Uint8Array).
 * - `'error'` — Serial port or framing error.
 * - `'close'` — Serial port closed.
 */
export interface GsUsbEvents {
  frame: (payload: Uint8Array) => void;
  error: (err: Error) => void;
  close: () => void;
}

/**
 * Manages a COBS-framed USB serial connection to the ground station
 * (or directly to the flight computer in direct-FC mode).
 *
 * Usage:
 * ```ts
 * const gs = new GsUsb();
 * gs.on('frame', (payload) => { ... });
 * await gs.connect('COM4');
 * gs.send(new Uint8Array([0x10, 0x20]));
 * gs.disconnect();
 * ```
 */
export class GsUsb extends EventEmitter {
  private port: SerialPort | null = null;

  /** Accumulation buffer for incoming bytes before a delimiter is seen. */
  private rx_buffer: number[] = [];

  /** Saved references for listener cleanup on disconnect. */
  private _on_data: ((buf: Buffer) => void) | null = null;
  private _on_error: ((err: Error) => void) | null = null;
  private _on_close: (() => void) | null = null;

  constructor() {
    super();
  }

  /**
   * Open a serial connection to the ground station.
   *
   * @param path  - OS serial port path (e.g., "COM4" or "/dev/ttyUSB1").
   * @param baud  - Baud rate. Defaults to 115200.
   * @throws If already connected, or if the open fails.
   */
  async connect(path: string, baud: number = DEFAULT_BAUD_RATE): Promise<void> {
    if (this.port) {
      throw new Error('GsUsb: already connected — call disconnect() first');
    }

    this.rx_buffer = [];

    return new Promise<void>((resolve, reject) => {
      try {
        const port = new SerialPort({
          path,
          baudRate: baud,
          autoOpen: false
        });

        // Create bound handlers so we can remove them on disconnect.
        this._on_data = (buf: Buffer) => {
          this.on_serial_data(buf);
        };
        this._on_error = (err: Error) => {
          this.emit('error', err);
        };
        this._on_close = () => {
          // Guard: only act if this port is still the active one.
          // Prevents a stale close event from a previous port from
          // nuking a newly established connection.
          if (this.port === port) {
            this.rx_buffer = [];
            this.port = null;
            this.emit('close');
          }
        };

        port.on('data', this._on_data);
        port.on('error', this._on_error);
        port.on('close', this._on_close);

        port.open((err) => {
          if (err) {
            port.removeAllListeners();
            this._on_data = null;
            this._on_error = null;
            this._on_close = null;
            this.port = null;
            reject(new Error(`GsUsb: failed to open ${path}: ${err.message}`));
            return;
          }
          this.port = port;
          resolve();
        });
      } catch (err) {
        reject(
          new Error(
            `GsUsb: failed to create serial port: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    });
  }

  /**
   * Close the serial connection.
   *
   * Discards any partial frame in the receive buffer.
   * Safe to call even if already disconnected.
   */
  disconnect(): void {
    this.rx_buffer = [];

    if (!this.port) {
      return;
    }

    const old_port = this.port;
    this.port = null;

    // Remove our listeners before closing so the async 'close' event
    // from the old port can't interfere with a future connection.
    old_port.removeAllListeners();
    this._on_data = null;
    this._on_error = null;
    this._on_close = null;

    try {
      if (old_port.isOpen) {
        old_port.close();
      }
    } catch (err) {
      this.emit(
        'error',
        new Error(
          `GsUsb: error during disconnect: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  /**
   * COBS-encode a payload and send it with a trailing 0x00 delimiter.
   *
   * @param data - Raw payload bytes to send.
   * @throws If not connected.
   */
  send(data: Uint8Array): void {
    if (!this.port || !this.port.isOpen) {
      throw new Error('GsUsb: not connected');
    }

    try {
      const encoded = cobs_encode(data);

      // Build wire frame: encoded bytes + 0x00 delimiter.
      const wire_frame = new Uint8Array(encoded.length + 1);
      wire_frame.set(encoded, 0);
      wire_frame[encoded.length] = FRAME_DELIMITER;

      this.port.write(Buffer.from(wire_frame));
    } catch (err) {
      this.emit(
        'error',
        new Error(
          `GsUsb: send failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  /**
   * Check whether the serial connection is currently open.
   *
   * @returns `true` if connected and port is open.
   */
  is_connected(): boolean {
    return this.port !== null && this.port.isOpen;
  }

  /**
   * Process incoming serial bytes, accumulating into the frame buffer
   * and emitting decoded frames when a 0x00 delimiter is encountered.
   */
  private on_serial_data(buf: Buffer): void {
    for (let i = 0; i < buf.length; i++) {
      const byte = buf[i];

      if (byte === FRAME_DELIMITER) {
        // End of frame. Attempt decode if we have accumulated data.
        if (this.rx_buffer.length > 0) {
          const frame_bytes = new Uint8Array(this.rx_buffer);
          this.rx_buffer = [];

          const decoded = cobs_decode(frame_bytes);
          if (decoded !== null) {
            try {
              this.emit('frame', decoded);
            } catch (err) {
              // Don't let a handler error stop processing remaining bytes.
              this.emit(
                'error',
                new Error(
                  `GsUsb: frame handler error: ${err instanceof Error ? err.message : String(err)}`
                )
              );
            }
          }
          // Malformed frames are silently discarded — expected on
          // initial connect when partial data may be on the wire.
        }
        // If rx_buffer was empty, this is a back-to-back delimiter — ignore.
      } else {
        this.rx_buffer.push(byte);

        // Guard against unbounded buffer growth from corrupt streams.
        if (this.rx_buffer.length > MAX_FRAME_BUFFER_SIZE) {
          this.rx_buffer = [];
          this.emit(
            'error',
            new Error('GsUsb: frame buffer overflow — buffer reset')
          );
        }
      }
    }
  }
}
