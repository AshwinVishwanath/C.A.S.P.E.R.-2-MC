import { useState, useEffect, useCallback } from 'react';

/**
 * useChannel -- selectable LoRa channel (CMD_CHANNEL / 0x87).
 *
 * A launch site has more than one telemetry system on it. This is the control
 * that moves the flight computer, and the ground station with it, off a
 * frequency somebody else is using.
 *
 * The renderer deliberately owns NONE of the protocol. It does not build the
 * channel list, does not compute frequencies, and does not drive the
 * SET -> retune -> COMMIT handshake -- all of that lives in the main process,
 * for two reasons:
 *
 *   1. The handshake has to finish inside the flight computer's 10 s revert
 *      deadline. It cannot wait on React state or a user.
 *   2. The channel table already exists in three repositories. Rebuilding it
 *      here would make a fourth, and this one would be the copy nobody checks.
 *
 * So the plan is fetched from main, and the only thing sent back is a number.
 *
 * Frequencies shown while a change is in flight come from the FLIGHT
 * COMPUTER's own ACK, never from a local lookup -- if the tables ever disagree
 * that shows up as a visibly wrong number rather than as a link that quietly
 * never comes up.
 *
 * @returns {object} { plan, state, request, busy, supported }
 */
export default function useChannel() {
  const api = typeof window !== 'undefined' ? window.casper : undefined;
  const supported =
    !!api && typeof api.cmd_channel === 'function' && typeof api.get_channel_plan === 'function';

  const [plan, setPlan] = useState([]);
  const [defaultChannel, setDefaultChannel] = useState(null);
  const [state, setState] = useState({
    phase: 'idle',
    target: null,
    previous: null,
    freq_hz: null,
    channel_count: null,
    error: null,
  });

  // The plan never changes at runtime -- it is compiled into the firmware and
  // mirrored in main -- so it is fetched exactly once.
  useEffect(() => {
    if (!supported) return undefined;
    let cancelled = false;
    api
      .get_channel_plan()
      .then((res) => {
        if (cancelled || !res) return;
        setPlan(Array.isArray(res.plan) ? res.plan : []);
        setDefaultChannel(typeof res.default_channel === 'number' ? res.default_channel : null);
      })
      .catch(() => {
        /* Leaving plan empty renders the control disabled, which is the
         * honest outcome: without a plan there is nothing safe to offer. */
      });
    return () => {
      cancelled = true;
    };
  }, [supported, api]);

  useEffect(() => {
    if (!supported || typeof api.on_channel_update !== 'function') return undefined;
    return api.on_channel_update((next) => {
      if (next && typeof next === 'object') setState(next);
    });
  }, [supported, api]);

  const request = useCallback(
    (channel) => {
      if (!supported) return;
      api.cmd_channel(channel);
    },
    [supported, api],
  );

  const busy =
    state.phase === 'staging' ||
    state.phase === 'retuning_ground_station' ||
    state.phase === 'committing';

  return { plan, defaultChannel, state, request, busy, supported };
}

/** Operator-facing wording for each phase. Kept next to the hook so the Setup
 *  and Flight tabs cannot describe the same state two different ways. */
export function phaseLabel(phase) {
  switch (phase) {
    case 'staging':
      return 'Asking the flight computer…';
    case 'retuning_ground_station':
      return 'Moving the ground station…';
    case 'committing':
      return 'Confirming on the new channel…';
    case 'committed':
      return 'Channel set';
    case 'failed':
      return 'Change abandoned';
    default:
      return '';
  }
}
