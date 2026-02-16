import { useState, useEffect, useCallback } from 'react';

/**
 * Default diagnostic test definitions.
 * Matches the exact shape returned by the existing useDiag() in App.jsx.
 */
function makeDefaultTests() {
  return [
    { id: 'imu',   label: 'IMU (LSM6DSO32)', detail: '833Hz',       status: 'idle' },
    { id: 'mag',   label: 'Magnetometer',     detail: '10Hz',        status: 'idle' },
    { id: 'baro',  label: 'Barometer',         detail: '50Hz',        status: 'idle' },
    { id: 'ekf',   label: 'EKF Init',          detail: '4-state',     status: 'idle' },
    { id: 'att',   label: 'Attitude',           detail: 'Comp filter', status: 'idle' },
    { id: 'flash', label: 'Flash',              detail: 'Memory',      status: 'idle' },
    { id: 'cfg',   label: 'Config',             detail: 'Hash',        status: 'idle' },
  ];
}

/**
 * useDiagnostics -- drop-in replacement for useDiag().
 *
 * Returns the same { tests, runAll, reset } shape that App.jsx consumes.
 *
 * When window.casper is available:
 *   - runAll() sends a casper:run-diagnostics IPC message via the preload
 *     bridge, which triggers the FC self-test sequence.
 *   - Results arrive asynchronously through window.casper.on_diag_result().
 *     Each result object is expected to carry at minimum an `id` field matching
 *     one of the test IDs and a `status` field ("pass" | "fail").
 *
 * When window.casper is NOT available (dev mode outside Electron), runAll()
 * is a no-op and the tests remain in their idle state.
 *
 * @returns {object} { tests, runAll, reset }
 */
export default function useDiagnostics() {
  var [tests, setTests] = useState(makeDefaultTests);

  // Subscribe to diagnostic result events from the main process
  useEffect(function () {
    if (typeof window === 'undefined' || !window.casper) return;

    var unsub = window.casper.on_diag_result(function (results) {
      if (!results) return;

      // results can be a single object or an array of result objects.
      // Each result: { id: string, status: "pass"|"fail", detail?: string }
      var list = Array.isArray(results) ? results : [results];

      setTests(function (prev) {
        return prev.map(function (t) {
          // Find a matching result for this test
          var match = null;
          for (var i = 0; i < list.length; i++) {
            if (list[i] && list[i].id === t.id) {
              match = list[i];
              break;
            }
          }
          if (match) {
            return {
              ...t,
              status: match.status || 'fail',
              detail: match.detail != null ? match.detail : t.detail,
            };
          }
          return t;
        });
      });
    });

    return function () {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  /**
   * Start the full diagnostic suite.
   * Sets all tests to "running" immediately, then waits for results from
   * the FC via on_diag_result.
   */
  var runAll = useCallback(function () {
    if (typeof window === 'undefined' || !window.casper) return;

    // Mark every test as running
    setTests(function (prev) {
      return prev.map(function (t) {
        return { ...t, status: 'running' };
      });
    });

    window.casper.run_diagnostics();
  }, []);

  /**
   * Reset all test statuses back to idle.
   */
  var reset = useCallback(function () {
    setTests(makeDefaultTests());
  }, []);

  return { tests: tests, runAll: runAll, reset: reset };
}
