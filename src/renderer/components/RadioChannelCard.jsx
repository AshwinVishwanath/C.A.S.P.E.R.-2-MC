import React, { useState, useEffect } from 'react';
import { useTheme } from '../design/ThemeContext';
import { Cap, Btn, Panel } from '../design/components';
import { FONT, SPACE, RADIUS } from '../design/tokens.js';
import useChannel, { phaseLabel } from '../hooks/use_channel.jsx';

/**
 * RadioChannelCard -- pick the LoRa channel the link runs on.
 *
 * The control is deliberately a dropdown plus an explicit Apply, not a
 * dropdown that acts on change. Selecting a channel is a decision; applying it
 * briefly drops the link to the vehicle while both ends retune, and that is
 * not something an operator should be able to do by mis-scrolling a list.
 *
 * While a change is in flight the whole control is disabled. The handshake has
 * a deadline in the firmware, and letting someone start a second change inside
 * the first is how you end up with a ground station and a vehicle on different
 * frequencies with nobody sure which.
 */
export default function RadioChannelCard({ gsChannel, imageCalOk = true }) {
  // useTheme() returns the theme OBJECT, not a wrapper around it. Destructuring
  // `{ T }` here silently produced undefined, and the first T.accent below threw
  // -- which in React unmounts the whole tree, so the Setup tab rendered black
  // with no way back. Every other tab does it this way; match them.
  const T = useTheme();
  const { plan, defaultChannel, state, request, busy, supported } = useChannel();
  const [selected, setSelected] = useState(null);

  // Follow the ground station until the operator touches the control, so the
  // dropdown opens showing where the link actually is rather than a guess.
  useEffect(() => {
    if (selected !== null) return;
    if (typeof gsChannel === 'number' && gsChannel > 0) setSelected(gsChannel);
    else if (typeof defaultChannel === 'number') setSelected(defaultChannel);
  }, [gsChannel, defaultChannel, selected]);

  const live = typeof gsChannel === 'number' && gsChannel > 0 ? gsChannel : null;
  const entry = plan.find((p) => p.channel === live) || null;

  const statusColor =
    state.phase === 'failed' ? T.danger : state.phase === 'committed' ? T.accent : T.muted;

  const mono = { fontFamily: FONT.mono, fontSize: 11 };

  return (
    <Panel>
      <div style={{ padding: SPACE.s4 }}>
        <Cap color={T.accent}>RADIO · CHANNEL</Cap>

        <div
          style={{
            fontFamily: FONT.sans,
            fontSize: 12,
            color: T.muted,
            margin: '6px 0 12px 0',
            maxWidth: 640,
          }}
        >
          Move the link off a frequency something else at the site is using. The
          flight computer acknowledges, both ends retune, and the change is only
          kept once a packet gets through on the new channel — if it does not,
          everything returns to where it was on its own.
        </div>

        {/* Where the link is now, from the ground station's own report. */}
        <div style={{ display: 'flex', gap: SPACE.s4, alignItems: 'baseline', marginBottom: SPACE.s3 }}>
          <span style={{ ...mono, color: T.muted }}>NOW</span>
          <span style={{ ...mono, color: T.strong, fontSize: 14 }}>
            {live ? `CH ${live}` : '—'}
          </span>
          <span style={{ ...mono, color: T.muted }}>{entry ? entry.label : 'no ground station'}</span>
          {entry ? (
            <span style={{ ...mono, color: T.muted }}>{entry.band}</span>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: SPACE.s2, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selected ?? ''}
            disabled={!supported || busy || plan.length === 0}
            onChange={(e) => setSelected(Number(e.target.value))}
            style={{
              fontFamily: FONT.mono,
              fontSize: 12,
              padding: '6px 8px',
              borderRadius: RADIUS.r2,
              background: T.panel,
              color: T.strong,
              border: `1px solid ${T.line}`,
              minWidth: 220,
            }}
          >
            {plan.length === 0 ? <option value="">no channel plan</option> : null}
            {plan.map((p) => (
              <option key={p.channel} value={p.channel}>
                {`CH ${String(p.channel).padStart(2, ' ')} · ${p.label} · ${p.band}`}
              </option>
            ))}
          </select>

          <Btn
            kind="primary"
            disabled={!supported || busy || selected === null || selected === live}
            onClick={() => request(selected)}
          >
            {busy ? 'Applying…' : 'Apply'}
          </Btn>

          {state.phase !== 'idle' ? (
            <span style={{ ...mono, color: statusColor }}>{phaseLabel(state.phase)}</span>
          ) : null}
        </div>

        {/* The frequency the FC actually tuned, straight from its ACK. Shown
            rather than a locally computed one on purpose: a channel-table
            disagreement becomes a visibly wrong number here instead of a link
            that silently never comes up. */}
        {state.freq_hz ? (
          <div style={{ ...mono, color: T.muted, marginTop: SPACE.s2 }}>
            flight computer reports {(state.freq_hz / 1e6).toFixed(3)} MHz
          </div>
        ) : null}

        {state.error ? (
          <div style={{ ...mono, color: T.danger, marginTop: SPACE.s2, maxWidth: 640 }}>
            {state.error}
          </div>
        ) : null}

        {imageCalOk === false ? (
          <div style={{ ...mono, color: T.warn, marginTop: SPACE.s2, maxWidth: 640 }}>
            Ground station image calibration did not complete after the band
            change — it is receiving on the other band&apos;s trim and will not
            reach as far as usual. Power-cycling the ground station re-runs it.
          </div>
        ) : null}

        {!supported ? (
          <div style={{ ...mono, color: T.warn, marginTop: SPACE.s2 }}>
            Channel control unavailable — this build of the bridge does not expose it.
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
