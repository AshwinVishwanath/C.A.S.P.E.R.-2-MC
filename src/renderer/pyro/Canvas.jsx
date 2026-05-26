// Canvas.jsx — SVG canvas with grid, pan/zoom, node/edge/group rendering
import React, { useRef, useCallback, useEffect } from 'react';
import { FONT, SCHEME_PROPS } from '../design/tokens.js';
import { PORT_COLORS } from './types.js';
import { getPortInfo } from './spec.js';
import {
  outputPortPos, inputPortPos, nodeHeight, NODE_W, groupProxyData,
  NODE_PADDING_Y, GROUP_PROXY_HEADER, GROUP_PROXY_PORT_ROW,
} from './geometry.js';
import { Node } from './Node.jsx';
import { Edge } from './Edge.jsx';
import { GroupBox, GroupProxy } from './Group.jsx';

/**
 * Canvas — SVG pan/zoom canvas with full interaction handling.
 *
 * Props:
 *   T                    — theme
 *   scheme               — scheme string
 *   state                — pyro reducer state
 *   dispatch             — dispatch fn
 *   view                 — { x, y, k }
 *   setView              — (v) => void
 *   simValues            — Map | null
 *   validation           — { cycleEdges, unreachable }
 *   snapOn               — boolean
 *   // drag state (lifted to PyroEditor):
 *   dragEdge             — { from, fromType, mouseX, mouseY } | null
 *   setDragEdge
 *   dragNode             — { ids, startGx, startGy, origPositions } | null
 *   setDragNode
 *   dragCp               — { edgeId, which, startGx, startGy, origDx, origDy } | null
 *   setDragCp
 *   dragGroup            — { groupId, startGx, startGy, origPositions } | null
 *   setDragGroup
 *   marquee              — { x0,y0,x1,y1,shift } | null
 *   setMarquee
 *   panning              — { startX, startY, vx, vy } | false
 *   setPanning
 *   spaceHeld            — boolean
 *   onCanvasDrop         — (event) => void
 */
