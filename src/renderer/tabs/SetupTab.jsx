// SetupTab — Serial picker (collapse-on-connect) + Pyro Logic Editor
// Wired to window.casper.upload_logic for compile-and-send to FC.

import React, { useReducer, useState, useEffect, useCallback } from 'react';
import { useTheme } from '../design/ThemeContext.jsx';
import { FONT, SPACE, RADIUS, TYPE, TRACK, SCHEME_PROPS } from '../design/tokens.js';
import { Cap, Pill, Panel, Btn, Dot } from '../design/components.jsx';
import { Icon } from '../design/icons.jsx';

import { SerialPortPicker } from '../components/SerialPortPicker.jsx';
import FlightConfigEditor from '../components/FlightConfigEditor.jsx';
import { useFlightConfig } from '../hooks/useFlightConfig.js';

import PyroEditor from '../pyro/PyroEditor.jsx';
import { pyroReducer, initialState } from '../pyro/reducer.js';
import { buildSeedGraph } from '../pyro/seed.js';
import { toLogicGraphIR } from '../pyro/ir.js';

// ---------------------------------------------------------------------------
// Collapsible serial bar — auto-collapses on first FC connect
// ---------------------------------------------------------------------------
function SerialBar({ serial }) {
  const T = useTheme();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('casper-mc-serial-bar-collapsed');
      return stored === null ? true : stored === 'true';
    } catch { return true; }
  });
  const [autoCollapsed, setAutoCollapsed] = useState(false);

  // Persist collapse state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('casper-mc-serial-bar-collapsed', String(collapsed));
    } catch { /* ignore */ }
  }, [collapsed]);

  // Auto-collapse once FC becomes connected, but only the first time
  useEffect(() => {
    if (serial.fc_connected && !autoCollapsed) {
      setCollapsed(true);
      setAutoCollapsed(true);
    }
    if (!serial.fc_connected) {
      setAutoCollapsed(false);
    }
  }, [serial.fc_connected, autoCollapsed]);

  const status =
    serial.fc_connected && serial.gs_connected ? 'FC + GS CONNECTED'
    : serial.fc_connected ? 'FC CONNECTED · DIRECT'
    : serial.gs_connected ? 'GS CONNECTED · RELAY'
    : 'NO LINK';
  const live = serial.fc_connected || serial.gs_connected;

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          border: `1px solid ${live ? T.accentRing : T.border}`,
          background: live ? T.accentBg : T.bgPanel,
          color: T.text,
          borderRadius: RADIUS.md,
          cursor: 'pointer',
          fontFamily: FONT.mono,
          fontSize: 11,
          textAlign: 'left',
          marginBottom: SPACE.s4,
        }}
      >
        <Dot color={live ? T.accent : T.muted} pulse={live} />
        <Cap color={T.muted} style={{ marginRight: 4 }}>SERIAL</Cap>
        <span style={{ flex: 1, color: T.strong, fontWeight: 600 }}>{status}</span>
        <Pill color={live ? T.accent : T.muted}>{live ? 'LIVE' : 'OFFLINE'}</Pill>
        <span style={{ color: T.muted, marginLeft: 6, fontSize: 13 }}>{'▸'}</span>
      </button>
    );
  }

  return (
    <div style={{ marginBottom: SPACE.s4 }}>
      {/* Clickable header bar — toggles collapse */}
      <button
        onClick={() => setCollapsed(true)}
        title="Collapse serial picker"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 14px',
          background: T.bgPanel,
          border: `1px solid ${live ? T.accentRing : T.border}`,
          borderBottom: 'none',
          borderRadius: `${RADIUS.md} ${RADIUS.md} 0 0`,
          cursor: 'pointer',
          fontFamily: FONT.mono,
          fontSize: 10,
          color: T.muted,
          textAlign: 'left',
        }}
      >
        <Dot color={live ? T.accent : T.muted} pulse={live} size={7} />
        <Cap color={T.muted}>SERIAL</Cap>
        <span style={{ flex: 1, color: T.strong, fontWeight: 600, fontSize: 11 }}>{status}</span>
        <Pill color={live ? T.accent : T.muted}>{live ? 'LIVE' : 'OFFLINE'}</Pill>
        <span style={{ color: T.muted, marginLeft: 8, fontSize: 13 }}>{'▾'}</span>
      </button>
      <SerialPortPicker serial={serial} theme={T} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flight Sim Source — load an OpenRocket flight and replay it through the
