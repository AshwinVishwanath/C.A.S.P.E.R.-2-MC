/**
 * EventLogPanel — wraps the existing EventLog component.
 *
 * Maintains a local ring-buffer (max 24 entries) that reacts to:
 *   - tel.state changes  → FSM transition event
 *   - tel.pyro[i].firing flips true → pyro fire event
 *
 * The EventLog component from src/renderer/components/EventLog.jsx expects:
 *   events: [{ flight_time_s, type, type_name?, data? }]
 *   theme: T
 */
import React, { useState, useEffect, useRef } from 'react';
import { useTheme, useTweaksValue } from '../../design/ThemeContext';
import { Cap, Pill, Btn, Panel } from '../../design/components';
import { EventLog } from '../../components/EventLog.jsx';
import { SPACE } from '../../design/tokens.js';

export default function EventLogPanel({ tel }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;

  const [events, setEvents] = useState([]);
  const prevStateRef = useRef(null);
  const prevFiringRef = useRef({});

  function push(ev) {
    setEvents((prev) => {
      const next = [...prev, { ...ev, id: Date.now() + Math.random() }];
      if (next.length > 24) next.shift();
      return next;
    });
  }

  // Watch FSM state transitions
  useEffect(() => {
    const state = tel.state;
    if (!state) return;
    if (prevStateRef.current !== null && prevStateRef.current !== state) {
      push({
        flight_time_s: (tel.t || 0) / 1000,
        type: 'state',
        type_name: 'STATE',
        data: `→ ${state}`,
      });
    }
    prevStateRef.current = state;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tel.state]);

  // Watch pyro firing flags
  useEffect(() => {
    if (!tel.pyro) return;
    tel.pyro.forEach((ch, i) => {
      const key = `ch${i}`;
      if (ch.firing && !prevFiringRef.current[key]) {
        push({
          flight_time_s: (tel.t || 0) / 1000,
          type: 'pyro',
          type_name: 'PYRO',
          data: `CH${i + 1} FIRED · ${ch.role || '—'}`,
        });
      }
      prevFiringRef.current[key] = ch.firing;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tel.pyro]);

  return (
    <Panel
      title="EVENT LOG"
      right={
        <div style={{ display: 'flex', gap: SPACE.s2, alignItems: 'center' }}>
          <Pill color={T.muted} size="sm">{events.length} events</Pill>
        </div>
      }
    >
      <EventLog events={events} theme={T} />
    </Panel>
  );
}
