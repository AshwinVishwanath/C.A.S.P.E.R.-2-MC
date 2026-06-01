/**
 * AttitudePanel — ATTITUDE · QUATERNION panel.
 *
 * Layout: 75% height Rocket3D, 25% height RPYGraph.
 * RPYGraph receives the last 200 {roll, pitch, yaw} samples in degrees.
 * The history ring-buffer is maintained internally via a ref.
 */
import React, { useRef, useEffect, useState } from 'react';
import { useTheme, useTweaksValue } from '../../design/ThemeContext';
import { Panel } from '../../design/components';
import { Rocket3D, RPYGraph } from '../../design/instruments';
import { SPACE } from '../../design/tokens.js';

const RPY_DEPTH = 200;

export default function AttitudePanel({ tel }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const motion = tweaks.motion;

  // Ring buffer for RPY history — {roll, pitch, yaw} in degrees
  const rpyBufRef = useRef([]);
  const [rpyHistory, setRpyHistory] = useState([]);

  // Accumulate one RPY sample per telemetry update. Keyed on flight time (tel.t)
  // — which advances on every packet / sim tick — so history fills even when the
  // attitude is momentarily constant (e.g. a perfectly vertical ascent). Keying
  // only on roll/pitch/yaw would leave the graph stuck on "AWAITING DATA" for an
  // unchanging attitude.
  useEffect(() => {
    const buf = rpyBufRef.current;
    buf.push({
      roll:  tel.roll  || 0,
      pitch: tel.pitch || 0,
      yaw:   tel.yaw   || 0,
    });
    if (buf.length > RPY_DEPTH) buf.shift();
    setRpyHistory(buf.slice());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tel.t, tel.roll, tel.pitch, tel.yaw]);

  return (
    <Panel title="ATTITUDE · QUATERNION" padded={false}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 540 }}>
        {/* 75% - 3D rocket */}
        <div style={{
          flex: '0 0 75%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: SPACE.s2,
          minHeight: 0,
        }}>
          <Rocket3D
            size={300}
            quat={tel.quat || [1, 0, 0, 0]}
            motion={motion}
            scheme={scheme}
          />
        </div>

        {/* 25% - RPY traces */}
        <div style={{
          flex: '0 0 25%',
          borderTop: `1px solid ${T.border}`,
          padding: SPACE.s3,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          overflow: 'hidden',
        }}>
          <RPYGraph
            data={rpyHistory}
            h={100}
            motion={motion}
          />
        </div>
      </div>
    </Panel>
  );
}
