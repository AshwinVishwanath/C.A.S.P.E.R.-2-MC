import { useState, useEffect, useCallback } from 'react';

/**
 * useFlightLog -- hook for flight log download, export, and erase.
 *
 * Subscribes to:
 *   - window.casper.on_log_progress()  -- readout progress updates
 *
 * Provides helpers for downloading, exporting, and erasing flight logs.
 *
 * @returns {object} { progress, result, busy, download, erase, exportCsv }
 */
export default function useFlightLog() {
  var [progress, setProgress] = useState(null);
  var [result, setResult] = useState(null);
  var [busy, setBusy] = useState(false);

  // Subscribe to log progress updates from main process
  useEffect(function () {
    if (typeof window === 'undefined' || !window.casper) return;
    if (typeof window.casper.on_log_progress !== 'function') return;

    var unsub = window.casper.on_log_progress(function (p) {
      if (!p) return;
      setProgress(p);
      if (p.phase === 'done' || p.phase === 'error') {
        setBusy(false);
      }
    });

    return function () {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  /** Start downloading all flight log data from the FC. */
  var download = useCallback(function () {
    if (typeof window === 'undefined' || !window.casper) return;
    setBusy(true);
    setResult(null);
    setProgress({ phase: 'metadata', pct: 0, detail: 'Starting readout...' });

    window.casper.download_flight_log().then(function (data) {
      setResult(data);
      setBusy(false);
    }).catch(function (err) {
      setProgress({ phase: 'error', pct: 0, detail: 'Download failed', error: String(err) });
      setBusy(false);
    });
  }, []);

  /** Erase the flight log on the FC flash. */
  var erase = useCallback(function () {
    if (typeof window === 'undefined' || !window.casper) return;
    setBusy(true);
    setResult(null);
    window.casper.erase_flight_log();
  }, []);

  /** Export the last downloaded flight log as CSV. */
  var exportCsv = useCallback(function (type) {
    if (typeof window === 'undefined' || !window.casper) return;
    if (typeof window.casper.export_flight_log_csv !== 'function') return;
    window.casper.export_flight_log_csv(type || 'all');
  }, []);

  return {
    progress: progress,
    result: result,
    busy: busy,
    download: download,
    erase: erase,
    exportCsv: exportCsv
  };
}
