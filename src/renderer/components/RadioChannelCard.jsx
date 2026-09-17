import React, { useState, useEffect } from 'react';
import { useTheme } from '../design/ThemeContext';
import { Cap, Btn, Panel, SegToggle } from '../design/components';
import { FONT, SPACE, RADIUS } from '../design/tokens.js';
import useChannel, { phaseLabel } from '../hooks/use_channel.jsx';

/**
 * RadioChannelCard -- pick the LoRa channel the link runs on.
 *
 * The control is deliberately a band toggle plus a dropdown plus an explicit
 * Apply, not a dropdown that acts on change. Selecting a channel is a decision;
 * applying it briefly drops the link to the vehicle while both ends retune, and
 * that is not something an operator should be able to do by mis-scrolling a
 * list.
 *
 * While a change is in flight the whole control is disabled. The handshake has
 * a deadline in the firmware, and letting someone start a second change inside
 * the first is how you end up with a ground station and a vehicle on different
 * frequencies with nobody sure which.
 */
export default function RadioChannelCard({ gsChannel, imageCalOk = true, connected = true }) {
  // useTheme() returns the theme OBJECT, not a wrapper around it. Destructuring
  // `{ T }` here silently produced undefined, and the first T.accent below threw
  // -- which in React unmounts the whole tree, so the Setup tab rendered black
  // with no way back. Every other tab does it this way; match them.
  const T = useTheme();
  const { plan, defaultChannel, state, request, busy, supported } = useChannel();
  const [selected, setSelected] = useState(null);
  const [band, setBand] = useState(null);

  // Follow the ground station until the operator touches the control, so the
  // dropdown opens showing where the link actually is rather than a guess.
  useEffect(() => {
    if (selected !== null) return;
    if (typeof gsChannel === 'number' && gsChannel > 0) setSelected(gsChannel);
    else if (typeof defaultChannel === 'number') setSelected(defaultChannel);
  }, [gsChannel, defaultChannel, selected]);

  // The band follows whatever channel is selected until the operator moves it
  // themselves, so opening the card on a US channel shows the US list.
  useEffect(() => {
    if (band !== null || selected === null || plan.length === 0) return;
    const e = plan.find((p) => p.channel === selected);
    if (e) setBand(e.band);
  }, [band, selected, plan]);

  const activeBand = band || 'EU';
  const bandPlan = plan.filter((p) => p.band === activeBand);

  /**
   * Switching band must move the selection with it. The channels are one flat
   * index across both bands, so a US selection is simply absent from the EU
   * list -- leaving it would show an empty-valued <select> whose Apply button
   * would then send a channel the operator cannot see.
   */
  const onBand = (next) => {
    if (next === activeBand) return;
    setBand(next);
    const inNext = plan.filter((p) => p.band === next);
    if (inNext.length === 0) return;
    // Prefer the channel the link is actually on, if it belongs to this band.
    const liveHere = inNext.find((p) => p.channel === gsChannel);
    // Otherwise the band's own default: 868.0 in EU, 915.0 in US.
    const preferred = next === 'US' ? 26 : 10;
    const def = inNext.find((p) => p.channel === preferred);
    setSelected((liveHere || def || inNext[0]).channel);
  };

  const live = typeof gsChannel === 'number' && gsChannel > 0 ? gsChannel : null;
  const entry = plan.find((p) => p.channel === live) || null;

  const statusColor =
    state.phase === 'failed' ? T.danger : state.phase === 'committed' ? T.accent : T.muted;

  const mono = { fontFamily: FONT.mono, fontSize: 11 };
  // `connected` gates Apply, not the whole control: browsing the plan with
  // nothing plugged in is useful, but SENDING with nothing plugged in is not.
  // Without this the command goes nowhere, ChannelMachine stages it anyway,
  // and three seconds later the operator is told 'the flight computer did
  // not answer' -- which blames the FC for a cable that was never connected.
  const disabled = !supported || busy || plan.length === 0;

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
          {/* Band first: it decides which channels the dropdown can even offer,
              and it is a regulatory choice about where you are standing, not a
              preference. The firmware will tune either; the ANTENNA is the real
              constraint (see flight/radio/radio_channel.h). */}
          <SegToggle
            T={T}
            value={activeBand}
            onChange={onBand}
            size="sm"
            options={[
              { id: 'EU', label: 'EU 868' },
              { id: 'US', label: 'US 915' },
            ]}
          />

          <select
            value={selected ?? ''}
            disabled={disabled}
            onChange={(e) => setSelected(Number(e.target.value))}
            style={{
              fontFamily: FONT.mono,
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 10px',
              borderRadius: RADIUS.sm,
              // bgEl/border/strong, NOT panel/line -- those two token names do
              // not exist. They read as undefined, which is not an error: the
              // browser simply falls back to its own styling, and the control
              // rendered as white-on-white in dark mode. An invented token name
              // fails silently, which is why render_smoke.test.js now asserts
              // every token these components use is real.
              background: T.bgEl,
              color: T.strong,
              border: `1px solid ${T.border}`,
              outline: 'none',
              cursor: disabled ? 'default' : 'pointer',
              minWidth: 230,
            }}
          >
            {bandPlan.length === 0 ? <option value="">no channel plan</option> : null}
            {bandPlan.map((p) => (
              // The <option> list is painted by the OS, not by the parent
              // <select>, so it inherits NOTHING from the styles above. Without
              // these two properties the popup is the platform default -- black
              // text on white -- which is unreadable next to a dark UI and was
              // exactly the reported symptom.
              <option
                key={p.channel}
                value={p.channel}
                style={{ background: T.bgPanel, color: T.strong }}
              >
                {`CH ${String(p.channel).padStart(2, '0')} · ${p.label}`}
              </option>
            ))}
          </select>

          <Btn
            kind="primary"
            disabled={disabled || !connected || selected === null || selected === live}
            onClick={() => request(selected)}
          >
            {busy ? 'Applying…' : 'Apply'}
          </Btn>

          {state.phase !== 'idle' ? (
            <span style={{ ...mono, color: statusColor }}>{phaseLabel(state.phase)}</span>
          ) : !connected ? (
            <span style={{ ...mono, color: T.muted }}>connect a link to apply</span>
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

        {/* Changing band is a decision about the antenna, not just the radio.
            The SX1262 will happily drive +22 dBm into a whip cut for the other
            band; the firmware cannot check what is fitted and does not pretend
            to. Say so where the choice is actually made. */}
        {entry && activeBand !== entry.band ? (
          <div style={{ ...mono, color: T.warn, marginTop: SPACE.s2, maxWidth: 640 }}>
            {`This moves the link from ${entry.band} to ${activeBand}. Fit antennas for
              ${activeBand} on both ends first — transmitting at full power into an
              antenna cut for the other band stresses the amplifier.`}
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
