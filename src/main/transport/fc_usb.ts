/**
 * FC (Flight Computer) USB connection manager.
 *
 * Used in Setup mode only. The FC USB link is unframed command-response
 * (no COBS framing). Raw bytes are sent/received as-is over a serial port.
 */

import { SerialPort } from 'serialport';
import { EventEmitter } from 'events';

/** Default baud rate for the FC USB link. */
const DEFAULT_BAUD_RATE = 115200;

/**
 * Events emitted by {@link FcUsb}.
 *
 * - `'data'`  — Raw bytes received from the flight computer.
 * - `'error'` — Serial port error.
 * - `'close'` — Serial port closed.
 */
export interface FcUsbEvents {
  data: (payload: Uint8Array) => void;
  error: (err: Error) => void;
  close: () => void;
}

/**
 * Manages an unframed USB serial connection to the flight computer.
 *
 * Usage:
 * ```ts
 * const fc = new FcUsb();
 * fc.on('data', (bytes) => { ... });
 * await fc.connect('COM3');
 * await fc.send(new Uint8Array([0x01, 0x02]));
 * fc.disconnect();
 * ```
 */
export class FcUsb extends EventEmitter {
  private port: SerialPort | null = null;

  constructor() {
    super();
  }

  /**
   * Open a serial connection to the flight computer.
   *
   * @param path  - OS serial port path (e.g., "COM3" or "/dev/ttyUSB0").
   * @param baud  - Baud rate. Defaults to 115200.
   * @throws If the port is already connected, or if the open fails.
   */
  async connect(path: string, baud: number = DEFAULT_BAUD_RATE): Promise<void> {
    if (this.port) {
      throw new Error('FcUsb: already connected — call disconnect() first');
    }

    return new Promise<void>((resolve, reject) => {
      try {
        const port = new SerialPort({
          path,
          baudRate: baud,
          autoOpen: false
        });

        port.on('data', (buf: Buffer) => {
          this.emit('data', new Uint8Array(buf));
        });

        port.on('error', (err: Error) => {
          this.emit('error', err);
        });

        port.on('close', () => {
          this.port = null;
          this.emit('close');
        });

        port.open((err) => {
          if (err) {
            this.port = null;
            reject(new Error(`FcUsb: failed to open ${path}: ${err.message}`));
            return;
          }
          this.port = port;
          resolve();
        });
      } catch (err) {
        reject(
          new Error(
            `FcUsb: failed to create serial port: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    });
  }

  /**
   * Close the serial connection.
   *
   * Safe to call even if already disconnected. Emits `'close'` when done.
   */
  disconnect(): void {
    if (!this.port) {
      return;
    }
    try {
      if (this.port.isOpen) {
        this.port.close();
      }
    } catch (err) {
      this.emit(
        'error',
        new Error(
          `FcUsb: error during disconnect: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
    this.port = null;
  }

  /**
   * Send raw bytes to the flight computer.
   *
   * @param data - Bytes to send.
   * @throws If not connected, or if the write fails.
   */
  async send(data: Uint8Array): Promise<void> {
    if (!this.port || !this.port.isOpen) {
      throw new Error('FcUsb: not connected');
    }

    return new Promise<void>((resolve, reject) => {
      try {
        this.port!.write(Buffer.from(data), (err) => {
          if (err) {
            reject(new Error(`FcUsb: write failed: ${err.message}`));
            return;
          }
          resolve();
        });
      } catch (err) {
        reject(
          new Error(
            `FcUsb: write error: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    });
  }

  /**
   * Check whether the serial connection is currently open.
   *
   * @returns `true` if connected and port is open.
   */
  is_connected(): boolean {
    return this.port !== null && this.port.isOpen;
  }
}
