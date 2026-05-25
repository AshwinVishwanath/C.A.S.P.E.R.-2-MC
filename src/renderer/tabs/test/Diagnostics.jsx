/**
 * Diagnostics — sensor bus self-test table.
 *
 * Renders diag.tests as a striped table with:
 *   Dot  |  Sensor name  |  Bus detail  |  Status text
 *
 * "RUN SELF-TEST" button calls diag.runAll().
 */
import React from 'react';
import { useTheme, useTweaksValue } from '../../design/ThemeContext';
import { Cap, Pill, Btn, Panel } from '../../design/components';
import { Dot } from '../../design/components';
import { FONT, SPACE, TYPE, SCHEME_PROPS } from '../../design/tokens.js';

const STATUS_COLOR = {
  pass:    'accent',
  ok:      'accent',
  fail:    'danger',
  error:   'danger',
  warn:    'warn',
  warning: 'warn',
  running: 'info',
  idle:    'muted',
};

export default function Diagnostics({ diag }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;

  const tests = (diag && diag.tests) || [];
  const runAll = diag && diag.runAll;

  const passing = tests.filter((t) => t.status === 'pass' || t.status === 'ok').length;
  const failing = tests.filter((t) => t.status === 'fail' || t.status === 'error').length;
  const warnings = tests.filter((t) => t.status === 'warn' || t.status === 'warning').length;

  function pillSummary() {
    if (failing > 0) return <Pill dot color={T.danger} size="sm">{failing} FAIL</Pill>;
    if (warnings > 0) return <Pill dot color={T.warn} size="sm">{warnings} WARN</Pill>;
    if (passing === tests.length && tests.length > 0) return <Pill dot color={T.accent} size="sm">ALL OK</Pill>;
    return <Pill color={T.muted} size="sm">IDLE</Pill>;
  }

  return (
    <Panel
      title="SENSOR BUS · DIAGNOSTICS"
      right={
        <div style={{ display: 'flex', gap: SPACE.s2, alignItems: 'center' }}>
          <Btn kind="ghost" size="xs" onClick={() => runAll && runAll()}>
            RUN SELF-TEST
          </Btn>
          {pillSummary()}
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 1 }}>
        {tests.length === 0 && (
          <div style={{
            padding: SPACE.s4, fontFamily: FONT.mono, fontSize: TYPE.cap,
            color: T.muted, textAlign: 'center',
          }}>
            No diagnostic data — run self-test
          </div>
        )}
        {tests.map((t, i) => {
          const statusKey = (t.status || 'idle').toLowerCase();
          const colorKey = STATUS_COLOR[statusKey] || 'muted';
          const color = T[colorKey] || T.muted;
          return (
            <div key={t.id || i} style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1.6fr 1.6fr auto',
              gap: SPACE.s4,
              alignItems: 'center',
              padding: `${SPACE.s2}px ${SPACE.s3}px`,
              background: i % 2 === 0 ? 'transparent' : T.bgEl + '55',
              borderBottom: i < tests.length - 1 ? `1px solid ${T.border}` : 'none',
            }}>
              <Dot color={color} size={8} glow={sk.showGlow} />
              <div style={{ fontFamily: FONT.mono, fontSize: TYPE.body, fontWeight: 600, color: T.strong }}>
                {t.label || t.id}
              </div>
              <div style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.text }}>
                {t.detail || '—'}
              </div>
              <div style={{
                fontFamily: FONT.mono, fontSize: TYPE.cap, color: color,
                textAlign: 'right', fontWeight: 700, textTransform: 'uppercase',
              }}>
                {t.status || 'idle'}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
