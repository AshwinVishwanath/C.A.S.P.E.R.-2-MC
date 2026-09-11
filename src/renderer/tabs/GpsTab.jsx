/**
 * GpsTab — GPS RF diagnostics over the radio link.
 *
 * The flight computer's GPS diagnostics (gpsrf / gpssat / gpsttff / gpslna)
 * are console commands in a CDC_STREAM==2 build; the build that flies is
 * CDC_STREAM==1. The outdoor test site is battery-powered with no USB host,
 * so this tab is the only way to reach those numbers where the measurement
 * has to be taken.
 *
 * Presents three things, in the order an operator needs them:
 *   1. A verdict — which of the three indistinguishable-from-NAV-PVT cases
 *      this reading actually is.
 *   2. The numbers behind that verdict.
 *   3. A history, because the point is comparison: passive vs active antenna,
 *      low-gain vs bypass. A single live value answers no question.
 */
import React from 'react';
import { useTheme } from '../design/ThemeContext';
import { Cap, Pill, Btn, Panel, Dot } from '../design/components';
import { FONT, SPACE, RADIUS } from '../design/tokens.js';
import useGpsDiag, {
  interpret,
  LNA_NAMES,
  GD_ACT_REPORT,
  GD_ACT_LNA_NORMAL,
  GD_ACT_LNA_LOW,
  GD_ACT_LNA_BYPASS,
} from '../hooks/use_gpsdiag.jsx';

const FIX_NAMES = { 0: 'NO FIX', 1: 'DEAD RECKONING', 2: '2D FIX', 3: '3D FIX' };
const ANT_POWER_NAMES = { 0: 'OFF', 1: 'ON', 2: "DON'T KNOW" };

