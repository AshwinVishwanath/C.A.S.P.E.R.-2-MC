// PyroEditor.jsx — top-level editor shell
// Palette / Canvas / Inspector / MiniMap / Toolbar / StatusStrip
import React, {
  useReducer, useState, useRef, useEffect, useMemo, useCallback,
} from 'react';
import { useTheme } from '../design/ThemeContext.jsx';
import { FONT, SPACE, RADIUS, SCHEME_PROPS } from '../design/tokens.js';

// Pyro data model
import { pyroReducer, initialState } from './reducer.js';
import { buildSeedGraph } from './seed.js';
import { validateGraph } from './validate.js';
import { sampleProfile, evaluateGraph, SIM_PROFILE } from './evaluator.js';
import { isPyro } from './spec.js';
import { nodeHeight, NODE_W, snapToGrid, GRID } from './geometry.js';
import { loadMacros, saveMacros, serialiseGroupAsMacro } from './macros.js';
import { toLogicGraphIR } from './ir.js';

import { Palette }   from './Palette.jsx';
import { Canvas }    from './Canvas.jsx';
import { Inspector } from './Inspector.jsx';
import { MiniMap }   from './MiniMap.jsx';

// Re-export sub-components for testability
export { Palette, Canvas, Inspector, MiniMap };

