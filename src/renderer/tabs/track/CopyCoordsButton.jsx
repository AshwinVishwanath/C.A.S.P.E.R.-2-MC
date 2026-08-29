// CopyCoordsButton.jsx — puts the latest GPS fix on the system clipboard
// as "lat, lon" (paste straight into Google Maps' search box), via the
// preload bridge (window.casper.copy_to_clipboard) -> IPC handler
// (CH_CLIPBOARD_WRITE in src/main/ipc/handlers.ts). contextIsolation is on,
// so there is no direct `electron` import here — same pattern as every
// other renderer -> main action in this app (see use_telemetry.jsx).
import React, { useCallback, useRef, useState } from 'react';
import { Btn } from '../../design/components.jsx';
import { formatCoordPair } from './recovery_geo.js';

/**
 * Props:
 *   lat, lon — decimal degrees of the fix to copy
 *   disabled — true when there is no fix yet (honest no-fix gate lives in
 *              the caller; this button just reflects it)
 */
export function CopyCoordsButton({ lat, lon, disabled, size = 'md' }) {
  // 'idle' | 'copied' | 'error'
  const [status, setStatus] = useState('idle');
  const resetTimer = useRef(null);

  const onClick = useCallback(() => {
    if (disabled || typeof window === 'undefined' || !window.casper) return;
    const text = formatCoordPair(lat, lon);
    window.casper.copy_to_clipboard(text).then(
      (result) => {
        const ok = !result || result.ok !== false; // tolerate a bare resolve
        setStatus(ok ? 'copied' : 'error');
      },
      () => setStatus('error')
    );
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setStatus('idle'), 1600);
  }, [lat, lon, disabled]);

  React.useEffect(() => () => clearTimeout(resetTimer.current), []);

  const label = status === 'copied' ? 'COPIED' : status === 'error' ? 'COPY FAILED' : 'COPY COORDINATES';
  const kind = status === 'copied' ? 'accent' : status === 'error' ? 'danger' : 'secondary';
  const icon = status === 'copied' ? 'check' : status === 'error' ? 'x' : 'copy';

  return (
    <Btn kind={kind} icon={icon} size={size} disabled={disabled} onClick={onClick} full>
      {label}
    </Btn>
  );
}

export default CopyCoordsButton;
