import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cobs_encode } from '../cobs';

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
    written_buffers: Buffer[];

    constructor(opts: { path: string; baudRate: number; autoOpen: boolean }) {
      super();
      this.path = opts.path;
      this.baudRate = opts.baudRate;
      this.isOpen = false;
      this.written_buffers = [];
    }

    open(cb: (err: Error | null) => void): void {
      this.isOpen = true;
      cb(null);
    }

    write(data: Buffer, cb?: (err: Error | null) => void): boolean {
      this.written_buffers.push(Buffer.from(data));
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
import { GsUsb } from '../gs_usb';

/** Frame delimiter on the wire. */
const DELIM = 0x00;

describe('GsUsb', () => {
  let gs: GsUsb;

  beforeEach(() => {
    gs = new GsUsb();
  });

  afterEach(() => {
    gs.disconnect();
    gs.removeAllListeners();
  });

  // --- Connection lifecycle -----------------------------------------------

  it('connects and reports is_connected() === true', async () => {
    await gs.connect('COM_GS');
    expect(gs.is_connected()).toBe(true);
  });

  it('reports is_connected() === false before connect', () => {
    expect(gs.is_connected()).toBe(false);
  });

  it('disconnect clears connection state', async () => {
    await gs.connect('COM_GS');
    gs.disconnect();
    expect(gs.is_connected()).toBe(false);
  });

  it('throws on double connect', async () => {
    await gs.connect('COM_GS');
    await expect(gs.connect('COM_GS')).rejects.toThrow(/already connected/);
  });

  // --- COBS deframing (receive) -------------------------------------------

  it('emits "frame" with decoded payload when a complete COBS frame arrives', async () => {
    await gs.connect('COM_GS');

    const frames: Uint8Array[] = [];
    gs.on('frame', (f: Uint8Array) => frames.push(f));

    const port = (gs as any).port;

    // Encode payload [0x11, 0x22, 0x33] and append delimiter.
    const payload = new Uint8Array([0x11, 0x22, 0x33]);
    const encoded = cobs_encode(payload);
    const wire = new Uint8Array(encoded.length + 1);
    wire.set(encoded, 0);
    wire[encoded.length] = DELIM;

    port.emit('data', Buffer.from(wire));

    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0])).toEqual([0x11, 0x22, 0x33]);
  });

  it('handles frames with embedded zeros', async () => {
    await gs.connect('COM_GS');

    const frames: Uint8Array[] = [];
    gs.on('frame', (f: Uint8Array) => frames.push(f));

    const port = (gs as any).port;

    const payload = new Uint8Array([0x00, 0xaa, 0x00]);
    const encoded = cobs_encode(payload);
    const wire = new Uint8Array(encoded.length + 1);
    wire.set(encoded, 0);
    wire[encoded.length] = DELIM;

    port.emit('data', Buffer.from(wire));

    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0])).toEqual([0x00, 0xaa, 0x00]);
  });

  it('handles multiple frames in a single data event', async () => {
    await gs.connect('COM_GS');

    const frames: Uint8Array[] = [];
    gs.on('frame', (f: Uint8Array) => frames.push(f));

    const port = (gs as any).port;

    const p1 = new Uint8Array([0x01]);
    const e1 = cobs_encode(p1);
    const p2 = new Uint8Array([0x02, 0x03]);
    const e2 = cobs_encode(p2);

    const wire = new Uint8Array(e1.length + 1 + e2.length + 1);
    let offset = 0;
    wire.set(e1, offset);
    offset += e1.length;
    wire[offset++] = DELIM;
    wire.set(e2, offset);
    offset += e2.length;
    wire[offset++] = DELIM;

    port.emit('data', Buffer.from(wire));

    expect(frames).toHaveLength(2);
    expect(Array.from(frames[0])).toEqual([0x01]);
    expect(Array.from(frames[1])).toEqual([0x02, 0x03]);
  });

  it('handles a frame split across multiple data events', async () => {
    await gs.connect('COM_GS');

    const frames: Uint8Array[] = [];
    gs.on('frame', (f: Uint8Array) => frames.push(f));

    const port = (gs as any).port;

    const payload = new Uint8Array([0xde, 0xad, 0x00, 0xbe, 0xef]);
    const encoded = cobs_encode(payload);
    const wire = new Uint8Array(encoded.length + 1);
    wire.set(encoded, 0);
    wire[encoded.length] = DELIM;

    // Split at an arbitrary midpoint.
    const mid = Math.floor(wire.length / 2);
    port.emit('data', Buffer.from(wire.slice(0, mid)));
    expect(frames).toHaveLength(0); // Not yet complete.

    port.emit('data', Buffer.from(wire.slice(mid)));
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0])).toEqual([0xde, 0xad, 0x00, 0xbe, 0xef]);
  });

  it('discards partial frame on disconnect', async () => {
    await gs.connect('COM_GS');

    const frames: Uint8Array[] = [];
    gs.on('frame', (f: Uint8Array) => frames.push(f));

    const port = (gs as any).port;

    // Send partial encoded data without a delimiter.
    const payload = new Uint8Array([0x42, 0x43]);
    const encoded = cobs_encode(payload);
    port.emit('data', Buffer.from(encoded));

    // Disconnect before delimiter arrives.
    gs.disconnect();

    // Remove old listeners so we get a clean count after reconnect.
    gs.removeAllListeners();

    // Reconnect and send a complete frame to verify no leftover state.
    await gs.connect('COM_GS');
    gs.on('frame', (f: Uint8Array) => frames.push(f));

    const port2 = (gs as any).port;
    const p2 = new Uint8Array([0xff]);
    const e2 = cobs_encode(p2);
    const wire2 = new Uint8Array(e2.length + 1);
    wire2.set(e2, 0);
    wire2[e2.length] = DELIM;
    port2.emit('data', Buffer.from(wire2));

    // Should only have the second frame, not a corrupted first one.
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0])).toEqual([0xff]);
  });

  it('ignores back-to-back delimiters (empty frames)', async () => {
    await gs.connect('COM_GS');

    const frames: Uint8Array[] = [];
    const errors: Error[] = [];
    gs.on('frame', (f: Uint8Array) => frames.push(f));
    gs.on('error', (e: Error) => errors.push(e));

    const port = (gs as any).port;

    port.emit('data', Buffer.from([DELIM, DELIM, DELIM]));

    expect(frames).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it('emits "error" for malformed COBS frames', async () => {
    await gs.connect('COM_GS');

    const frames: Uint8Array[] = [];
    const errors: Error[] = [];
    gs.on('frame', (f: Uint8Array) => frames.push(f));
    gs.on('error', (e: Error) => errors.push(e));

    const port = (gs as any).port;

    // Malformed frame: code byte says 5 data bytes follow, but only 1 present.
    port.emit('data', Buffer.from([0x05, 0xaa, DELIM]));

    expect(frames).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/malformed/i);
  });

  // --- Send (COBS encoding) -----------------------------------------------

  it('sends COBS-encoded data with trailing 0x00 delimiter', async () => {
    await gs.connect('COM_GS');

    const port = (gs as any).port;

    const payload = new Uint8Array([0x11, 0x22, 0x33]);
    gs.send(payload);

    expect(port.written_buffers).toHaveLength(1);
    const sent = Array.from(port.written_buffers[0]);

    // Last byte must be the delimiter.
    expect(sent[sent.length - 1]).toBe(DELIM);

    // Everything before the delimiter should be valid COBS-encoded data.
    const encoded = cobs_encode(payload);
    expect(sent.slice(0, sent.length - 1)).toEqual(Array.from(encoded));
  });

  it('sends COBS-encoded data for payload with zeros', async () => {
    await gs.connect('COM_GS');

    const port = (gs as any).port;

    const payload = new Uint8Array([0x00, 0x00]);
    gs.send(payload);

    expect(port.written_buffers).toHaveLength(1);
    const sent = Array.from(port.written_buffers[0]);
    expect(sent[sent.length - 1]).toBe(DELIM);

    // The encoded portion should never contain 0x00 (except the trailing delimiter).
    for (let i = 0; i < sent.length - 1; i++) {
      expect(sent[i]).not.toBe(DELIM);
    }
  });

  it('throws on send when not connected', () => {
    expect(() => gs.send(new Uint8Array([0x01]))).toThrow(/not connected/);
  });

  // --- Error / Close events -----------------------------------------------

  it('emits "error" from the serial port', async () => {
    await gs.connect('COM_GS');

    const errors: Error[] = [];
    gs.on('error', (e: Error) => errors.push(e));

    const port = (gs as any).port;
    port.emit('error', new Error('port lost'));

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('port lost');
  });

  it('emits "close" when the serial port closes', async () => {
    await gs.connect('COM_GS');

    let closed = false;
    gs.on('close', () => {
      closed = true;
    });

    const port = (gs as any).port;
    port.emit('close');

    expect(closed).toBe(true);
  });
});
