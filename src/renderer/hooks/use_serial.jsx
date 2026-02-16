import { useState, useEffect, useCallback } from 'react';

/**
 * useSerial -- hook for serial port management (FC + GS connections).
 *
 * Subscribes to:
 *   - window.casper.on_serial_ports()  -- available port list from scan
 *   - window.casper.on_telemetry()     -- fc_conn / gs_conn connection flags
 *
 * Provides helpers for scanning, connecting, and disconnecting both the
 * flight computer (FC) and ground station (GS) serial links.
 *
 * If window.casper is not available (dev mode outside Electron), returns a
 * static default state so the UI can still render.
 *
 * @returns {object} { ports, fc_connected, gs_connected, scan, connect_fc, connect_gs, disconnect_fc, disconnect_gs }
 */
export default function useSerial() {
  var [ports, setPorts] = useState([]);
  var [fcConnected, setFcConnected] = useState(false);
  var [gsConnected, setGsConnected] = useState(false);

  // Subscribe to serial port list updates
  useEffect(function () {
    if (typeof window === 'undefined' || !window.casper) return;

    var unsub = window.casper.on_serial_ports(function (portList) {
      if (Array.isArray(portList)) {
        setPorts(portList);
      }
    });

    return function () {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  // Subscribe to telemetry for connection status flags
  useEffect(function () {
    if (typeof window === 'undefined' || !window.casper) return;

    var unsub = window.casper.on_telemetry(function (snapshot) {
      if (!snapshot) return;
      setFcConnected(!!snapshot.fc_conn);
      setGsConnected(!!snapshot.gs_conn);
    });

    return function () {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  /** Trigger a serial port scan. Results arrive via on_serial_ports callback. */
  var scan = useCallback(function () {
    if (typeof window === 'undefined' || !window.casper) return;
    window.casper.scan_ports();
  }, []);

  /** Connect the flight computer on the given serial port. */
  var connect_fc = useCallback(function (port) {
    if (typeof window === 'undefined' || !window.casper) return;
    window.casper.connect_fc(port);
  }, []);

  /** Connect the ground station on the given serial port. */
  var connect_gs = useCallback(function (port) {
    if (typeof window === 'undefined' || !window.casper) return;
    window.casper.connect_gs(port);
  }, []);

  /** Disconnect the flight computer serial link. */
  var disconnect_fc = useCallback(function () {
    if (typeof window === 'undefined' || !window.casper) return;
    window.casper.disconnect_fc();
  }, []);

  /** Disconnect the ground station serial link. */
  var disconnect_gs = useCallback(function () {
    if (typeof window === 'undefined' || !window.casper) return;
    window.casper.disconnect_gs();
  }, []);

  return {
    ports: ports,
    fc_connected: fcConnected,
    gs_connected: gsConnected,
    scan: scan,
    connect_fc: connect_fc,
    connect_gs: connect_gs,
    disconnect_fc: disconnect_fc,
    disconnect_gs: disconnect_gs,
  };
}