// dashboard + pyro logic designer (transport controls live here).
// ---------------------------------------------------------------------------
function FlightSimBox({ flightSim, serial }) {
  const T = useTheme();
  if (!flightSim) return null;

  const {
    profile, filename, error, loading, playing, speed, setSpeed,
    simT, duration, sample, load, unload, play, pause, restart, seek,
  } = flightSim;
  const linkBusy = serial.fc_connected || serial.gs_connected;

  return (
    <div
      style={{
        marginBottom: SPACE.s4,
        border: `1px solid ${profile ? T.accentRing : T.border}`,
        borderRadius: RADIUS.md,
        background: profile ? T.accentBg : T.bgPanel,
        padding: '10px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Dot color={profile ? T.accent : T.muted} pulse={playing} />
        <Cap color={T.muted}>FLIGHT SIM</Cap>
        <span
          style={{
            flex: 1, color: T.strong, fontWeight: 600, fontSize: 11, fontFamily: FONT.mono,
          }}
        >
          {profile
            ? filename
            : linkBusy
              ? 'HARDWARE CONNECTED · sim disabled'
              : 'No flight loaded — import an OpenRocket CSV'}
        </span>
        {profile ? (
          <>
            <Pill color={T.muted}>{`APOGEE ${profile.apogee_m.toFixed(0)} m`}</Pill>
            <Pill color={T.muted}>{`${duration.toFixed(0)} s`}</Pill>
            <Btn kind="ghost" onClick={unload} icon={<Icon name="undo" size={14} />}>EJECT</Btn>
          </>
        ) : (
          <Btn
            kind="secondary"
            disabled={loading || linkBusy}
            onClick={load}
            icon={<Icon name="upload" size={14} />}
          >
            {loading ? 'LOADING…' : 'LOAD CSV / ORK'}
          </Btn>
        )}
      </div>

      {error && (
        <div style={{ color: T.danger, fontFamily: FONT.mono, fontSize: 10, marginTop: 8 }}>
          {error}
        </div>
      )}

      {profile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <Btn kind="primary" onClick={playing ? pause : play}>
            {playing ? '❚❚ PAUSE' : '▶ PLAY'}
          </Btn>
          <Btn kind="ghost" onClick={restart}>↺</Btn>
          <input
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={simT}
            onChange={(e) => seek(+e.target.value)}
            style={{ flex: 1 }}
          />
          <span
            style={{
              fontFamily: FONT.mono, fontSize: 11, color: T.strong, fontWeight: 700,
              minWidth: 150, textAlign: 'right',
            }}
          >
            {sample ? `${sample.phase} · T+${simT.toFixed(1)}s` : `T+${simT.toFixed(1)}s`}
          </span>
          <select
            value={speed}
            onChange={(e) => setSpeed(+e.target.value)}
            style={{
              fontFamily: FONT.mono, fontSize: 11, background: T.bg, color: T.text,
              border: `1px solid ${T.border}`, borderRadius: RADIUS.sm, padding: '5px 6px',
            }}
          >
            {[0.25, 0.5, 1, 2, 4].map((s) => (
              <option key={s} value={s}>{`${s}×`}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SetupTab — header + serial bar + pyro editor
// ---------------------------------------------------------------------------
export default function SetupTab({ serial, flightSim }) {
  const T = useTheme();
  const scheme = T.scheme || 'fusion';
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;

  // Flight config state — shared with Flight tab RightRail via localStorage
  const [flightConfig, updateFlightConfig, resetFlightConfig] = useFlightConfig();

  // Pyro graph state lives here so the Setup tab persists across tab switches
  const [pyroState, dispatch] = useReducer(pyroReducer, undefined, () =>
    initialState(buildSeedGraph()),
  );

  // Upload-to-FC state
  const [uploadStatus, setUploadStatus] = useState(null); // null | 'pending' | 'ok' | 'err'
  const [uploadDetail, setUploadDetail] = useState('');

  const handleUpload = useCallback(async () => {
    const ir = toLogicGraphIR(pyroState);
    const api = typeof window !== 'undefined' ? window.casper : null;
    if (!api || typeof api.upload_logic !== 'function') {
      setUploadStatus('err');
      setUploadDetail('Bridge missing: window.casper.upload_logic not available');
      return;
    }
    setUploadStatus('pending');
    setUploadDetail('Compiling…');
    try {
      const res = await api.upload_logic(ir);
      if (res && res.ok) {
        const hashHex = (res.hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
        const stats = res.stats || {};
        const sent = res.sent !== false; // undefined or true => sent
        setUploadStatus('ok');
        setUploadDetail(
          (sent ? 'Uploaded · ' : 'Compiled (no FC) · ')
            + `${stats.total_bytes ?? '?'} B · `
            + `${stats.op_count ?? '?'} ops · `
            + `hash 0x${hashHex}`,
        );
      } else {
        const errs = (res && res.errors) || ['unknown error'];
        setUploadStatus('err');
        setUploadDetail(errs.slice(0, 3).join(' · '));
      }
    } catch (e) {
      setUploadStatus('err');
      setUploadDetail(String((e && e.message) || e));
    }
  }, [pyroState]);

  const handleExport = useCallback(() => {
    const json = JSON.stringify(toLogicGraphIR(pyroState), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pyro-logic-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [pyroState]);

  const handleImport = useCallback(
    (jsonOrText) => {
      try {
        const data = typeof jsonOrText === 'string' ? JSON.parse(jsonOrText) : jsonOrText;
        // The IR has nodes/edges only; the reducer's LOAD action expects nodes/edges/groups
        // and node positions. For an IR import we lay out nodes in a grid.
        const nodes = (data.nodes || []).map((n, i) => ({
          ...n,
          label: n.label || (n.kind || '').toUpperCase().replace(/_/g, ' '),
          x: 80 + (i % 6) * 220,
          y: 80 + Math.floor(i / 6) * 140,
          params: n.params || {},
        }));
        const edges = data.edges || [];
        const groups = data.groups || [];
        dispatch({ type: 'LOAD', payload: { nodes, edges, groups } });
        setUploadStatus('ok');
        setUploadDetail(`Imported ${nodes.length} nodes, ${edges.length} edges`);
      } catch (e) {
        setUploadStatus('err');
        setUploadDetail('Import failed: ' + String((e && e.message) || e));
      }
    },
    [],
  );

  const statusColor =
    uploadStatus === 'ok' ? T.accent
    : uploadStatus === 'err' ? T.danger
    : uploadStatus === 'pending' ? T.warn
    : T.muted;

  return (
    <div
      style={{
        padding: SPACE.s5,
        maxWidth: 1880,
        margin: '0 auto',
        animation: 'cmcFadeUp 240ms ease-out',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: SPACE.s5,
          gap: SPACE.s4,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Cap color={T.accent}>SETUP · CONFIGURATION</Cap>
          <h2
            style={{
              fontFamily: sk.glassyType ? FONT.display : FONT.cond,
              fontSize: sk.glassyType ? TYPE.h1 + 4 : TYPE.h1,
              fontWeight: 600,
              color: T.strong,
              letterSpacing: sk.glassyType ? TRACK.display : '0.02em',
              margin: '4px 0 6px 0',
              textTransform: sk.glassyType ? 'none' : 'uppercase',
            }}
          >
            Pyro Logic Editor
          </h2>
          <div style={{ fontFamily: FONT.sans, fontSize: TYPE.body, color: T.muted, maxWidth: 720 }}>
            Wire flight-computer logic with nodes — sensors, FSM events, gates and
            timers — that drive each pyro channel. Compile + upload sends a binary
            program to the FC over USB CDC or LoRa.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.s2 }}>
          {uploadStatus && (
            <div
              style={{
                fontFamily: FONT.mono,
                fontSize: 10,
                color: statusColor,
                padding: '6px 10px',
                border: `1px solid ${statusColor}55`,
                background: `${statusColor}10`,
                borderRadius: RADIUS.sm,
                maxWidth: 380,
              }}
            >
              {uploadDetail}
            </div>
          )}
          <Btn
            kind="ghost"
            onClick={() => dispatch({ type: 'LOAD', payload: buildSeedGraph() })}
            icon={<Icon name="undo" size={14} />}
          >
            RESET
          </Btn>
          <Btn kind="secondary" onClick={handleExport} icon={<Icon name="download" size={14} />}>
            EXPORT
          </Btn>
          <ImportButton onImport={handleImport} />
          <Btn kind="primary" onClick={handleUpload} icon={<Icon name="upload" size={14} />}>
            UPLOAD TO FC
          </Btn>
        </div>
      </div>

      {/* Serial picker */}
      <SerialBar serial={serial} />

      {/* Flight sim source (OpenRocket) */}
      <FlightSimBox flightSim={flightSim} serial={serial} />

      {/* Pyro editor */}
      <div style={{ marginBottom: SPACE.s4 }}>
        <PyroEditor
          state={pyroState}
          dispatch={dispatch}
          onCompile={handleUpload}
          onExport={handleExport}
          onImport={handleImport}
          flightSim={flightSim}
          height="calc(100vh - 480px)"
        />
      </div>

      {/* Flight configuration editor */}
      <div style={{ marginBottom: SPACE.s4 }}>
        <FlightConfigEditor
          config={flightConfig}
          onUpdate={updateFlightConfig}
          onReset={resetFlightConfig}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// File-import button (hidden <input type="file">)
// ---------------------------------------------------------------------------
function ImportButton({ onImport }) {
  const T = useTheme();
  const inputRef = React.useRef(null);
  const handleFiles = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onImport(String(reader.result));
    reader.readAsText(file);
    e.target.value = '';
  };
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={handleFiles}
      />
      <Btn
        kind="ghost"
        onClick={() => inputRef.current && inputRef.current.click()}
        icon={<Icon name="upload" size={14} />}
      >
        IMPORT
      </Btn>
    </>
  );
}
