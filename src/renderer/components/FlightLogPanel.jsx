import { useContext, useState } from 'react';
import { ThemeCtx } from '../design/ThemeContext.jsx';
import { FONT, TYPE, SPACE, RADIUS, SCHEME_PROPS } from '../design/tokens.js';
import { Panel, Cap, Btn, StatTile } from '../design/components';
import useFlightLog from '../hooks/use_flight_log';

// ---------------------------------------------------------------------------
// FlightLogPanel — split-pane harvest UI
// Left: progress + stat tiles   Right: scrollable event log
// Props: conn (bool), theme (T) — theme may also come from ThemeContext
// ---------------------------------------------------------------------------
export default function FlightLogPanel(props) {
  // Accept theme from context OR from props.theme (existing callers pass props.theme)
  var ctx = useContext(ThemeCtx);
  var T = props.theme || (ctx && ctx.theme) || null;
  var conn = props.conn;

  var log = useFlightLog();
  var [confirmErase, setConfirmErase] = useState(false);

  // Erase double-click handler: first click arms for 3 s, second click fires
  function handleErase() {
    if (!confirmErase) {
      setConfirmErase(true);
      setTimeout(function () { setConfirmErase(false); }, 3000);
      return;
    }
    setConfirmErase(false);
    log.erase();
  }

  // Bail out cleanly if theme not yet available
  if (!T) return null;

  // Determine scheme-level props (glow, etc.)
  var sk = SCHEME_PROPS[T.scheme || 'fusion'] || SCHEME_PROPS.fusion;

  // ---- Computed result values ----
  var hrCount  = log.result && log.result.hr_entries      ? log.result.hr_entries.length      : 0;
  var lrCount  = log.result && log.result.lr_entries      ? log.result.lr_entries.length      : 0;
  var sumCount = log.result && log.result.summary_entries ? log.result.summary_entries.length : 0;
  var meta     = log.result ? log.result.metadata : null;
  var events   = log.result && log.result.summary_entries ? log.result.summary_entries : [];

  // ---- Progress values (safe defaults) ----
  var pct    = (log.progress && log.progress.pct)    || 0;
  var detail = (log.progress && log.progress.detail) || '';
  var phase  = (log.progress && log.progress.phase)  || '';

  // ---- Header action buttons ----
  var headerButtons = (
    <div style={{ display: 'flex', gap: SPACE.s2 }}>
      <Btn
        T={T}
        kind="primary"
        size="sm"
        icon="download"
        disabled={!conn || log.busy}
        onClick={log.download}
      >
        {log.busy ? '⟳ DOWNLOADING...' : 'DOWNLOAD'}
      </Btn>
      <Btn
        T={T}
        kind="secondary"
        size="sm"
        disabled={!log.result || log.busy}
        onClick={function () { log.exportCsv('all'); }}
      >
        EXPORT CSV
      </Btn>
      <Btn
        T={T}
        kind={confirmErase ? 'danger' : 'secondary'}
        size="sm"
        disabled={!conn || log.busy}
        onClick={handleErase}
      >
        {confirmErase ? '⚠ CONFIRM ERASE' : 'ERASE'}
      </Btn>
    </div>
  );

  // ---- Left column: progress bar + stat tiles ----
  var leftCol = (
    <div>
      {/* Progress header row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: SPACE.s2,
      }}>
        <Cap T={T} color={T.accent}>HIGH-RATE STREAM · 100 Hz</Cap>
        <span style={{
          fontFamily: FONT.mono,
          fontSize: TYPE.body,
          fontWeight: 700,
          color: T.accent,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {pct}%
        </span>
      </div>

      {/* Progress bar — always rendered; shows 0% when idle */}
      <div style={{
        height: 8,
        background: T.bgEl,
        borderRadius: RADIUS.pill,
        overflow: 'hidden',
        border: '1px solid ' + T.border,
      }}>
        <div style={{
          height: '100%',
          width: pct + '%',
          background: T.accent,
          borderRadius: RADIUS.pill,
          boxShadow: sk.showGlow ? T.glowSoft(T.accent) : 'none',
          transition: 'width 200ms ease',
        }} />
      </div>

      {/* Detail text (frame count / address) */}
      <div style={{
        fontFamily: FONT.mono,
        fontSize: TYPE.cap,
        color: T.muted,
        marginTop: SPACE.s2,
        fontVariantNumeric: 'tabular-nums',
        minHeight: 14,
      }}>
        {detail}
      </div>

      {/* Error display — shown when phase=error and not busy */}
      {phase === 'error' && !log.busy && (
        <div style={{
          marginTop: SPACE.s2,
          padding: SPACE.s2 + 'px ' + SPACE.s3 + 'px',
          background: T.dangerBg,
          border: '1px solid ' + T.danger,
          borderRadius: RADIUS.sm,
        }}>
          <span style={{
            fontFamily: FONT.mono,
            fontSize: TYPE.cap,
            color: T.danger,
          }}>
            {(log.progress && (log.progress.error || log.progress.detail)) || 'Unknown error'}
          </span>
        </div>
      )}

      {/* Stat tiles — 3-column grid; rendered whenever result exists */}
      {log.result && !log.busy ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: SPACE.s2,
          marginTop: SPACE.s4,
        }}>
          <StatTile
            T={T}
            label="HIGH-RATE"
            value={hrCount.toLocaleString()}
            unit="frames"
            sub="100 Hz · 8 ch"
          />
          <StatTile
            T={T}
            label="LOW-RATE"
            value={lrCount.toLocaleString()}
            unit="frames"
            sub="10 Hz · 16 ch"
          />
          <StatTile
            T={T}
            label="EVENTS"
            value={sumCount.toString()}
            unit="entries"
            sub="apogee, deploy, etc"
            accent
          />
        </div>
      ) : (
        // Empty state — no harvest yet and not busy
        !log.busy && !log.progress && (
          <div style={{
            marginTop: SPACE.s4,
            padding: SPACE.s3 + 'px ' + SPACE.s4 + 'px',
            background: T.bgEl,
            border: '1px solid ' + T.border,
            borderRadius: RADIUS.md,
            fontFamily: FONT.mono,
            fontSize: TYPE.cap,
            color: T.faint,
            textAlign: 'center',
            letterSpacing: '0.08em',
          }}>
            NO FLIGHT LOG HARVESTED YET
          </div>
        )
      )}

      {/* Flash address metadata row */}
      {meta && !log.busy && (
        <div style={{
          marginTop: SPACE.s3,
          fontFamily: FONT.mono,
          fontSize: TYPE.cap,
          color: T.faint,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {'HR @ 0x' + (meta.hr_addr || 0).toString(16).toUpperCase().padStart(8, '0') +
           ' · LR @ 0x' + (meta.lr_addr || 0).toString(16).toUpperCase().padStart(8, '0') +
           ' · Summary: ' + (meta.summary_bytes || 0).toLocaleString() + ' bytes'}
        </div>
      )}
    </div>
  );

  // ---- Right column: scrollable event log ----
  var rightCol = (
    <div style={{
      background: T.bgEl,
      border: '1px solid ' + T.border,
      borderRadius: RADIUS.md,
      maxHeight: 320,
      overflowY: 'auto',
    }}>
      {/* Sticky header */}
      <div style={{
        padding: SPACE.s2 + 'px ' + SPACE.s3 + 'px',
        borderBottom: '1px solid ' + T.border,
        position: 'sticky',
        top: 0,
        background: T.bgEl,
        zIndex: 1,
      }}>
        <Cap T={T}>EVENT LOG · LAST FLIGHT</Cap>
      </div>

      {events.length > 0 ? (
        events.map(function (entry, i) {
          return (
            <div key={i} style={{
              display: 'flex',
              gap: SPACE.s3,
              padding: SPACE.s2 + 'px ' + SPACE.s3 + 'px',
              fontFamily: FONT.mono,
              fontSize: TYPE.cap,
              borderBottom: i < events.length - 1 ? '1px solid ' + T.border : 'none',
            }}>
              <span style={{
                color: T.accent,
                minWidth: 60,
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 600,
                flexShrink: 0,
              }}>
                {entry.timestamp_s != null ? entry.timestamp_s.toFixed(3) + 's' : '---'}
              </span>
              <span style={{ color: T.text, fontWeight: 500 }}>
                {entry.msg}
              </span>
            </div>
          );
        })
      ) : (
        <div style={{
          padding: SPACE.s4 + 'px ' + SPACE.s3 + 'px',
          fontFamily: FONT.mono,
          fontSize: TYPE.cap,
          color: T.faint,
          textAlign: 'center',
          letterSpacing: '0.06em',
        }}>
          NO EVENTS
        </div>
      )}
    </div>
  );

  return (
    <div style={{ marginTop: SPACE.s4 }}>
      <Panel T={T} title="FLIGHT LOG · HARVEST" right={headerButtons}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: SPACE.s4,
          alignItems: 'start',
        }}>
          {leftCol}
          {rightCol}
        </div>
      </Panel>
    </div>
  );
}
