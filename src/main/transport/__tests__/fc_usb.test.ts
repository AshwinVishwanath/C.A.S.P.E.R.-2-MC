import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock serialport. The vi.mock factory is hoisted, so we must define the
// mock class entirely inside the factory (no references to outer scope).
// ---------------------------------------------------------------------------

vi.mock('serialport', () => {
  const { EventEmitter } = require('events');

  class MockSerialPort extends EventEmitter {
    path: string;
    baudRate: number;
    isOpen: boolean;

    constructor(opts: { path: string; baudRate: number; autoOpen: boolean }) {
      super();
      this.path = opts.path;
      this.baudRate = opts.baudRate;
      this.isOpen = false;
    }

    open(cb: (err: Error | null) => void): void {
      this.isOpen = true;
      cb(null);
    }

    write(data: Buffer, cb?: (err: Error | null) => void): boolean {
      if (cb) cb(null);
      return true;
    }

    close(cb?: (err: Error | null) => void): void {
      this.isOpen = false;
      if (cb) cb(null);
      process.nextTick(() => this.emit('close'));
    }
  }

  return { SerialPort: MockSerialPort };
});

// Import after mock is in place.
import { FcUsb } from '../fc_usb';

describe('FcUsb', () => {
  let fc: FcUsb;

  beforeEach(() => {
    fc = new FcUsb();
  });

  afterEach(() => {
    fc.disconnect();
    fc.removeAllListeners();
  });

  // --- Connection lifecycle -----------------------------------------------

  it('connects successfully and reports is_connected() === true', async () => {
    await fc.connect('COM_TEST');
    expect(fc.is_connected()).toBe(true);
  });

  it('reports is_connected() === false before connect', () => {
    expect(fc.is_connected()).toBe(false);
  });

  it('throws when connecting twice without disconnect', async () => {
    await fc.connect('COM_TEST');
    await expect(fc.connect('COM_TEST')).rejects.toThrow(/already connected/);
  });

  it('disconnect sets is_connected() to false', async () => {
    await fc.connect('COM_TEST');
    fc.disconnect();
    expect(fc.is_connected()).toBe(false);
  });

  it('disconnect is safe to call when not connected', () => {
    expect(() => fc.disconnect()).not.toThrow();
  });

  it('can reconnect after disconnect', async () => {
    await fc.connect('COM_TEST');
    fc.disconnect();
    await fc.connect('COM_TEST');
    expect(fc.is_connected()).toBe(true);
  });

  // --- Send / Receive -----------------------------------------------------

  it('sends data via the serial port', async () => {
    await fc.connect('COM_TEST');

    const port = (fc as any).port;
    const write_spy = vi.spyOn(port, 'write');

    const payload = new Uint8Array([0x01, 0x02, 0x03]);
    await fc.send(payload);

    expect(write_spy).toHaveBeenCalledTimes(1);
    const sent_buf = write_spy.mock.calls[0][0] as Buffer;
    expect(Array.from(sent_buf)).toEqual([0x01, 0x02, 0x03]);
  });

  it('throws on send when not connected', async () => {
    await expect(fc.send(new Uint8Array([0x01]))).rejects.toThrow(/not connected/);
  });

  it('emits "data" when serial port receives bytes', async () => {
    await fc.connect('COM_TEST');

    const received: Uint8Array[] = [];
    fc.on('data', (d: Uint8Array) => received.push(d));

    const port = (fc as any).port;
    port.emit('data', Buffer.from([0xaa, 0xbb, 0xcc]));

    expect(received).toHaveLength(1);
    expect(Array.from(received[0])).toEqual([0xaa, 0xbb, 0xcc]);
  });

  // --- Error / Close events -----------------------------------------------

  it('emits "error" when the serial port emits an error', async () => {
    await fc.connect('COM_TEST');

    const errors: Error[] = [];
    fc.on('error', (e: Error) => errors.push(e));

    const port = (fc as any).port;
    port.emit('error', new Error('test error'));

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('test error');
  });

  it('emits "close" when the serial port closes', async () => {
    await fc.connect('COM_TEST');

    let closed = false;
    fc.on('close', () => {
      closed = true;
    });

    const port = (fc as any).port;
    port.emit('close');

    expect(closed).toBe(true);
  });

  // --- Connect failure -----------------------------------------------------

  it('rejects connect when port.open fails', async () => {
    // We need to create a new FcUsb, and override the mock's open behavior
    // temporarily. Access the mock constructor through the mocked module.
    const { SerialPort } = await import('serialport');
    const original_open = SerialPort.prototype.open;

    SerialPort.prototype.open = function (cb: any) {
      cb(new Error('device busy'));
    };

    const fc_fail = new FcUsb();
    await expect(fc_fail.connect('COM_BAD')).rejects.toThrow(/device busy/);
    expect(fc_fail.is_connected()).toBe(false);

    // Restore.
    SerialPort.prototype.open = original_open;
  });
});