// ---------------------------------------------------------------------------
// ToolBtn — tiny icon/text button in the toolbar
// ---------------------------------------------------------------------------
function ToolBtn({ T, onClick, children, title, active, accent }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: '5px 9px',
        border: 'none',
        background: active ? T.accent : 'transparent',
        color: active ? T.accentText : (accent ? T.accent : T.text),
        fontFamily: FONT.mono, fontSize: 11, fontWeight: 700,
        borderRadius: 3, cursor: 'pointer', letterSpacing: 0.3,
        lineHeight: 1,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        transition: 'background 120ms, color 120ms',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = T.accentBg; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------
function Sep({ T }) {
  return <span style={{ width: 1, background: T.border, margin: '0 4px', alignSelf: 'stretch' }} />;
}

// ---------------------------------------------------------------------------
// PyroEditor — default export
// ---------------------------------------------------------------------------
/**
 * @param {{
 *   state?: object,
 *   dispatch?: Function,
 *   onCompile?: (ir: object) => void,
 *   onExport?: (json: string) => void,
 *   onImport?: (json: object) => void,
 *   height?: number,
 * }} props
 */
function PyroEditor({ state: stateProp, dispatch: dispatchProp, onCompile, onExport, onImport, flightSim, height = 720 }) {
  const T = useTheme();
  const scheme = T.scheme || 'fusion';
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;

  // Internal state if not controlled externally
  const seed = useMemo(() => buildSeedGraph(), []);
  const [internalState, internalDispatch] = useReducer(pyroReducer, seed, initialState);
  const state    = stateProp    || internalState;
  const dispatch = dispatchProp || internalDispatch;

  // UI state
  const [view, setView]                           = useState({ x: 0, y: 0, k: 1 });
  const [query, setQuery]                         = useState('');
  const [snapOn, setSnapOn]                       = useState(true);
  const [paletteCollapsed, setPaletteCollapsed]   = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [spaceHeld, setSpaceHeld]                 = useState(false);
  const [panning, setPanning]                     = useState(false);

  // Drag state
  const [dragEdge, setDragEdge]   = useState(null);
  const [dragNode, setDragNode]   = useState(null);
  const [dragCp, setDragCp]       = useState(null);
  const [dragGroup, setDragGroup] = useState(null);
  const [marquee, setMarquee]     = useState(null);

  // Simulation state
  const [simOn, setSimOn]         = useState(false);
  const [simT, setSimT]           = useState(0);
  const [simPlaying, setSimPlaying] = useState(false);
  const [firedLog, setFiredLog]   = useState([]);
  const prevFiredRef              = useRef({});

  // Macros — loaded once, persisted to localStorage
  const [macros, setMacros] = useState(() => loadMacros());
  useEffect(() => { saveMacros(macros); }, [macros]);

  const svgAreaRef = useRef(null);

  // -------------------------------------------------------------------------
  // Memoized derived data
  // -------------------------------------------------------------------------
  const validation = useMemo(() => validateGraph(state), [state.nodes, state.edges]);

  // External (OpenRocket) sim driving. When a flight is loaded in the Setup
  // tab's Flight Sim box, it takes priority over the built-in synthetic
  // SIM_PROFILE driven by the internal ▶ Simulate clock.
  const extProfile = flightSim && flightSim.profile ? flightSim.profile.samples : null;
  const extActive = !!extProfile;
  const extSample = flightSim ? flightSim.sample : null;

  const activeProfile = extActive ? extProfile : SIM_PROFILE;
  const simActive = extActive || simOn;
  const simSample = extActive ? extSample : (simOn ? sampleProfile(simT) : null);
  const simTime = extActive ? (extSample ? extSample.t : 0) : simT;
  const simEndT = activeProfile[activeProfile.length - 1].t;

  const simValues = useMemo(
    () => (simSample ? evaluateGraph(state, simSample, activeProfile) : null),
    [simSample, state.nodes, state.edges, activeProfile]
  );

  // -------------------------------------------------------------------------
  // Sim playback loop
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (extActive || !simOn || !simPlaying) return;
    const endT = SIM_PROFILE[SIM_PROFILE.length - 1].t;
    let raf, last = performance.now();
    const tick = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      setSimT((t) => {
        const nt = t + dt;
        if (nt >= endT) { setSimPlaying(false); return endT; }
        return nt;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [simOn, simPlaying]);

  // Fire event log tracking
  useEffect(() => {
    if (!simActive || !simValues) return;
    const newFired = {};
    state.nodes.filter((n) => isPyro(n.kind)).forEach((n) => {
      newFired[n.id] = !!(simValues.get ? simValues.get(n.id)?.fire : simValues[n.id]?.fire);
      if (newFired[n.id] && !prevFiredRef.current[n.id]) {
        setFiredLog((prev) => [
          ...prev,
          { id: Math.random(), t: simTime, ch: n.kind.slice(-1), role: n.params?.role || '' },
        ]);
      }
    });
    prevFiredRef.current = newFired;
  }, [simValues, simTime]);

  // -------------------------------------------------------------------------
  // Zoom to fit
  // -------------------------------------------------------------------------
  const zoomToFit = useCallback(() => {
    if (state.nodes.length === 0) return;
    const svgEl = svgAreaRef.current;
    if (!svgEl) return;
    const r = svgEl.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const xs = state.nodes.flatMap((n) => [n.x, n.x + NODE_W]);
    const ys = state.nodes.flatMap((n) => [n.y, n.y + nodeHeight(n)]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX, h = maxY - minY;
    const pad = 80;
    const k = Math.min((r.width - pad * 2) / (w || 1), (r.height - pad * 2) / (h || 1), 1.4);
    setView({ k, x: r.width / 2 - (minX + w / 2) * k, y: r.height / 2 - (minY + h / 2) * k });
  }, [state.nodes]);

  // Auto-fit on mount
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current) return;
    const svgEl = svgAreaRef.current;
    if (!svgEl) return;
    const r = svgEl.getBoundingClientRect();
    if (r.width === 0) return;
    didFit.current = true;
    requestAnimationFrame(() => zoomToFit());
  }, [zoomToFit]);

  // -------------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------------
  useEffect(() => {
    const onKD = (e) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      const editable = document.activeElement?.isContentEditable;
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || editable) return;

      if (e.code === 'Space') { setSpaceHeld(true); e.preventDefault(); return; }

      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNDO' }); return; }
      if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); dispatch({ type: 'REDO' }); return; }
      if (mod && e.key === 'd') { e.preventDefault(); dispatch({ type: 'DUPLICATE' }); return; }
      if (mod && e.key === 'a') { e.preventDefault(); dispatch({ type: 'SELECT_ALL' }); return; }
      if (mod && e.key === 'f') { e.preventDefault(); zoomToFit(); return; }
      if (mod && e.key === 'g' && !e.shiftKey) {
        e.preventDefault();
        const eligible = [...state.selected].filter((id) => {
          const n = state.nodes.find((x) => x.id === id);
          return n && !isPyro(n.kind) && !(state.groups || []).some((g) => g.nodeIds.includes(id));
        });
        if (eligible.length >= 2) dispatch({ type: 'CREATE_GROUP', nodeIds: eligible });
        return;
      }
      if (mod && (e.key === 'G' || (e.key === 'g' && e.shiftKey))) {
        e.preventDefault();
        if (state.selectedGroup) dispatch({ type: 'UNGROUP', id: state.selectedGroup });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selected.size > 0 || state.selectedEdge || state.selectedGroup) {
          e.preventDefault();
          dispatch({ type: 'DELETE_SELECTION' });
        }
      }
    };
    const onKU = (e) => { if (e.code === 'Space') setSpaceHeld(false); };
    window.addEventListener('keydown', onKD);
    window.addEventListener('keyup', onKU);
    return () => { window.removeEventListener('keydown', onKD); window.removeEventListener('keyup', onKU); };
  }, [state, zoomToFit, dispatch]);

  // -------------------------------------------------------------------------
  // Macro helpers
  // -------------------------------------------------------------------------
  const saveGroupAsMacro = useCallback((groupId) => {
    const group = (state.groups || []).find((g) => g.id === groupId);
    if (!group) return;
    const macro = serialiseGroupAsMacro(group, state.nodes, state.edges);
    if (!macro) return;
    setMacros((prev) => [...prev, macro]);
  }, [state]);

  const deleteMacro = useCallback((id) => {
    setMacros((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // -------------------------------------------------------------------------
  // Canvas drop handler
  // -------------------------------------------------------------------------
  const onCanvasDrop = useCallback((e) => {
    e.preventDefault();
    const svgEl = svgAreaRef.current;
    if (!svgEl) return;
    const r = svgEl.getBoundingClientRect();
    const gx = (e.clientX - r.left - view.x) / view.k;
    const gy = (e.clientY - r.top  - view.y) / view.k;

    const macroId = e.dataTransfer.getData('macro');
    if (macroId) {
      const macro = macros.find((m) => m.id === macroId);
      if (macro) {
        dispatch({
          type: 'INSTANTIATE_MACRO', macro,
          x: snapToGrid(gx - NODE_W / 2, snapOn),
          y: snapToGrid(gy - 30, snapOn),
        });
      }
      return;
    }
    const kind = e.dataTransfer.getData('kind');
    if (!kind) return;
    dispatch({
      type: 'ADD_NODE', kind,
      x: snapToGrid(gx - NODE_W / 2, snapOn),
      y: snapToGrid(gy - 30, snapOn),
    });
  }, [view, snapOn, macros, dispatch]);

  // -------------------------------------------------------------------------
  // Export / Import
  // -------------------------------------------------------------------------
  const exportJSON = () => {
    const data = { nodes: state.nodes, edges: state.edges, groups: state.groups || [] };
    const json = JSON.stringify(data, null, 2);
    if (onExport) { onExport(json); return; }
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'pyro-graph.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const importInputRef = useRef(null);
  const importJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (onImport) { onImport(data); return; }
        dispatch({ type: 'LOAD', nodes: data.nodes, edges: data.edges, groups: data.groups });
      } catch { /* silent */ }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // -------------------------------------------------------------------------
  // Compile / upload
  // -------------------------------------------------------------------------
  const handleCompile = () => {
    const ir = toLogicGraphIR(state);
    if (onCompile) onCompile(ir);
    else if (window.casper?.upload_logic) window.casper.upload_logic(ir);
  };

  // -------------------------------------------------------------------------
  // Eligible nodes for grouping
  // -------------------------------------------------------------------------
  const eligibleForGroup = useMemo(() => {
    return [...state.selected].filter((id) => {
      const n = state.nodes.find((x) => x.id === id);
      return n && !isPyro(n.kind) && !(state.groups || []).some((g) => g.nodeIds.includes(id));
    });
  }, [state.selected, state.nodes, state.groups]);

  const selectedGroupObj = state.selectedGroup
    ? (state.groups || []).find((g) => g.id === state.selectedGroup)
    : null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div
      style={{
        display: 'flex',
        height,
        background: T.bg,
        border: '1px solid ' + T.border,
        borderRadius: sk.panelRadius,
        overflow: 'hidden',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* ----------------------------------------------------------------- */}
      {/* LEFT — Palette                                                     */}
      {/* ----------------------------------------------------------------- */}
      <Palette
        T={T} scheme={scheme}
        onAdd={(kind) => dispatch({ type: 'ADD_NODE', kind, x: 120, y: 200 })}
        query={query} setQuery={setQuery}
        collapsed={paletteCollapsed}
        onToggle={() => setPaletteCollapsed((s) => !s)}
        macros={macros}
        onMacroDelete={deleteMacro}
      />

      {/* ----------------------------------------------------------------- */}
      {/* CENTER — Canvas area                                               */}
      {/* ----------------------------------------------------------------- */}
      <div
        ref={svgAreaRef}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', background: T.bg }}
      >
        {/* ---- Toolbar ---- */}
        <div style={{
          position: 'absolute', top: 12, left: 12, zIndex: 5,
          display: 'flex', gap: 2, alignItems: 'stretch',
          background: T.bgPanel + 'ee',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid ' + T.border,
          borderRadius: RADIUS.sm,
          padding: 4,
        }}>
          <ToolBtn T={T} onClick={() => dispatch({ type: 'UNDO' })} title="Undo (⌘Z)">↶</ToolBtn>
          <ToolBtn T={T} onClick={() => dispatch({ type: 'REDO' })} title="Redo (⌘⇧Z)">↷</ToolBtn>
          <Sep T={T} />
          <ToolBtn T={T} onClick={() => setView((v) => ({ ...v, k: Math.min(2.5, v.k * 1.2) }))} title="Zoom in">+</ToolBtn>
          <ToolBtn T={T} onClick={() => setView((v) => ({ ...v, k: Math.max(0.2, v.k / 1.2) }))} title="Zoom out">−</ToolBtn>
          <ToolBtn T={T} onClick={() => setView({ x: 0, y: 0, k: 1 })} title="Reset zoom to 100%">100%</ToolBtn>
          <ToolBtn T={T} onClick={zoomToFit} title="Zoom to fit all nodes (⌘F)">Fit</ToolBtn>
          <Sep T={T} />
          <ToolBtn T={T} active={snapOn} onClick={() => setSnapOn((s) => !s)} title={`Snap to ${GRID}px grid`}>
            <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" style={{ display: 'block' }}>
              {[1.5, 4.5, 7.5].flatMap((x) =>
                [1.5, 4.5, 7.5].map((y) => (
                  <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />
                ))
              )}
            </svg>
            SNAP
          </ToolBtn>
          <Sep T={T} />
          <ToolBtn
            T={T}
            active={eligibleForGroup.length >= 2}
            onClick={() => {
              if (eligibleForGroup.length >= 2)
                dispatch({ type: 'CREATE_GROUP', nodeIds: eligibleForGroup });
            }}
            title="Group selected nodes (⌘G)"
          >
            ⊟ Group
          </ToolBtn>
          {selectedGroupObj && (
            <>
              <ToolBtn T={T}
                onClick={() => dispatch({ type: 'TOGGLE_GROUP_COLLAPSED', id: selectedGroupObj.id })}
                title={selectedGroupObj.collapsed ? 'Expand group' : 'Collapse group'}
              >
                {selectedGroupObj.collapsed ? 'Expand' : 'Collapse'}
              </ToolBtn>
              <ToolBtn T={T}
                onClick={() => dispatch({ type: 'UNGROUP', id: selectedGroupObj.id })}
                title="Ungroup (⌘⇧G)"
              >
                Ungroup
              </ToolBtn>
            </>
          )}
          <Sep T={T} />
          <ToolBtn T={T} onClick={() => dispatch({ type: 'CLEAR_CANVAS' })} title="Clear canvas (keeps pyro outputs)">
            Clear
          </ToolBtn>
          <Sep T={T} />
          <ToolBtn T={T} onClick={exportJSON} title="Export graph as JSON">Export</ToolBtn>
          <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
            <ToolBtn T={T}>Import</ToolBtn>
            <input
              ref={importInputRef}
              type="file" accept="application/json"
              style={{ display: 'none' }}
              onChange={importJSON}
            />
          </label>
        </div>

        {/* ---- Sim toggle ---- */}
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 5,
          display: 'flex', gap: 4, alignItems: 'center',
          background: T.bgPanel + 'ee',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid ' + (simActive ? T.accent : T.border),
          borderRadius: RADIUS.sm,
          padding: 4,
        }}>
          {extActive ? (
            <span style={{
              fontFamily: FONT.mono, fontSize: 11, fontWeight: 700,
              color: T.accent, padding: '5px 9px', whiteSpace: 'nowrap',
            }}>
              ▶ OPENROCKET SIM
            </span>
          ) : (
            <ToolBtn T={T} active={simOn} accent
              onClick={() => {
                setSimOn((s) => !s);
                setSimT(0); setSimPlaying(false);
                setFiredLog([]); prevFiredRef.current = {};
              }}>
              {simOn ? '■ Stop' : '▶ Simulate'}
            </ToolBtn>
          )}
          {onCompile && (
            <>
              <Sep T={T} />
              <ToolBtn T={T} onClick={handleCompile} title="Compile and upload to FC">
                UPLOAD TO FC
              </ToolBtn>
            </>
          )}
        </div>

        {/* ---- SVG Canvas ---- */}
        <Canvas
          T={T} scheme={scheme}
          state={state} dispatch={dispatch}
          view={view} setView={setView}
          simValues={simValues}
          validation={validation}
          snapOn={snapOn}
          dragEdge={dragEdge} setDragEdge={setDragEdge}
          dragNode={dragNode} setDragNode={setDragNode}
          dragCp={dragCp} setDragCp={setDragCp}
          dragGroup={dragGroup} setDragGroup={setDragGroup}
          marquee={marquee} setMarquee={setMarquee}
          panning={panning} setPanning={setPanning}
          spaceHeld={spaceHeld}
          onCanvasDrop={onCanvasDrop}
        />

        {/* ---- Status strip ---- */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: SPACE.s2 + 'px ' + SPACE.s3 + 'px',
          background: T.bgPanel + 'ee',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderTop: '1px solid ' + T.border,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: FONT.mono, fontSize: 11, color: T.muted,
          zIndex: 3,
        }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <span>
              <span style={{ color: T.strong, fontWeight: 700 }}>{state.nodes.length}</span> nodes ·{' '}
              <span style={{ color: T.strong, fontWeight: 700 }}>{state.edges.length}</span> edges ·{' '}
              <span style={{ color: T.strong, fontWeight: 700 }}>{(state.groups || []).length}</span> groups
            </span>
            <span style={{ color: validation.cycleEdges.size > 0 ? T.danger : T.accent }}>
              {validation.cycleEdges.size > 0
                ? `⚠ ${validation.cycleEdges.size} cycle(s)`
                : '● no cycles'}
            </span>
            {validation.channels.map((c) => !c.hasStateGate && c.driven && (
              <span key={c.id} style={{ color: T.warn }}>
                ⚠ No state guard on {c.label}
              </span>
            ))}
            <span style={{ color: validation.channels.every((c) => c.driven) ? T.accent : T.warn }}>
              {validation.channels.filter((c) => c.driven).length}/{validation.channels.length} CH driven
            </span>
          </div>
          <div style={{ color: T.faint }}>
            zoom {(view.k * 100).toFixed(0)}% · grid {GRID}px{snapOn ? ' (snap)' : ''} · space to pan · scroll to zoom · click wire to bend
          </div>
        </div>

        {/* ---- Sim drawer ---- */}
        {simActive && simSample && (
          <div style={{
            position: 'absolute', bottom: 28, left: 12, right: 12, zIndex: 4,
            background: T.bgPanel + 'f5',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid ' + T.accent,
            borderRadius: RADIUS.sm,
            padding: SPACE.s2 + 'px ' + SPACE.s3 + 'px',
            boxShadow: sk.showGlow ? `0 0 18px ${T.accent}55` : 'none',
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ToolBtn T={T} accent onClick={() => {
                if (extActive) {
                  if (flightSim.playing) flightSim.pause(); else flightSim.play();
                } else {
                  setSimPlaying((p) => !p);
                }
              }}>
                {(extActive ? flightSim.playing : simPlaying) ? '❚❚' : '▶'}
              </ToolBtn>
              <ToolBtn T={T} onClick={() => {
                setFiredLog([]); prevFiredRef.current = {};
                if (extActive) { flightSim.restart(); }
                else { setSimT(0); setSimPlaying(false); }
              }}>↺</ToolBtn>
              <div style={{ flex: 1, position: 'relative' }}>
                <input
                  type="range" min="0" max={simEndT} step="0.1"
                  value={simTime}
                  onChange={(e) => {
                    if (extActive) flightSim.seek(+e.target.value);
                    else setSimT(+e.target.value);
                  }}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ fontFamily: FONT.mono, fontSize: 12, color: T.strong, fontWeight: 700, minWidth: 100, textAlign: 'right' }}>
                {simSample.phase} · T+{simTime.toFixed(1)}s
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, fontFamily: FONT.mono, fontSize: 10, color: T.muted }}>
              <span>alt <span style={{ color: T.strong, fontWeight: 700 }}>{simSample.alt.toFixed(0)} m</span></span>
              <span>vel <span style={{ color: T.strong, fontWeight: 700 }}>{simSample.vel.toFixed(1)} m/s</span></span>
              <span>mach <span style={{ color: T.strong, fontWeight: 700 }}>{simSample.mach.toFixed(2)}</span></span>
              <span>accel <span style={{ color: T.strong, fontWeight: 700 }}>{simSample.accel.toFixed(1)} m/s²</span></span>
              <span>tilt <span style={{ color: T.strong, fontWeight: 700 }}>{simSample.tilt.toFixed(0)}°</span></span>
            </div>
            {firedLog.length > 0 && (
              <div style={{
                borderTop: '1px solid ' + T.border, paddingTop: 4,
                maxHeight: 70, overflowY: 'auto',
              }}>
                {firedLog.slice().reverse().map((f) => (
                  <div key={f.id} style={{ fontFamily: FONT.mono, fontSize: 10, color: T.danger }}>
                    ● PYRO {f.ch} ({f.role}) fired at T+{f.t.toFixed(2)}s
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---- MiniMap ---- */}
        <MiniMap T={T} state={state} view={view} showGlow={sk.showGlow} />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* RIGHT — Inspector                                                  */}
      {/* ----------------------------------------------------------------- */}
      <Inspector
        T={T} scheme={scheme}
        state={state} dispatch={dispatch}
        collapsed={inspectorCollapsed}
        onToggle={() => setInspectorCollapsed((s) => !s)}
        onSaveAsMacro={saveGroupAsMacro}
      />
    </div>
  );
}

export default PyroEditor;
