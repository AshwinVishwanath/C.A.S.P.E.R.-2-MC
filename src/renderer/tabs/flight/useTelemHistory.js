import { useRef, useState, useEffect } from 'react';

/**
 * useTelemHistory — ring-buffer any scalar value from telemetry.
 *
 * Each time `value` changes the new value is appended.  When `depth` is
 * exceeded the oldest entry is dropped from the front.
 *
 * Returns an array of numbers of length ≤ depth.
 *
 * @param {number} value   - Scalar field to track (e.g. tel.alt)
 * @param {number} depth   - Maximum buffer size (default 200)
 */
export default function useTelemHistory(value, depth = 200) {
  // We keep the ring in a ref to avoid triggering re-renders on every push.
  // A parallel state is toggled to force re-renders only after push.
  const bufRef = useRef([]);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (value === undefined || value === null || isNaN(value)) return;
    const buf = bufRef.current;
    buf.push(value);
    if (buf.length > depth) {
      buf.shift();
    }
    forceUpdate((n) => n + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return bufRef.current.slice();
}