export function Canvas({
  T, scheme, state, dispatch,
  view, setView,
  simValues, validation,
  snapOn,
  dragEdge, setDragEdge,
  dragNode, setDragNode,
  dragCp, setDragCp,
  dragGroup, setDragGroup,
  marquee, setMarquee,
  panning, setPanning,
  spaceHeld,
  onCanvasDrop,
}) {
  const svgRef = useRef(null);
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;
  const showGlow = sk.showGlow;

  // Convert client coords → graph (world) coords
  const toGraph = useCallback((clientX, clientY) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return {
      x: (clientX - r.left - view.x) / view.k,
      y: (clientY - r.top  - view.y) / view.k,
    };
  }, [view]);

  // -------------------------------------------------------------------------
  // Group membership lookups (memoized by callers — passed as derived data)
  // -------------------------------------------------------------------------
  const groups = state.groups || [];

  // Set of nodeIds inside collapsed groups
  const collapsedMemberSet = new Set();
  groups.forEach((g) => { if (g.collapsed) g.nodeIds.forEach((id) => collapsedMemberSet.add(id)); });

  // Map nodeId → collapsed group
  const collapsedGroupByNode = new Map();
  groups.forEach((g) => { if (g.collapsed) g.nodeIds.forEach((id) => collapsedGroupByNode.set(id, g)); });

  // Nodes visible on canvas (not hidden inside collapsed group)
  const visibleNodes = state.nodes.filter((n) => !collapsedMemberSet.has(n.id));

  // Pre-computed proxy data for each collapsed group
  const proxyDataByGroup = new Map();
  groups.forEach((g) => {
    if (g.collapsed) proxyDataByGroup.set(g.id, groupProxyData(g, state.nodes, state.edges));
  });

  // -------------------------------------------------------------------------
  // Mouse handlers
  // -------------------------------------------------------------------------
  // Native non-passive wheel listener — prevents page scroll while cursor is over the canvas.
  // React's synthetic onWheel is passive by default; e.preventDefault() there is a no-op.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handleWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setView((v) => {
        const nk = Math.max(0.2, Math.min(2.5, v.k * factor));
        const nx = mx - (mx - v.x) * (nk / v.k);
        const ny = my - (my - v.y) * (nk / v.k);
        return { x: nx, y: ny, k: nk };
      });
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [setView]);

  const onCanvasMouseDown = (e) => {
    // Middle-mouse or space-hold → pan
    if (e.button === 1 || spaceHeld) {
      setPanning({ startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y });
      e.preventDefault();
      return;
    }
    // Background click → start marquee / clear selection
    const isBg = e.target === svgRef.current || e.target.getAttribute('data-bg') === '1';
    if (isBg) {
      const p = toGraph(e.clientX, e.clientY);
      setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, shift: e.shiftKey });
      if (!e.shiftKey) dispatch({ type: 'SELECT', ids: [] });
    }
  };

  const onMouseMove = (e) => {
    if (panning) {
      setView((v) => ({
        ...v,
        x: panning.vx + (e.clientX - panning.startX),
        y: panning.vy + (e.clientY - panning.startY),
      }));
      return;
    }
    if (dragNode) {
      const p  = toGraph(e.clientX, e.clientY);
      const dx = p.x - dragNode.startGx;
      const dy = p.y - dragNode.startGy;
      const positions = {};
      dragNode.origPositions.forEach((orig, id) => {
        positions[id] = {
          x: snapOn ? Math.round((orig.x + dx) / 20) * 20 : orig.x + dx,
          y: snapOn ? Math.round((orig.y + dy) / 20) * 20 : orig.y + dy,
        };
      });
      dispatch({ type: 'MOVE_NODES_TO', positions });
    }
    if (dragGroup) {
      const p  = toGraph(e.clientX, e.clientY);
      const dx = p.x - dragGroup.startGx;
      const dy = p.y - dragGroup.startGy;
      const positions = {};
      dragGroup.origPositions.forEach((orig, id) => {
        positions[id] = {
          x: snapOn ? Math.round((orig.x + dx) / 20) * 20 : orig.x + dx,
          y: snapOn ? Math.round((orig.y + dy) / 20) * 20 : orig.y + dy,
        };
      });
      dispatch({ type: 'MOVE_GROUP_NODES_TO', positions });
    }
    if (dragCp) {
      const p  = toGraph(e.clientX, e.clientY);
      const dx = p.x - dragCp.startGx;
      const dy = p.y - dragCp.startGy;
      dispatch({
        type: 'UPDATE_EDGE_CP', id: dragCp.edgeId, which: dragCp.which,
        value: { dx: dragCp.origDx + dx, dy: dragCp.origDy + dy },
      });
    }
    if (dragEdge) {
      const p = toGraph(e.clientX, e.clientY);
      setDragEdge({ ...dragEdge, mouseX: p.x, mouseY: p.y });
    }
    if (marquee) {
      const p = toGraph(e.clientX, e.clientY);
      setMarquee({ ...marquee, x1: p.x, y1: p.y });
    }
  };

  const onMouseUp = (e) => {
    if (panning)   setPanning(false);
    if (dragNode)  { dispatch({ type: 'COMMIT_MOVE' }); setDragNode(null); }
    if (dragGroup) { dispatch({ type: 'COMMIT_MOVE' }); setDragGroup(null); }
    if (dragCp)    { dispatch({ type: 'COMMIT_EDGE_CP' }); setDragCp(null); }
    if (dragEdge)  setDragEdge(null);

    if (marquee) {
      const x0 = Math.min(marquee.x0, marquee.x1), x1 = Math.max(marquee.x0, marquee.x1);
      const y0 = Math.min(marquee.y0, marquee.y1), y1 = Math.max(marquee.y0, marquee.y1);
      const selectedIds = state.nodes.filter((n) => {
        if (collapsedMemberSet.has(n.id)) return false;
        const h = nodeHeight(n);
        return n.x < x1 && n.x + NODE_W > x0 && n.y < y1 && n.y + h > y0;
      }).map((n) => n.id);

      if (marquee.shift) {
        dispatch({ type: 'SELECT', ids: [...state.selected, ...selectedIds] });
      } else if (Math.abs(marquee.x1 - marquee.x0) > 4 || Math.abs(marquee.y1 - marquee.y0) > 4) {
        dispatch({ type: 'SELECT', ids: selectedIds });
      }
      setMarquee(null);
    }
  };

  // Node drag
  const onNodeMouseDown = (e, node) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = toGraph(e.clientX, e.clientY);
    let ids = state.selected;
    if (!ids.has(node.id)) {
      const newSel = e.shiftKey ? new Set([...ids, node.id]) : new Set([node.id]);
      dispatch({ type: 'SELECT', ids: [...newSel] });
      ids = newSel;
    }
    const origPositions = new Map();
    state.nodes.forEach((n) => { if (ids.has(n.id)) origPositions.set(n.id, { x: n.x, y: n.y }); });
    setDragNode({ ids, startGx: p.x, startGy: p.y, origPositions });
  };

  // Proxy (collapsed group) drag
  const onProxyMouseDown = (e, group) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = toGraph(e.clientX, e.clientY);
    if (state.selectedGroup !== group.id) dispatch({ type: 'SELECT_GROUP', id: group.id });
    const origPositions = new Map();
    state.nodes.forEach((n) => {
      if (group.nodeIds.includes(n.id)) origPositions.set(n.id, { x: n.x, y: n.y });
    });
    setDragGroup({ groupId: group.id, startGx: p.x, startGy: p.y, origPositions });
  };

  // Edge CP drag
  const onCpDown = (edgeId, which, e) => {
    const p    = toGraph(e.clientX, e.clientY);
    const edge = state.edges.find((ed) => ed.id === edgeId);
    if (!edge) return;
    const fromN = state.nodes.find((n) => n.id === edge.from.node);
    const toN   = state.nodes.find((n) => n.id === edge.to.node);
    if (!fromN || !toN) return;
    const p1 = outputPortPos(fromN, edge.from.port);
    const p2 = inputPortPos(toN, edge.to.port);
    const defaultBend = Math.max(40, Math.abs(p2.x - p1.x) * 0.5);
    const def = which === 'cp1' ? { dx: defaultBend, dy: 0 } : { dx: -defaultBend, dy: 0 };
    const cur = edge[which] || def;
    if (state.selectedEdge !== edgeId) dispatch({ type: 'SELECT_EDGE', id: edgeId });
    setDragCp({ edgeId, which, startGx: p.x, startGy: p.y, origDx: cur.dx, origDy: cur.dy });
  };

  // Port mouse handlers
  const onPortDown = (nodeId, portId, side, type, e) => {
    if (side !== 'out') return;
    const p = toGraph(e.clientX, e.clientY);
    setDragEdge({ from: { node: nodeId, port: portId }, fromType: type, mouseX: p.x, mouseY: p.y });
  };
  const onPortUp = (nodeId, portId, side, type, e) => {
    if (!dragEdge) return;
    if (side !== 'in') return;
    // Basic type compatibility check (bool→bool, float→float, int→float)
    const ft = dragEdge.fromType;
    const ok = ft === type || (type === 'float' && ft === 'int');
    if (!ok) return;
    if (dragEdge.from.node === nodeId) return; // no self-loop
    dispatch({ type: 'ADD_EDGE', from: dragEdge.from, to: { node: nodeId, port: portId } });
    setDragEdge(null);
  };

  // Context menu on node (right-click)
  const onNodeContextMenu = (e, node) => {
    e.preventDefault();
    // Provide inline context actions via selection; full context menu in PyroEditor
    dispatch({ type: 'SELECT', ids: [node.id] });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <svg
      ref={svgRef}
      width="100%" height="100%"
      onMouseDown={onCanvasMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onCanvasDrop}
      style={{
        display: 'block',
        cursor: panning ? 'grabbing' : spaceHeld ? 'grab' : 'default',
      }}
    >
      <defs>
        {/* Minor grid — 20px dots */}
        <pattern
          id="cmcDotGrid" x="0" y="0" width="20" height="20"
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${view.x % (20 * view.k)} ${view.y % (20 * view.k)}) scale(${view.k})`}
        >
          <circle cx="10" cy="10" r="0.9" fill={T.gridLine} opacity="0.7" />
        </pattern>
        {/* Major grid — 100px dots + crosshair lines */}
        <pattern
          id="cmcDotGridMajor" x="0" y="0" width="100" height="100"
          patternUnits="userSpaceOnUse"
          patternTransform={`translate(${view.x % (100 * view.k)} ${view.y % (100 * view.k)}) scale(${view.k})`}
        >
          <circle cx="50" cy="50" r="1.8" fill={T.gridLine} opacity="1" />
          <line x1="0" y1="50" x2="100" y2="50" stroke={T.gridLine} strokeWidth="0.4" opacity="0.35" />
          <line x1="50" y1="0" x2="50" y2="100" stroke={T.gridLine} strokeWidth="0.4" opacity="0.35" />
        </pattern>
      </defs>

      {/* Grid background */}
      <rect data-bg="1" width="100%" height="100%" fill="url(#cmcDotGrid)" />
      <rect data-bg="1" width="100%" height="100%" fill="url(#cmcDotGridMajor)" pointerEvents="none" />

      {/* World group — all graph content with pan/zoom transform */}
      <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>

        {/* Expanded group dashed frames (behind nodes) */}
        {groups.filter((g) => !g.collapsed).map((g) => (
          <GroupBox
            key={g.id} T={T} scheme={scheme}
            group={g} nodes={state.nodes}
            selected={state.selectedGroup === g.id}
            onSelect={() => dispatch({ type: 'SELECT_GROUP', id: g.id })}
            onToggleCollapse={() => dispatch({ type: 'TOGGLE_GROUP_COLLAPSED', id: g.id })}
          />
        ))}

        {/* Edges */}
        {state.edges.map((edge) => {
          const fromG = collapsedGroupByNode.get(edge.from.node);
          const toG   = collapsedGroupByNode.get(edge.to.node);
          // Hide edges fully inside one collapsed group
          if (fromG && toG && fromG.id === toG.id) return null;

          // Resolve endpoint positions (through proxy if applicable)
          let p1, p2, edgeType, edgeColor;

          if (fromG) {
            const pd = proxyDataByGroup.get(fromG.id);
            if (!pd) return null;
            const key = `${edge.from.node}__${edge.from.port}`;
            const entry = pd.outEntries.find((en) => en.key === key);
            if (!entry) return null;
            edgeType  = entry.type;
            edgeColor = PORT_COLORS[edgeType];
            // Compute proxy port position
            const idx = pd.outEntries.indexOf(entry);
            p1 = { x: pd.x + pd.w, y: pd.y + GROUP_PROXY_HEADER + NODE_PADDING_Y / 4 + idx * GROUP_PROXY_PORT_ROW + GROUP_PROXY_PORT_ROW / 2 };
          } else {
            const fromN = state.nodes.find((n) => n.id === edge.from.node);
            if (!fromN) return null;
            const { port } = getPortInfo(fromN, edge.from.port, 'out');
            if (!port) return null;
            p1 = outputPortPos(fromN, edge.from.port);
            edgeType  = port.type;
            edgeColor = PORT_COLORS[port.type];
          }

          if (toG) {
            const pd = proxyDataByGroup.get(toG.id);
            if (!pd) return null;
            const key = `${edge.to.node}__${edge.to.port}`;
            const entry = pd.inEntries.find((en) => en.key === key);
            if (!entry) return null;
            const idx = pd.inEntries.indexOf(entry);
            p2 = { x: pd.x, y: pd.y + GROUP_PROXY_HEADER + NODE_PADDING_Y / 4 + idx * GROUP_PROXY_PORT_ROW + GROUP_PROXY_PORT_ROW / 2 };
          } else {
            const toN = state.nodes.find((n) => n.id === edge.to.node);
            if (!toN) return null;
            const { port } = getPortInfo(toN, edge.to.port, 'in');
            if (!port) return null;
            p2 = inputPortPos(toN, edge.to.port);
          }

          return (
            <Edge
              key={edge.id} T={T} scheme={scheme}
              edge={edge} nodes={state.nodes}
              selected={state.selectedEdge === edge.id}
              simValues={simValues}
              isCycle={validation.cycleEdges.has(edge.id)}
              showGlow={showGlow}
              onCpDown={onCpDown}
              onSelect={() => dispatch({ type: 'SELECT_EDGE', id: edge.id })}
              onDelete={() => dispatch({ type: 'DELETE_EDGE', id: edge.id })}
              p1={p1} p2={p2} edgeType={edgeType} edgeColor={edgeColor}
            />
          );
        })}

        {/* Drag-edge ghost */}
        {dragEdge && (() => {
          const fromN = state.nodes.find((n) => n.id === dragEdge.from.node);
          if (!fromN) return null;
          const p1 = outputPortPos(fromN, dragEdge.from.port);
          const p2 = { x: dragEdge.mouseX, y: dragEdge.mouseY };
          const dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.5);
          const d  = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;
          const c  = PORT_COLORS[dragEdge.fromType] || T.accent;
          return (
            <path
              d={d} stroke={c} strokeWidth="2"
              strokeDasharray="4 4" fill="none"
              vectorEffect="non-scaling-stroke" pointerEvents="none" opacity="0.7"
            />
          );
        })()}

        {/* Visible nodes (not inside collapsed groups) */}
        {visibleNodes.map((n) => (
          <Node
            key={n.id} T={T} scheme={scheme}
            node={n}
            selected={state.selected.has(n.id)}
            unreachable={validation.unreachable.has(n.id)}
            simValues={simValues}
            onPortDown={onPortDown}
            onPortUp={onPortUp}
            onMouseDown={onNodeMouseDown}
            onContextMenu={onNodeContextMenu}
          />
        ))}

        {/* Collapsed group proxies */}
        {groups.filter((g) => g.collapsed).map((g) => {
          const pd = proxyDataByGroup.get(g.id);
          if (!pd) return null;
          return (
            <GroupProxy
              key={g.id} T={T} scheme={scheme}
              group={g} proxyData={pd}
              selected={state.selectedGroup === g.id}
              simValues={simValues}
              onMouseDown={onProxyMouseDown}
              onSelect={() => dispatch({ type: 'SELECT_GROUP', id: g.id })}
              onToggleCollapse={() => dispatch({ type: 'TOGGLE_GROUP_COLLAPSED', id: g.id })}
              onPortDown={onPortDown}
              onPortUp={onPortUp}
            />
          );
        })}

        {/* Marquee selection rect */}
        {marquee && (() => {
          const mx = Math.min(marquee.x0, marquee.x1);
          const my = Math.min(marquee.y0, marquee.y1);
          const mw = Math.abs(marquee.x1 - marquee.x0);
          const mh = Math.abs(marquee.y1 - marquee.y0);
          return (
            <rect
              x={mx} y={my} width={mw} height={mh}
              fill={T.accent} fillOpacity="0.08"
              stroke={T.accent} strokeWidth="1" strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke" pointerEvents="none"
            />
          );
        })()}
      </g>
    </svg>
  );
}

// Expose svgRef to parent via callback ref pattern
Canvas.displayName = 'Canvas';

export default Canvas;
