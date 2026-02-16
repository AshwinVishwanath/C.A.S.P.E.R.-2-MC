/**
 * USB serial port scanner.
 *
 * Enumerates available USB serial ports using the `serialport` package
 * and returns structured metadata for each one.
 */

import { SerialPort } from 'serialport';

/** Metadata for a single USB serial port. */
export interface PortInfo {
  /** OS device path (e.g., COM3 on Windows, /dev/ttyUSB0 on Linux). */
  path: string;

  /** USB Vendor ID (hex string, e.g., "2341"). */
  vid?: string;

  /** USB Product ID (hex string, e.g., "0043"). */
  pid?: string;

  /** Manufacturer string reported by the USB device. */
  manufacturer?: string;

  /** Human-readable label combining manufacturer and path. */
  label?: string;
}

/**
 * List all available USB serial ports.
 *
 * @returns Array of {@link PortInfo} objects for every detected port.
 */
export async function scan_ports(): Promise<PortInfo[]> {
  try {
    const raw_ports = await SerialPort.list();

    return raw_ports.map((p) => {
      const vid = p.vendorId ?? undefined;
      const pid = p.productId ?? undefined;
      const manufacturer = p.manufacturer ?? undefined;

      const label_parts: string[] = [];
      if (manufacturer) {
        label_parts.push(manufacturer);
      }
      label_parts.push(p.path);
      const label = label_parts.join(' — ');

      return {
        path: p.path,
        vid,
        pid,
        manufacturer,
        label
      };
    });
  } catch (err) {
    // If enumeration fails (e.g., permission error), return empty list
    // rather than crashing.
    return [];
  }
}
