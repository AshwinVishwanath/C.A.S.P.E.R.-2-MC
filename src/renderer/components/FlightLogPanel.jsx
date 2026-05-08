import { useState } from 'react';
import useFlightLog from '../hooks/use_flight_log';

var MONO = "'IBM Plex Mono','Menlo',monospace";
var COND = "'IBM Plex Sans Condensed','Arial Narrow',sans-serif";

export default function FlightLogPanel(props) {
  var conn = props.conn;
  var T = props.theme;
  var log = useFlightLog();
  var [confirmErase, setConfirmErase] = useState(false);

  // Progress bar
  var progressBar = null;
  if (log.progress && log.busy) {
    var pct = log.progress.pct || 0;
    var phase = log.progress.phase || '';
    var detail = log.progress.detail || '';
    progressBar = (
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontFamily: COND, fontSize: 10, fontWeight: 700, color: T.accent, textTransform: 'uppercase', letterSpacing: 1.5 }}>{phase}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: T.muted }}>{pct}%</span>
        </div>
        <div style={{ height: 6, background: T.bgEl, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: pct + '%', background: T.accent, borderRadius: 3, transition: 'width 0.3s ease' }} />
        </div>
        <div style={{ fontFamily: MONO, fontSize: 9, color: T.muted, marginTop: 4 }}>{detail}</div>
      </div>
    );
  }

  // Error display
  var errorDisplay = null;
  if (log.progress && log.progress.phase === 'error' && !log.busy) {
    errorDisplay = (
      <div style={{ marginTop: 10, padding: '8px 12px', background: T.danger + '18', border: '1px solid ' + T.danger + '44', borderRadius: 4 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, color: T.danger }}>{log.progress.error || log.progress.detail}</span>
      </div>
    );
  }

  // Results summary
  var resultDisplay = null;
  if (log.result && !log.busy) {
    var meta = log.result.metadata;
    var hrCount = log.result.hr_entries ? log.result.hr_entries.length : 0;
    var lrCount = log.result.lr_entries ? log.result.lr_entries.length : 0;
    var sumCount = log.result.summary_entries ? log.result.summary_entries.length : 0;

    resultDisplay = (
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div style={{ padding: '8px 12px', background: T.bgEl, borderRadius: 4, border: '1px solid ' + T.border }}>
            <div style={{ fontFamily: COND, fontSize: 9, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>High-Rate</div>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: T.strong }}>{hrCount.toLocaleString()}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: T.muted }}>entries</div>
          </div>
          <div style={{ padding: '8px 12px', background: T.bgEl, borderRadius: 4, border: '1px solid ' + T.border }}>
            <div style={{ fontFamily: COND, fontSize: 9, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Low-Rate</div>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: T.strong }}>{lrCount.toLocaleString()}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: T.muted }}>entries</div>
          </div>
          <div style={{ padding: '8px 12px', background: T.bgEl, borderRadius: 4, border: '1px solid ' + T.border }}>
            <div style={{ fontFamily: COND, fontSize: 9, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>Summary</div>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: T.strong }}>{sumCount}</div>
            <div style={{ fontFamily: MONO, fontSize: 9, color: T.muted }}>events</div>
          </div>
        </div>

        {/* Flash address info */}
        {meta && (
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 9, color: T.muted }}>
            Flash: HR @ 0x{(meta.hr_addr || 0).toString(16).toUpperCase().padStart(8, '0')} · LR @ 0x{(meta.lr_addr || 0).toString(16).toUpperCase().padStart(8, '0')} · Summary: {(meta.summary_bytes || 0).toLocaleString()} bytes
          </div>
        )}

        {/* Summary event log */}
        {log.result.summary_entries && log.result.summary_entries.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontFamily: COND, fontSize: 10, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 }}>Flight Events</div>
            <div style={{ maxHeight: 160, overflowY: 'auto', background: T.bgEl, borderRadius: 4, border: '1px solid ' + T.border, padding: '4px 0' }}>
              {log.result.summary_entries.map(function (entry, i) {
                return (
                  <div key={i} style={{ display: 'flex', gap: 10, padding: '3px 10px', fontFamily: MONO, fontSize: 10 }}>
                    <span style={{ color: T.accent, minWidth: 60 }}>{entry.timestamp_s != null ? entry.timestamp_s.toFixed(3) + 's' : '---'}</span>
                    <span style={{ color: T.text }}>{entry.msg}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Erase confirmation handler
  function handleErase() {
    if (!confirmErase) {
      setConfirmErase(true);
      setTimeout(function () { setConfirmErase(false); }, 3000);
      return;
    }
    setConfirmErase(false);
    log.erase();
  }

  // Button style helper (matching Btn from App.jsx)
  function btnStyle(primary, disabled, danger) {
    return {
      fontFamily: MONO,
      fontSize: 10.5,
      fontWeight: 700,
      letterSpacing: 0.8,
      padding: '6px 14px',
      borderRadius: 3,
      border: danger ? '1px solid ' + T.danger : primary ? 'none' : '1px solid ' + T.border,
      background: disabled ? (primary ? T.muted : 'transparent') : danger ? T.danger + '22' : primary ? T.accent : 'transparent',
      color: disabled ? (primary ? (T.name === 'dark' ? '#05080c' : '#fff') : T.muted) : danger ? T.danger : primary ? (T.name === 'dark' ? '#05080c' : '#fff') : T.text,
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.45 : 1
    };
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ padding: '12px 16px', background: T.bgPanel, borderRadius: 5, border: '1px solid ' + T.border, boxShadow: T.shadow }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: COND, fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: 2 }}>Flight Log</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={log.download}
              disabled={!conn || log.busy}
              style={btnStyle(true, !conn || log.busy, false)}
            >
              {log.busy ? '\u27F3 DOWNLOADING...' : '\u25BC DOWNLOAD'}
            </button>
            <button
              onClick={function () { log.exportCsv('all'); }}
              disabled={!log.result || log.busy}
              style={btnStyle(false, !log.result || log.busy, false)}
            >
              EXPORT CSV
            </button>
            <button
              onClick={handleErase}
              disabled={!conn || log.busy}
              style={btnStyle(false, !conn || log.busy, confirmErase)}
            >
              {confirmErase ? '\u26A0 CONFIRM ERASE' : 'ERASE'}
            </button>
          </div>
        </div>
        {progressBar}
        {errorDisplay}
        {resultDisplay}
      </div>
    </div>
  );
}
