// use_flight_sim.jsx — App-level OpenRocket simulation clock.
// ---------------------------------------------------------------------------
// Owns the loaded flight profile plus a play/pause/seek/speed clock, and
// fans each playback sample out to two consumers:
//   1. The telemetry store (via window.casper.sim_push) so the live dashboard
//      animates exactly as if a flight computer were streaming.
//   2. The Pyro Logic Designer (via the returned `sample`/`profile`), so the
//      node graph being edited evaluates against the same flight.
// Living at the App level means playback survives tab switches.
// ---------------------------------------------------------------------------

import { useState, useRef, useEffect, useCallback } from 'react';
import { sampleProfile } from '../pyro/evaluator.js';

// Throttle store pushes so a 60 fps clock does not flood IPC (~33 Hz is plenty).
const PUSH_INTERVAL_MS = 30;

export default function useFlightSim() {
  const [profile, setProfile] = useState(null); // { samples, duration_s, apogee_m } | null
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [simT, setSimT] = useState(0);

  const lastPushRef = useRef(0);

  const duration = profile ? profile.duration_s : 0;
  const sample = profile ? sampleProfile(simT, profile.samples) : null;

  // -- Playback clock -------------------------------------------------------
  useEffect(() => {
    if (!playing || !profile) return undefined;
    const end = profile.duration_s;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setSimT((t) => {
        const nt = t + dt * speed;
        if (nt >= end) {
          setPlaying(false);
          return end;
        }
        return nt;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, profile, speed]);

  // -- Push samples to the store (throttled while playing, always on scrub) --
  useEffect(() => {
    if (!profile || !sample) return;
    const api = typeof window !== 'undefined' ? window.casper : null;
    if (!api || typeof api.sim_push !== 'function') return;
    const now = performance.now();
    if (playing && now - lastPushRef.current < PUSH_INTERVAL_MS) return;
    lastPushRef.current = now;
    try { api.sim_push(sample); } catch { /* bridge missing */ }
  }, [sample, profile, playing]);

  // -- Controls -------------------------------------------------------------
  const load = useCallback(async () => {
    const api = typeof window !== 'undefined' ? window.casper : null;
    if (!api || typeof api.sim_load !== 'function') {
      setError('Bridge missing: window.casper.sim_load not available');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.sim_load();
      if (res && res.canceled) { setLoading(false); return; }
      if (res && res.ok && res.profile) {
        setProfile(res.profile);
        setFilename(res.filename || '');
        setSimT(0);
        setPlaying(false);
        try { api.sim_active(true); } catch { /* no-op */ }
      } else {
        setError((res && res.error) || 'Failed to load flight file');
      }
    } catch (e) {
      setError(String((e && e.message) || e));
    }
    setLoading(false);
  }, []);

  const unload = useCallback(() => {
    setProfile(null);
    setFilename('');
    setError('');
    setSimT(0);
    setPlaying(false);
    const api = typeof window !== 'undefined' ? window.casper : null;
    try { if (api) api.sim_active(false); } catch { /* no-op */ }
  }, []);

  const play = useCallback(() => {
    if (!profile) return;
    setSimT((t) => (t >= profile.duration_s ? 0 : t));
    setPlaying(true);
  }, [profile]);

  const pause = useCallback(() => setPlaying(false), []);

  const restart = useCallback(() => {
    setSimT(0);
    setPlaying(false);
  }, []);

  const seek = useCallback((t) => {
    setPlaying(false);
    setSimT(() => {
      const max = profile ? profile.duration_s : 0;
      return Math.max(0, Math.min(max, t));
    });
  }, [profile]);

  return {
    profile,
    filename,
    error,
    loading,
    playing,
    speed,
    setSpeed,
    simT,
    duration,
    sample,
    load,
    unload,
    play,
    pause,
    restart,
    seek,
  };
}
