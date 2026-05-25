/**
 * TestTab — bench test tab.
 *
 * Props:
 *   tel  — useTelemetry() object
 *   diag — useDiagnostics() object  { tests, runAll, reset }
 *   cmd  — useCommand() object
 *
 * Layout:
 *   Header + mode toggles
 *   4 stat tiles (STATE, ALT, VEL, BATT)
 *   Diagnostics table
 *   2-col sparklines (ALTITUDE · LIVE, VELOCITY · LIVE)
 *   CAC Arming Console (3 channels, disabled when !testMode)
 */
import React, { useState } from 'react';
import { useTheme, useTweaksValue } from '../design/ThemeContext';
import { Cap, Pill, Btn, Panel, StatTile, Sparkline } from '../design/components';
import { FONT, SPACE, TYPE, SCHEME_PROPS } from '../design/tokens.js';

import Diagnostics from './test/Diagnostics.jsx';
import CACConsole  from './test/CACConsole.jsx';
import useTelemHistory from './flight/useTelemHistory.js';

export default function TestTab({ tel, diag, cmd }) {
  const T = useTheme();
  const tweaks = useTweaksValue();
  const scheme = tweaks.scheme;
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;

  const [testMode, setTestMode] = useState(false);

  const t = tel || {};

  // History buffers for sparklines
  const altH = useTelemHistory(t.alt, 200);
  const velH = useTelemHistory(t.vel, 200);

  const isGlassy = scheme === 'obsidian' || scheme === 'fusion';

  function handleTestModeToggle() {
    const next = !testMode;
    setTestMode(next);
    // Call IPC if available
    if (window.casper) {
      if (next) {
        window.casper.cmd_enter_test_mode && window.casper.cmd_enter_test_mode();
      } else {
        window.casper.cmd_exit_test_mode && window.casper.cmd_exit_test_mode();
      }
    }
  }

  function handleSimFlight() {
    if (window.casper && window.casper.cmd_sim_flight) {
      window.casper.cmd_sim_flight();
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: sk.sectionGap,
      padding: SPACE.s5,
      maxWidth: 1880,
      margin: '0 auto',
      width: '100%',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Cap color={T.accent}>TEST · BENCH</Cap>
          <h2 style={{
            fontFamily: isGlassy ? FONT.display : FONT.cond,
            fontSize: isGlassy ? 44 : 32,
            fontWeight: isGlassy ? 500 : 700,
            color: T.strong,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            margin: 0,
            marginTop: SPACE.s2,
            lineHeight: 1,
          }}>
            Bench Test
          </h2>
          <div style={{
            fontFamily: FONT.mono,
            fontSize: TYPE.body,
            color: testMode ? T.warn : T.muted,
            marginTop: SPACE.s2,
          }}>
            {testMode
              ? '● TEST MODE ACTIVE · 55 s timeout'
              : 'FC ready · enter test mode to enable arm/fire'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: SPACE.s2 }}>
          <Btn
            kind={testMode ? 'warn' : 'secondary'}
            size="md"
            onClick={handleTestModeToggle}
          >
            {testMode ? 'TEST MODE ON' : 'TEST MODE'}
          </Btn>
          <Btn kind="primary" size="md" onClick={handleSimFlight}>
            SIM FLIGHT
          </Btn>
        </div>
      </div>

      {/* 4 stat tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: SPACE.s3 }}>
        <StatTile
          label="STATE"
          value={t.state || 'PAD'}
          color={T.accent}
          large
        />
        <StatTile
          label="ALTITUDE"
          value={(t.alt || 0).toFixed(1)}
          unit="m"
          color={T.strong}
          large
        />
        <StatTile
          label="VELOCITY"
          value={(t.vel || 0).toFixed(1)}
          unit="m/s"
          color={T.strong}
          large
        />
        <StatTile
          label="BATTERY"
          value={(t.batt || 0).toFixed(2)}
          unit="V"
          color={(t.batt || 0) < 7.4 ? T.danger : T.strong}
          large
        />
      </div>

      {/* Diagnostics table */}
      <Diagnostics diag={diag} />

      {/* 2-col sparklines */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.s3 }}>
        <Panel title="ALTITUDE · LIVE">
          <Sparkline
            data={altH}
            color={T.accent}
            h={120}
            unit="m"
            value={(t.alt || 0).toFixed(1)}
            scheme={scheme}
          />
        </Panel>
        <Panel title="VELOCITY · LIVE">
          <Sparkline
            data={velH}
            color={T.info}
            h={120}
            unit="m/s"
            value={(t.vel || 0).toFixed(1)}
            scheme={scheme}
          />
        </Panel>
      </div>

      {/* CAC Arming Console */}
      <CACConsole tel={t} testMode={testMode} />
    </div>
  );
}