/** One labelled number. */
function Metric({ label, value, unit, hint, color }) {
  const T = useTheme();
  return (
    <div style={{
      padding: SPACE.s3,
      background: T.bgEl,
      border: `1px solid ${T.border}`,
      borderRadius: RADIUS.md,
      minWidth: 0,
    }}>
      <Cap color={T.muted}>{label}</Cap>
      <div style={{
        fontFamily: FONT.mono,
        fontSize: 24,
        fontWeight: 700,
        color: color || T.strong,
        lineHeight: 1.15,
        marginTop: SPACE.s1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {value}
        {unit ? (
          <span style={{ fontSize: 12, color: T.muted, marginLeft: 4 }}>{unit}</span>
        ) : null}
      </div>
      {hint ? (
        <div style={{
          fontFamily: FONT.sans, fontSize: 10, color: T.muted, marginTop: 2,
        }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export default function GpsTab() {
  const T = useTheme();
  const { latest, history, pending, request, clear, supported } = useGpsDiag();
  const verdict = interpret(latest);

  const levelColor = verdict
    ? (verdict.level === 'ok' ? T.success : verdict.level === 'bad' ? T.danger : T.warn)
    : T.muted;

  // C/N0 drives the colour because it is the number that separates a working
  // RF chain from a desensitised one; everything else is context for it.
  const cnoColor = !latest ? T.strong
    : latest.cno_best >= 35 ? T.success
    : latest.cno_best >= 30 ? T.warn
    : T.danger;

  /**
   * Render a NAV-SAT-derived number, or an em-dash when the NAV-SAT poll did
   * not answer.
   *
   * This matters more than it looks. The firmware zeroes these fields when the
   * poll fails, and rendering that zero says "0 satellites tracked, 0 dB-Hz"
   * — which is the signature of a DEAD ANTENNA, the single most alarming
   * reading this panel can show, and flatly wrong when the receiver is in
   * fact holding a 3D fix. Never print a measurement that was not made.
   */
  /**
   * A TTFF under a second is not an acquisition — it means the receiver was
   * ALREADY holding a 3D fix when max_m10m_init() finished and the stopwatch
   * started, so the first NAV-PVT after init already said fix3.
   *
   * Reporting that as "0.0 s to first fix" would be a fiction, and a
   * flattering one. It is still worth seeing: it is evidence that the
   * receiver's battery-backed RAM survived the reset, which is what removing
   * the inherited every-boot factory reset (8b41b6d) was supposed to buy.
   * A real cold-start TTFF needs a genuine power-cycle.
   */
  const preFixed = !!latest && latest.ttff_valid && latest.ttff_s < 1.0;

  const sat = (v) => (latest && latest.sat_valid ? v : '—');
  const rf = (v) => (latest && latest.rf_valid ? v : '—');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.s4 }}>

      <Panel
        title="GPS RF DIAGNOSTICS · CMD_GPSDIAG"
        right={
          <Pill dot color={pending ? T.warn : latest ? T.success : T.muted} size="sm">
            {pending ? 'AWAITING REPLY' : latest ? 'REPLY RECEIVED' : 'IDLE'}
          </Pill>
        }
      >
        {!supported ? (
          <div style={{
            fontFamily: FONT.sans, fontSize: 12, color: T.warn,
            padding: SPACE.s3, background: T.bgEl,
            border: `1px solid ${T.border}`, borderRadius: RADIUS.md,
          }}>
            This build of the preload bridge does not expose <code>cmd_gpsdiag</code>.
            Rebuild Mission Control to use this tab.
          </div>
        ) : null}

        <div style={{
          fontFamily: FONT.sans, fontSize: 12, color: T.muted,
          marginBottom: SPACE.s3, lineHeight: 1.5,
        }}>
          Sent over the ground station when one is connected, falling back to
          direct FC USB. The flight computer refuses these off the ground —
          servicing one runs blocking receiver polls totalling up to ~2&nbsp;s.
        </div>

        <div style={{ display: 'flex', gap: SPACE.s2, flexWrap: 'wrap' }}>
          <Btn kind="primary" icon="satellite" disabled={!supported}
               onClick={() => request(GD_ACT_REPORT)}>
            READ
          </Btn>
          <div style={{ width: SPACE.s4 }} />
          <Btn kind="secondary" size="sm" disabled={!supported}
               onClick={() => request(GD_ACT_LNA_NORMAL)}>
            LNA NORMAL
          </Btn>
          <Btn kind="secondary" size="sm" disabled={!supported}
               onClick={() => request(GD_ACT_LNA_LOW)}>
            LNA LOW-GAIN
          </Btn>
          <Btn kind="secondary" size="sm" disabled={!supported}
               onClick={() => request(GD_ACT_LNA_BYPASS)}>
            LNA BYPASS
          </Btn>
        </div>

        <div style={{
          fontFamily: FONT.sans, fontSize: 11, color: T.muted,
          marginTop: SPACE.s3, lineHeight: 1.5,
        }}>
          The right LNA mode is a property of the antenna fitted, not of the
          board: a passive antenna into the ~16&nbsp;dB front-end wants
          <strong> low-gain</strong>; an active antenna (~30&nbsp;dB) into that
          same front-end is ~46&nbsp;dB total and wants <strong>bypass</strong>.
          Changing it restarts acquisition and re-arms the TTFF stopwatch, so
          the next time-to-fix belongs to the new mode.
        </div>
      </Panel>

      {verdict ? (
        <Panel title="VERDICT" accentColor>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: SPACE.s3 }}>
            <div style={{ paddingTop: 4 }}>
              <Dot color={levelColor} size={12} pulse={verdict.level === 'bad'} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: FONT.cond, fontSize: 20, fontWeight: 700,
                color: levelColor, letterSpacing: 0.5, textTransform: 'uppercase',
              }}>
                {verdict.title}
              </div>
              <div style={{
                fontFamily: FONT.sans, fontSize: 12, color: T.text,
                marginTop: SPACE.s1, lineHeight: 1.55,
              }}>
                {verdict.detail}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}

      {latest ? (
        <>
          <Panel title="SIGNAL">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: SPACE.s3,
            }}>
              <Metric label="BEST C/N0" value={sat(latest.cno_best)}
                      unit={latest.sat_valid ? 'dB-Hz' : undefined}
                      color={latest.sat_valid ? cnoColor : T.muted}
                      hint="35+ is healthy" />
              <Metric label="MEAN C/N0" value={sat(latest.cno_mean)}
                      unit={latest.sat_valid ? 'dB-Hz' : undefined}
                      color={latest.sat_valid ? undefined : T.muted} />
              <Metric label="TRACKED" value={sat(latest.tracked)}
                      color={latest.sat_valid ? undefined : T.muted}
                      hint="satellites with signal" />
              <Metric label="USED" value={sat(latest.used)}
                      color={latest.sat_valid ? undefined : T.muted}
                      hint="in the solution" />
              <Metric label="AT 30+ dB-Hz" value={sat(latest.ge30)}
                      color={latest.sat_valid ? undefined : T.muted}
                      hint="usable" />
              <Metric label="FIX" value={FIX_NAMES[latest.fix_type] || latest.fix_type}
                      color={latest.fix_type >= 3 ? T.success : T.muted}
                      hint={`${latest.num_sv} sv reported`} />
            </div>
            {!latest.sat_valid ? (
              <div style={{
                fontFamily: FONT.sans, fontSize: 11, color: T.warn,
                marginTop: SPACE.s3, lineHeight: 1.5,
              }}>
                The receiver did not answer the NAV-SAT poll, so there are no
                per-satellite numbers to show — the dashes mean “not measured”,
                not “zero”. FIX and SV above come from NAV-PVT and are real.
                {latest.sat_cfg_nak
                  ? ' The receiver NAKed the NAV-SAT enable: that config key is wrong or unsupported on this firmware.'
                  : latest.sat_cfg_ack
                    ? ' The receiver ACKed the NAV-SAT enable and still emitted nothing — the key is accepted, the message is not being produced.'
                    : ' The receiver neither ACKed nor NAKed the enable, so the request did not land at all.'}
              </div>
            ) : null}
          </Panel>

          <Panel title="TIME TO FIRST FIX">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: SPACE.s3,
            }}>
              <Metric
                label="TTFF"
                value={!latest.ttff_valid ? '—'
                  : preFixed ? 'PRE-FIXED' : latest.ttff_s.toFixed(1)}
                unit={latest.ttff_valid && !preFixed ? 's' : undefined}
                color={!latest.ttff_valid ? T.muted
                  : preFixed ? T.info
                  : latest.ttff_s <= 45 ? T.success
                  : latest.ttff_s <= 120 ? T.warn : T.danger}
                hint={!latest.ttff_valid ? 'no 3D fix yet'
                  : preFixed ? 'fix held before the stopwatch started'
                  : 'clean cold start is ~26-30 s'}
              />
              <Metric label="LNA MODE" value={LNA_NAMES[latest.lna_mode] || '?'}
                      hint="receiver internal gain" />
            </div>
            <div style={{
              fontFamily: FONT.sans, fontSize: 11, color: T.muted,
              marginTop: SPACE.s3, lineHeight: 1.5,
            }}>
              This board has no GPS backup cell, so every power-cycle is a
              genuine cold start and no configuration can make one fast. A TTFF
              far above ~30&nbsp;s is the gap worth chasing; the cold start
              itself is not a fault.
            </div>
          </Panel>

          <Panel title="FRONT END">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: SPACE.s3,
            }}>
              <Metric label="AGC" value={rf(latest.agc)}
                      unit={latest.rf_valid ? '/ 8191' : undefined}
                      color={latest.rf_valid ? undefined : T.muted}
                      hint={latest.lna_mode === 2
                        ? 'higher is expected in bypass'
                        : 'relative — compare, do not threshold'} />
              <Metric label="NOISE" value={rf(latest.noise)}
                      color={latest.rf_valid ? undefined : T.muted}
                      hint="per ms" />
              <Metric label="JAMMING" value={rf(latest.jam)}
                      unit={latest.rf_valid ? '/ 255' : undefined}
                      color={!latest.rf_valid ? T.muted
                        : latest.jam > 60 ? T.warn : T.strong} />
              <Metric label="ANT POWER"
                      value={ANT_POWER_NAMES[latest.ant_power] || '?'}
                      hint="external bias bypasses the supervisor" />
            </div>
            <div style={{
              fontFamily: FONT.sans, fontSize: 11, color: T.muted,
              marginTop: SPACE.s3, lineHeight: 1.5,
            }}>
              AGC is a <em>relative</em> indicator and it SETTLES. Every LNA
              change restarts the receiver's front end, and the loop takes tens
              of seconds to converge — a reading taken moments after switching
              mode is mostly convergence, not the mode. Compare modes only
              after each has been left alone for a minute or so, and compare
              several reads, not one. Lower AGC means the receiver is turning
              gain down because it has plenty of signal; a value pinned near
              zero <em>with jamming rising</em> is the overload signature worth
              acting on.
            </div>
            {!latest.rf_valid ? (
              <div style={{
                fontFamily: FONT.sans, fontSize: 11, color: T.warn,
                marginTop: SPACE.s3,
              }}>
                The MON-RF poll did not answer — these four values are stale.
              </div>
            ) : null}
          </Panel>
        </>
      ) : null}

      {history.length > 1 ? (
        <Panel
          title="HISTORY"
          right={<Btn kind="ghost" size="xs" onClick={clear}>CLEAR</Btn>}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%', borderCollapse: 'collapse',
              fontFamily: FONT.mono, fontSize: 11, color: T.text,
            }}>
              <thead>
                <tr style={{ color: T.muted, textAlign: 'left' }}>
                  {['TIME', 'LNA', 'BEST', 'TRACKED', 'FIX', 'TTFF', 'AGC', 'JAM'].map((h) => (
                    <th key={h} style={{
                      padding: `${SPACE.s2}px ${SPACE.s3}px`,
                      borderBottom: `1px solid ${T.border}`, fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={h.received_at + '-' + i}>
                    <td style={{ padding: `${SPACE.s2}px ${SPACE.s3}px`, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
                      {new Date(h.received_at).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: `${SPACE.s2}px ${SPACE.s3}px`, borderBottom: `1px solid ${T.border}` }}>
                      {LNA_NAMES[h.lna_mode] || '?'}
                    </td>
                    <td style={{ padding: `${SPACE.s2}px ${SPACE.s3}px`, borderBottom: `1px solid ${T.border}` }}>
                      {h.sat_valid ? h.cno_best : '—'}
                    </td>
                    <td style={{ padding: `${SPACE.s2}px ${SPACE.s3}px`, borderBottom: `1px solid ${T.border}` }}>
                      {h.sat_valid ? h.tracked : '—'}
                    </td>
                    <td style={{ padding: `${SPACE.s2}px ${SPACE.s3}px`, borderBottom: `1px solid ${T.border}` }}>
                      {h.fix_type}
                    </td>
                    <td style={{ padding: `${SPACE.s2}px ${SPACE.s3}px`, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
                      {!h.ttff_valid ? '—'
                        : h.ttff_s < 1.0 ? 'pre' : h.ttff_s.toFixed(1) + 's'}
                    </td>
                    <td style={{ padding: `${SPACE.s2}px ${SPACE.s3}px`, borderBottom: `1px solid ${T.border}` }}>
                      {h.rf_valid ? h.agc : '—'}
                    </td>
                    <td style={{ padding: `${SPACE.s2}px ${SPACE.s3}px`, borderBottom: `1px solid ${T.border}` }}>
                      {h.rf_valid ? h.jam : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
