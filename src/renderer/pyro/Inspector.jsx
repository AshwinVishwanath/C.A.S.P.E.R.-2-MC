// Inspector.jsx — right sidebar; switches between NodeInspector / EdgeInspector /
// GroupInspectorPanel / GraphHealth based on current selection.
import React from 'react';
import { FONT, SPACE, RADIUS } from '../design/tokens.js';
import { PORT_COLORS, PORT_LABELS, FSM_STATES } from './types.js';
import { getSpec, isPyro } from './spec.js';
import { validateGraph } from './validate.js';
import { Row, TextInput, SelectInput, Segmented, Stepper, CheckRow } from './controls.jsx';
import { Btn } from '../design/components.jsx';

// ---------------------------------------------------------------------------
// Inspector — top-level wrapper; handles collapsed state
// ---------------------------------------------------------------------------
export function Inspector({ T, scheme, state, dispatch, collapsed, onToggle, onSaveAsMacro }) {
  const selectedNode  = state.selected.size === 1
    ? state.nodes.find((n) => state.selected.has(n.id))
    : null;
  const selectedEdge  = state.selectedEdge
    ? state.edges.find((e) => e.id === state.selectedEdge)
    : null;
  const selectedGroup = state.selectedGroup
    ? (state.groups || []).find((g) => g.id === state.selectedGroup)
    : null;

  const validation = validateGraph(state);

  if (collapsed) {
    return (
      <aside style={{
        width: 40, flexShrink: 0,
        background: T.bgPanel,
        borderLeft: '1px solid ' + T.border,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: SPACE.s3 + 'px 0',
      }}>
        <button
          onClick={onToggle}
          title="Expand inspector"
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 8, color: T.muted, transition: 'color 140ms',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = T.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 3l-4 4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div style={{
          writingMode: 'vertical-rl',
          marginTop: SPACE.s3,
          fontFamily: FONT.cond, fontSize: 10, fontWeight: 700,
          letterSpacing: '0.24em', color: T.muted,
          textTransform: 'uppercase',
        }}>
          Inspector
        </div>
        {(selectedNode || selectedEdge) && (
          <span style={{
            marginTop: SPACE.s2,
            width: 6, height: 6, borderRadius: '50%',
            background: T.accent,
          }} />
        )}
      </aside>
    );
  }

  return (
    <aside style={{
      width: 280, flexShrink: 0,
      background: T.bgPanel,
      borderLeft: '1px solid ' + T.border,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: SPACE.s3, borderBottom: '1px solid ' + T.border }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{
            fontFamily: FONT.cond, fontSize: 10, fontWeight: 700,
            color: T.accent, letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>
            INSPECTOR
          </div>
          <button
            onClick={onToggle}
            title="Collapse inspector"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '2px 4px', color: T.muted, transition: 'color 140ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.accent; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.muted; }}
          >
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
              <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 10, color: T.muted, marginTop: 2 }}>
          {selectedNode
            ? 'Node selected'
            : selectedEdge
              ? 'Edge selected'
              : selectedGroup
                ? 'Group selected'
                : 'Graph health'}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: SPACE.s3 }}>
        {selectedNode
          ? <NodeInspector T={T} node={selectedNode} dispatch={dispatch} />
          : selectedEdge
            ? <EdgeInspector T={T} edge={selectedEdge} state={state} dispatch={dispatch} />
            : selectedGroup
              ? <GroupInspectorPanel
                  T={T}
                  group={selectedGroup}
                  memberCount={selectedGroup.nodeIds.length}
                  dispatch={dispatch}
                  onSaveAsMacro={onSaveAsMacro}
                />
              : <GraphHealth T={T} scheme={scheme} state={state} validation={validation} />
        }
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// NodeInspector
// ---------------------------------------------------------------------------
function NodeInspector({ T, node, dispatch }) {
  const spec = getSpec(node);
  if (!spec) return null;
  const set = (key, value) => dispatch({ type: 'UPDATE_PARAM', id: node.id, key, value });

  return (
    <div>
      <Row T={T} label="Node type">
        <div style={{ fontFamily: FONT.sans, fontSize: 13, color: T.strong, fontWeight: 700 }}>
          {spec.label}
        </div>
      </Row>
      {spec.sub && (
        <Row T={T} label="Description">
          <div style={{ fontFamily: FONT.mono, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
            {spec.sub}
          </div>
        </Row>
      )}

      {/* Pyro params */}
      {isPyro(node.kind) && (
        <>
          <Row T={T} label="Role label">
            <TextInput T={T} value={node.params.role} onChange={(v) => set('role', v)} />
          </Row>
          <Row T={T} label="Fire duration">
            <TextInput T={T} value={node.params.duration} type="number"
              onChange={(v) => set('duration', Math.max(1, Math.min(2000, +v)))}
              suffix="ms" />
          </Row>
        </>
      )}

      {/* continuity / armed — channel select */}
      {(node.kind === 'continuity' || node.kind === 'armed') && (
        <Row T={T} label="Channel">
          <SelectInput T={T} value={String(node.params.channel || 1)}
            onChange={(v) => set('channel', +v)}
            options={['1', '2', '3']} />
        </Row>
      )}

      {/* altitude — sensor source */}
      {node.kind === 'altitude' && (
        <Row T={T} label="Sensor source">
          <Segmented T={T} value={node.params.source || 'ekf'} onChange={(v) => set('source', v)}
            options={[
              { value: 'ekf',  label: 'Multi-Sensor', hint: 'EKF · recommended' },
              { value: 'baro', label: 'Barometric',   hint: 'fast · drift on boost' },
              { value: 'gps',  label: 'GPS MSL',      hint: 'slow · drift-free' },
            ]} />
        </Row>
      )}

      {/* fsm_event — event type */}
      {node.kind === 'fsm_event' && (
        <Row T={T} label="Event">
          <Segmented T={T} value={node.params.event || 'apogee'} onChange={(v) => set('event', v)}
            options={[
              { value: 'launch',  label: 'Launch',  hint: 'PAD → BOOST' },
              { value: 'burnout', label: 'Burnout', hint: 'BOOST → COAST' },
              { value: 'apogee',  label: 'Apogee',  hint: 'COAST → APOGEE' },
            ]} />
        </Row>
      )}

      {/* constant — type + value */}
      {node.kind === 'constant' && (
        <>
          <Row T={T} label="Type">
            <Segmented T={T} value={node.params.kind || 'float'} onChange={(v) => set('kind', v)}
              options={[
                { value: 'float', label: 'Float' },
                { value: 'bool',  label: 'Bool' },
              ]} />
          </Row>
          <Row T={T} label="Value">
            {(node.params.kind || 'float') === 'bool'
              ? <SelectInput T={T}
                  value={node.params.value ? 'true' : 'false'}
                  onChange={(v) => set('value', v === 'true')}
                  options={['false', 'true']} />
              : <TextInput T={T} value={node.params.value} type="number"
                  onChange={(v) => set('value', v)} />
            }
          </Row>
        </>
      )}

      {/* and / or — input count */}
      {(node.kind === 'and' || node.kind === 'or') && (
        <Row T={T} label="Input count">
          <Stepper T={T} value={node.params.count || 2} min={2} max={8}
            onChange={(v) => set('count', v)} />
        </Row>
      )}

      {/* thresh — count + op + threshold + hysteresis */}
      {node.kind === 'thresh' && (
        <>
          <Row T={T} label="Input count">
            <Stepper T={T} value={node.params.count || 1} min={1} max={8}
              onChange={(v) => set('count', v)} />
          </Row>
          <Row T={T} label="Operator">
            <SelectInput T={T} value={node.params.op || '>='} onChange={(v) => set('op', v)}
              options={['<', '<=', '>', '>=', '==', '!=']} />
          </Row>
          <Row T={T} label="Threshold">
            <TextInput T={T} value={node.params.threshold} type="number"
              onChange={(v) => set('threshold', +v)} />
          </Row>
          <Row T={T} label="Hysteresis">
            <TextInput T={T} value={node.params.hysteresis} type="number"
              onChange={(v) => set('hysteresis', +v)} />
          </Row>
        </>
      )}

      {/* cmp — op + hysteresis */}
      {node.kind === 'cmp' && (
        <>
          <Row T={T} label="Operator">
            <SelectInput T={T} value={node.params.op || '>='} onChange={(v) => set('op', v)}
              options={['<', '<=', '>', '>=', '==', '!=']} />
          </Row>
          <Row T={T} label="Hysteresis">
            <TextInput T={T} value={node.params.hysteresis} type="number"
              onChange={(v) => set('hysteresis', +v)} />
          </Row>
        </>
      )}

      {/* delay / hold / pulse — duration */}
      {(node.kind === 'delay' || node.kind === 'hold' || node.kind === 'pulse') && (
        <Row T={T} label="Duration">
          <TextInput T={T} value={node.params.duration} type="number"
            onChange={(v) => set('duration', +v)} suffix="ms" />
        </Row>
      )}

      {/* edge — edge type */}
      {node.kind === 'edge' && (
        <Row T={T} label="Edge type">
          <SelectInput T={T} value={node.params.edge || 'rising'} onChange={(v) => set('edge', v)}
            options={['rising', 'falling', 'either']} />
        </Row>
      )}

      {/* lowpass — time constant */}
      {node.kind === 'lowpass' && (
        <Row T={T} label="Time constant τ">
          <TextInput T={T} value={node.params.tau} type="number"
            onChange={(v) => set('tau', +v)} suffix="ms" />
        </Row>
      )}

      {/* fsm_is — single state */}
      {node.kind === 'fsm_is' && (
        <Row T={T} label="FSM state">
          <SelectInput T={T} value={node.params.state || 'APOGEE'} onChange={(v) => set('state', v)}
            options={FSM_STATES} />
        </Row>
      )}

      {/* fsm_in — multi-state checkboxes */}
      {node.kind === 'fsm_in' && (
        <Row T={T} label="FSM states (multi)">
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            padding: 8,
            background: T.bgEl, border: '1px solid ' + T.border, borderRadius: RADIUS.sm,
          }}>
            {FSM_STATES.map((s) => {
              const on = (node.params.states || []).includes(s);
              return (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => {
                      const next = new Set(node.params.states || []);
                      if (e.target.checked) next.add(s); else next.delete(s);
                      set('states', [...next]);
                    }}
                  />
                  <span style={{ fontFamily: FONT.mono, fontSize: 11, color: T.text }}>{s}</span>
                </label>
              );
            })}
          </div>
        </Row>
      )}

      {/* Action buttons */}
      <div style={{
        marginTop: SPACE.s4, paddingTop: SPACE.s3,
        borderTop: '1px solid ' + T.border,
        display: 'flex', gap: SPACE.s2,
      }}>
        {!isPyro(node.kind) && (
          <Btn T={T} kind="ghost" size="xs"
            onClick={() => dispatch({ type: 'DUPLICATE' })}>
            DUPLICATE
          </Btn>
        )}
        {!isPyro(node.kind) && (
          <Btn T={T} kind="danger" size="xs"
            onClick={() => dispatch({ type: 'DELETE_SELECTION' })}>
            DELETE
          </Btn>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EdgeInspector
// ---------------------------------------------------------------------------
function EdgeInspector({ T, edge, state, dispatch }) {
  const fromN = state.nodes.find((n) => n.id === edge.from.node);
  const toN   = state.nodes.find((n) => n.id === edge.to.node);
  const fromSpec = fromN ? getSpec(fromN) : null;
  const toSpec   = toN   ? getSpec(toN)   : null;
  const fromPort = fromSpec && fromSpec.outputs.find((p) => p.id === edge.from.port);
  const toPort   = toSpec   && toSpec.inputs.find((p) => p.id === edge.to.port);

  return (
    <div>
      <Row T={T} label="Source">
        <div style={{ fontFamily: FONT.mono, fontSize: 12, color: T.strong }}>
          {fromSpec && fromSpec.label}
          <span style={{ color: T.muted }}> · {edge.from.port}</span>
        </div>
      </Row>
      <Row T={T} label="Target">
        <div style={{ fontFamily: FONT.mono, fontSize: 12, color: T.strong }}>
          {toSpec && toSpec.label}
          <span style={{ color: T.muted }}> · {edge.to.port}</span>
        </div>
      </Row>
      <Row T={T} label="Signal type">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: PORT_COLORS[fromPort?.type] || T.muted,
            display: 'inline-block',
          }} />
          <span style={{ fontFamily: FONT.mono, fontSize: 12, color: T.strong, fontWeight: 700 }}>
            {PORT_LABELS[fromPort?.type] || fromPort?.type || '—'}
          </span>
          {fromPort?.type !== toPort?.type && toPort?.type && (
            <span style={{ fontFamily: FONT.mono, fontSize: 10, color: T.muted }}>
              → promoted to {PORT_LABELS[toPort.type] || toPort.type}
            </span>
          )}
        </div>
      </Row>

      <div style={{ marginTop: SPACE.s4, paddingTop: SPACE.s3, borderTop: '1px solid ' + T.border }}>
        <div style={{ display: 'flex', gap: SPACE.s2, flexWrap: 'wrap' }}>
          {(edge.cp1 || edge.cp2) && (
            <Btn T={T} kind="ghost" size="xs"
              onClick={() => dispatch({ type: 'RESET_EDGE_CP', id: edge.id })}>
              RESET CURVE
            </Btn>
          )}
          <Btn T={T} kind="danger" size="xs"
            onClick={() => dispatch({ type: 'DELETE_EDGE', id: edge.id })}>
            DISCONNECT
          </Btn>
        </div>
        <div style={{ marginTop: SPACE.s2, fontFamily: FONT.mono, fontSize: 10, color: T.faint, lineHeight: 1.5 }}>
          Drag the diamond handles on the wire to bend the curve.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupInspectorPanel
// ---------------------------------------------------------------------------
export function GroupInspectorPanel({ T, group, memberCount, dispatch, onSaveAsMacro }) {
  return (
    <div>
      <Row T={T} label="Group label">
        <TextInput T={T} value={group.label}
          onChange={(v) => dispatch({ type: 'RENAME_GROUP', id: group.id, label: v })} />
      </Row>
      <Row T={T} label="Members">
        <div style={{ fontFamily: FONT.mono, fontSize: 12, color: T.strong }}>
          {memberCount} nodes
        </div>
      </Row>
      <Row T={T} label="State">
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
          {group.collapsed
            ? 'Collapsed — proxy ports expose every connection that crosses the group boundary.'
            : 'Expanded — drag the dashed frame to select; click the [−] handle to collapse.'}
        </div>
      </Row>

      <div style={{
        marginTop: SPACE.s4, paddingTop: SPACE.s3,
        borderTop: '1px solid ' + T.border,
        display: 'flex', gap: SPACE.s2, flexWrap: 'wrap',
      }}>
        <Btn T={T} kind="ghost" size="xs"
          onClick={() => dispatch({ type: 'TOGGLE_GROUP_COLLAPSED', id: group.id })}>
          {group.collapsed ? 'EXPAND' : 'COLLAPSE'}
        </Btn>
        {onSaveAsMacro && (
          <Btn T={T} kind="primary" size="xs"
            onClick={() => onSaveAsMacro(group.id)}>
            SAVE TO LIBRARY
          </Btn>
        )}
        <Btn T={T} kind="danger" size="xs"
          onClick={() => dispatch({ type: 'UNGROUP', id: group.id })}>
          UNGROUP
        </Btn>
      </div>

      {onSaveAsMacro && (
        <div style={{ marginTop: SPACE.s2, fontFamily: FONT.mono, fontSize: 10, color: T.faint, lineHeight: 1.5 }}>
          Saved macros appear at the top of the palette — drag onto the canvas to instantiate.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GraphHealth
// ---------------------------------------------------------------------------
function GraphHealth({ T, state, validation }) {
  const channelsOK = validation.channels.every((c) => c.driven);
  const hasCycles  = validation.cycleEdges.size > 0;

  return (
    <div>
      <Row T={T} label="Validation">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <CheckRow T={T} ok={!hasCycles}
            label={hasCycles ? `${validation.cycleEdges.size} cycle edge(s)` : 'No cycles'} />
          <CheckRow T={T} ok={validation.unreachable.size === 0} warn
            label={validation.unreachable.size === 0
              ? 'All nodes reachable'
              : `${validation.unreachable.size} unreachable node(s)`} />
          <CheckRow T={T} ok={channelsOK}
            label={channelsOK
              ? 'All channels driven'
              : `${validation.channels.filter((c) => !c.driven).length} channel(s) undriven`} />
        </div>
      </Row>

      <Row T={T} label="Channels">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {validation.channels.map((c) => {
            const node = state.nodes.find((n) => n.id === c.id);
            return (
              <div key={c.id} style={{
                padding: '6px 8px',
                background: T.bgEl,
                border: '1px solid ' + T.border,
                borderLeft: '3px solid ' + (c.driven ? T.accent : T.muted),
                borderRadius: RADIUS.sm,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontFamily: FONT.sans, fontSize: 12, color: T.strong, fontWeight: 700 }}>
                    {c.label}
                  </span>
                  <span style={{ fontFamily: FONT.mono, fontSize: 10, color: c.driven ? T.accent : T.muted }}>
                    {c.driven ? 'DRIVEN' : 'NO INPUT'}
                  </span>
                </div>
                <div style={{ fontFamily: FONT.mono, fontSize: 10, color: T.muted, marginTop: 1 }}>
                  {node?.params?.role || '—'}
                </div>
                {c.driven && !c.hasStateGate && (
                  <div style={{
                    marginTop: 4, padding: '4px 6px',
                    background: T.warnBg, borderRadius: 2,
                    fontFamily: FONT.mono, fontSize: 9, color: T.warn,
                  }}>
                    No flight-state guard — may fire on pad
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Row>

      <Row T={T} label="Graph stats">
        <div style={{ fontFamily: FONT.mono, fontSize: 11, color: T.text, lineHeight: 1.7 }}>
          <div>Nodes: <span style={{ color: T.strong, fontWeight: 700 }}>{state.nodes.length}</span></div>
          <div>Edges: <span style={{ color: T.strong, fontWeight: 700 }}>{state.edges.length}</span></div>
          <div>Groups: <span style={{ color: T.strong, fontWeight: 700 }}>{(state.groups || []).length}</span></div>
        </div>
      </Row>
    </div>
  );
}
