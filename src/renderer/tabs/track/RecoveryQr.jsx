// RecoveryQr.jsx — QR code for the latest GPS fix's Google Maps link.
//
// Scan it with a phone (which has cell data, unlike the laptop at the
// launch site) and Maps opens centered on the rocket. Uses the vendored,
// zero-dependency encoder at src/renderer/vendor/qrcode-generator.js — no
// network fetch, works fully offline once bundled (see that file's header
// for provenance/license).
//
// Rendered to canvas (matching this app's other instrument widgets —
// Radar/Rocket3D in design/instruments.jsx — rather than inline SVG) in
// fixed black-on-white regardless of the active theme/scheme: a QR code's
// entire job is maximum contrast for a phone camera to decode outdoors,
// and that must not be compromised by whatever accent color or dark theme
// happens to be active.
import React, { useEffect, useRef } from 'react';
import qrcodeFactory from '../../vendor/qrcode-generator.js';
import { buildGoogleMapsUrl } from './recovery_geo.js';

const CELL_PX = 5;   // px per QR module at devicePixelRatio 1
const QUIET_MODULES = 4; // ISO/IEC 18004 minimum quiet-zone width

/**
 * Props:
 *   lat, lon — decimal degrees of the fix to encode
 *   disabled — true when there is no fix yet; renders an honest placeholder
 *              instead of a QR code that would silently point at 0,0
 */
export function RecoveryQr({ lat, lon, disabled, size = 160 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (disabled) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      canvas.style.width = size + 'px';
      canvas.style.height = size + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      return;
    }

    const url = buildGoogleMapsUrl(lat, lon);

    // typeNumber 0 = smallest version that fits the data; 'M' balances
    // scan robustness (15% error correction) against module density for
    // a URL of this length.
    const qr = qrcodeFactory(0, 'M');
    qr.addData(url);
    qr.make();

    const modules = qr.getModuleCount();
    const px = (modules + QUIET_MODULES * 2) * CELL_PX;

    canvas.width = px * dpr;
    canvas.height = px * dpr;
    canvas.style.width = px + 'px';
    canvas.style.height = px + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(
            (c + QUIET_MODULES) * CELL_PX,
            (r + QUIET_MODULES) * CELL_PX,
            CELL_PX,
            CELL_PX
          );
        }
      }
    }
  }, [lat, lon, disabled, size]);

  if (disabled) {
    return (
      <div style={{
        width: size, height: size,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', border: '1px dashed currentColor', opacity: 0.35,
        borderRadius: 4, fontSize: 10, padding: 8, boxSizing: 'border-box',
      }}>
        NO FIX — QR UNAVAILABLE
      </div>
    );
  }

  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="QR code linking to the rocket's last known position on Google Maps"
      style={{ display: 'block', borderRadius: 4 }}
    />
  );
}

export default RecoveryQr;
