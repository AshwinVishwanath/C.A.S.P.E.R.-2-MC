import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useGpsDiag -- GPS RF diagnostics over the radio link (CMD_GPSDIAG / 0x86).
 *
 * Why this exists at all: the flight computer's GPS diagnostics live in
 * console commands that only exist in a CDC_STREAM==2 build, and the build
 * that flies is CDC_STREAM==1. The outdoor GPS test site is battery-powered
 * with no USB host, so the radio is the only way to reach these numbers where
 * the measurement actually has to be taken.
 *
 * Keeps the latest reading plus a short history, because the whole point is
 * comparison -- passive vs active antenna, low-gain vs bypass -- and a single
 * live value with nothing to compare it against answers no question.
 *
 * @returns {object} { latest, history, pending, request, clear, supported }
 */

/** Milliseconds before an unanswered request stops showing as pending. */
const REQUEST_TIMEOUT_MS = 4000;

export const GD_ACT_REPORT = 0;
export const GD_ACT_LNA_NORMAL = 1;
export const GD_ACT_LNA_LOW = 2;
export const GD_ACT_LNA_BYPASS = 3;

export const LNA_NAMES = ['normal', 'low-gain', 'bypass'];

/**
 * The three-way reading that makes these numbers useful. NAV-PVT alone cannot
 * distinguish them -- it reports only a finished solution, so it shows
 * fix0/sv0 right up to the epoch it shows fix3/svN.
 *
 * Returns { level, title, detail } where level is 'bad' | 'warn' | 'ok'.
 */
export function interpret(d) {
  if (!d) return null;

  if (!d.gps_alive) {
    return {
      level: 'bad',
      title: 'RECEIVER NOT RESPONDING',
      detail: 'The GPS did not acknowledge on I2C at boot. This is a bus or power fault, not an antenna one.',
    };
  }

  // A 3D fix outranks everything below it. The receiver having SOLVED is the
  // answer to the question this tab asks; a missing per-satellite breakdown is
  // a gap in the diagnostic, not a problem with the GPS. Ordering these the
  // other way round reported a working receiver as a warning.
  if (d.fix_type >= 3) {
    return {
      level: 'ok',
      title: '3D FIX',
      detail: d.sat_valid
        ? `Solved on ${d.num_sv} satellites, best carrier-to-noise ${d.cno_best} dB-Hz. The chain works.`
        : `Solved on ${d.num_sv} satellites. The per-satellite breakdown below is unavailable (no NAV-SAT reply), but a 3D fix is the stronger evidence and it is present.`,
    };
  }

  if (!d.sat_valid) {
    return {
      level: 'warn',
      title: 'NO SATELLITE DETAIL',
      detail: 'The receiver is alive and answered the RF poll, but not the NAV-SAT poll. Signal strength cannot be read — this is a gap in the instrument, not a measurement of zero.',
    };
  }

  if (d.tracked === 0) {
    return {
      level: 'bad',
      title: 'NOTHING TRACKED',
      detail: 'No satellite has any carrier-to-noise at all. Signal is not reaching the receiver: antenna, connector, bias or FEM.',
    };
  }

  // Reached only without a 3D fix — the fix case returned above.
  if (d.cno_best >= 35) {
    return {
      level: 'ok',
      title: 'SIGNAL HEALTHY · ACQUIRING',
      detail: 'Carrier-to-noise is good; the solution has simply not converged yet. This board has no GPS backup cell, so a power-up is a genuine cold start.',
    };
  }

  if (d.cno_best >= 30) {
    return {
      level: 'warn',
      title: 'MARGINAL SIGNAL',
      detail: 'Satellites are tracked but weak. Usable, with little margin -- check sky view before blaming the board.',
    };
  }

  return {
    level: 'warn',
    title: 'TRACKED BUT DESENSITISED',
    detail: 'Satellites are visible but carrier-to-noise is pinned low. This is the signature of the documented on-board interference problem: move the antenna away from the board and re-read.',
  };
}

export default function useGpsDiag() {
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [pending, setPending] = useState(false);
  const timer = useRef(null);

  const supported = typeof window !== 'undefined' &&
    !!window.casper && typeof window.casper.cmd_gpsdiag === 'function';

  useEffect(() => {
    if (typeof window === 'undefined' || !window.casper) return;
    if (typeof window.casper.on_gpsdiag_update !== 'function') return;

    const unsub = window.casper.on_gpsdiag_update((data) => {
      if (!data) return;
      const stamped = { ...data, received_at: Date.now() };
      setLatest(stamped);
      // Newest first, bounded -- this is a bench comparison aid, not a log.
      setHistory((h) => [stamped, ...h].slice(0, 12));
      setPending(false);
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /**
   * Send a CMD_GPSDIAG. `act` is GD_ACT_REPORT or one of the GD_ACT_LNA_*
   * modes; the LNA modes restart acquisition on the receiver and re-arm its
   * TTFF stopwatch, so the next TTFF belongs to the new mode.
   *
   * The uplink is lossy and single-shot -- there is no retry here on purpose.
   * A silent auto-retry would make a dead link look like a slow one, which is
   * exactly the confusion this whole panel exists to remove.
   */
  const request = useCallback((act) => {
    if (typeof window === 'undefined' || !window.casper) return;
    if (typeof window.casper.cmd_gpsdiag !== 'function') return;

    window.casper.cmd_gpsdiag(act);
    setPending(true);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setPending(false);
      timer.current = null;
    }, REQUEST_TIMEOUT_MS);
  }, []);

  const clear = useCallback(() => {
    setHistory([]);
    setLatest(null);
  }, []);

  return { latest, history, pending, request, clear, supported };
}
