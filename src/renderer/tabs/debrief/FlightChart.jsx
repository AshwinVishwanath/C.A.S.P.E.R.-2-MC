/**
 * FlightChart — a time-series panel for the Debrief tab.
 *
 * Hand-rolled SVG rather than a charting library: MC ships as an offline
 * portable .exe with three runtime dependencies, and a chart library is a
 * large one to add for line plots with a shared X axis.
 *
 * Things this draws that a naive line chart would not:
 *
 *  - The min/max BAND behind each line. Series arrive decimated (c3_series
 *    buckets the full record rate down to ~1400 points), and the peak
 *    acceleration of a flight lasts a handful of samples. The line shows
 *    bucket means; the band shows the true extremes inside each bucket, so a
 *    12 g spike cannot be averaged into invisibility.
 *  - FSM state bands along the background, so BOOST/COAST/APOGEE/DROGUE are
 *    readable against every trace without a separate timeline widget.
 *
 * Interaction:
 *  - Drag left/right across the plot to select a time range. The range is
 *    lifted to the tab and applied to EVERY chart, and the main process
 *    re-decimates the records inside it, so zooming in reveals real detail
 *    instead of stretching the points the chart already had.
 *  - Double-click clears the zoom.
 *  - The expand button fills the window with this one chart.
 */
import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../design/ThemeContext';
import { Icon } from '../../design/icons.jsx';
import { FONT, SPACE, TYPE, RADIUS } from '../../design/tokens.js';

const PAD = { top: 10, right: 14, bottom: 26, left: 52 };
const DEFAULT_HEIGHT = 210;
/** Below this many pixels a drag is treated as a click, not a selection. */
const MIN_DRAG_PX = 5;

/** Track a container's width so the SVG can be sized in real pixels — a
 *  viewBox scale would stretch the type along with the plot. */
function useWidth(ref, fallback = 720) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect?.width;
      if (next && Math.abs(next - w) > 1) setW(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, w]);
  return w;
}

/** Round a range OUTWARD to nice bounds. Used for Y, where a little padding
 *  above the peak is what you want. */
function nice_scale(min, max, target_ticks = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) {
    const pad = Math.abs(min) > 1e-9 ? Math.abs(min) * 0.1 : 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / target_ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  // Guard on count as well as value: accumulated float error on a tiny step
  // can otherwise run this far past `hi`.
  for (let v = lo, i = 0; v <= hi + step * 0.5 && i < 64; v += step, i++) {
    ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  }
  return { min: lo, max: hi, ticks };
}

/** Nice ticks strictly INSIDE [min, max], leaving the domain untouched. The X
 *  domain must stay exactly what the operator selected — rounding it outward
 *  would silently widen every zoom. */
function ticks_within(min, max, target = 6) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const raw = (max - min) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const out = [];
  const first = Math.ceil(min / step) * step;
  for (let v = first, i = 0; v <= max + step * 1e-6 && i < 64; v += step, i++) {
    out.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  }
  return out;
}

function fmt_tick(v) {
  const a = Math.abs(v);
  if (a >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  if (a === 0) return '0';
  if (a >= 0.01) return v.toFixed(2);
  return v.toExponential(1);
}

/** Distinct, theme-aware series colours. The first series in a panel is the
 *  primary one and gets the accent. */
function series_colors(T) {
  return [T.accent, T.info, T.warn, T.danger, T.muted];
}

/** Muted background tints for the FSM state bands. PAD and LANDED stay
 *  neutral so the powered and descending parts are what stand out. */
const STATE_TINT = {
  BOOST: 'warn',
  SUSTAIN: 'warn',
  APOGEE: 'info',
  DROGUE: 'info',
  MAIN: 'accent',
  RECOVERY: 'accent',
  TUMBLE: 'danger',
  GND_TEST: 'danger',
};

export default function FlightChart({
  group,
  states,
  t_min,
  t_max,
  onBrush,
  zoomed,
  expanded = false,
  onToggleExpand,
  height = DEFAULT_HEIGHT,
}) {
  const T = useTheme();
  const host = useRef(null);
  const svg_ref = useRef(null);
  const width = useWidth(host);
  const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(null); // { x0, x1 } in px

  const colors = series_colors(T);
  const plot_w = Math.max(80, width - PAD.left - PAD.right);
  const plot_h = Math.max(60, height - PAD.top - PAD.bottom);

  const y_scale = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const s of group.series) {
      for (let i = 0; i < s.v.length; i++) {
        if (s.lo[i] < min) min = s.lo[i];
        if (s.hi[i] > max) max = s.hi[i];
      }
    }
    return nice_scale(min, max);
  }, [group]);

  // X domain is EXACT; only the tick positions are prettified.
  const x_ticks = useMemo(() => ticks_within(t_min, t_max), [t_min, t_max]);
  const span = t_max - t_min || 1;

  const px = useCallback((t) => PAD.left + ((t - t_min) / span) * plot_w, [t_min, span, plot_w]);
  const py = useCallback(
    (v) => PAD.top + plot_h - ((v - y_scale.min) / (y_scale.max - y_scale.min || 1)) * plot_h,
    [y_scale, plot_h],
  );
  const time_at = useCallback(
    (x) => t_min + ((x - PAD.left) / plot_w) * span,
    [t_min, span, plot_w],
  );

  const paths = useMemo(
    () =>
      group.series.map((s) => {
        let line = '';
        for (let i = 0; i < s.t.length; i++) {
          line += `${i === 0 ? 'M' : 'L'}${px(s.t[i]).toFixed(1)} ${py(s.v[i]).toFixed(1)}`;
        }
        let band = '';
        for (let i = 0; i < s.t.length; i++) {
          band += `${i === 0 ? 'M' : 'L'}${px(s.t[i]).toFixed(1)} ${py(s.hi[i]).toFixed(1)}`;
        }
        for (let i = s.t.length - 1; i >= 0; i--) {
          band += `L${px(s.t[i]).toFixed(1)} ${py(s.lo[i]).toFixed(1)}`;
        }
        if (band) band += 'Z';
        return { line, band };
      }),
    [group, px, py],
  );

  /** Nearest sample per series at the hovered time, for the legend readout. */
  const readout = useMemo(() => {
    if (hover == null) return null;
    return group.series.map((s) => {
      if (s.t.length === 0) return null;
      let lo = 0;
      let hi = s.t.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (s.t[mid] < hover) lo = mid + 1;
        else hi = mid;
      }
      const j = lo > 0 && Math.abs(s.t[lo - 1] - hover) < Math.abs(s.t[lo] - hover) ? lo - 1 : lo;
      return { v: s.v[j], t: s.t[j] };
    });
  }, [hover, group]);

  const local_x = (e) => {
    const rect = svg_ref.current?.getBoundingClientRect();
    if (!rect) return null;
    return Math.min(PAD.left + plot_w, Math.max(PAD.left, e.clientX - rect.left));
  };

  // Finish the drag on window mouseup, not the SVG's: releasing outside the
  // plot is normal when selecting right up to an edge, and an unfinished drag
  // would otherwise stick.
  useEffect(() => {
    if (!drag) return undefined;
    const finish = (e) => {
      const x = local_x(e);
      const x1 = x == null ? drag.x1 : x;
      setDrag(null);
      if (Math.abs(x1 - drag.x0) < MIN_DRAG_PX) return;
      const a = time_at(Math.min(drag.x0, x1));
      const b = time_at(Math.max(drag.x0, x1));
      onBrush?.({ t0: a, t1: b });
    };
    const move = (e) => {
      const x = local_x(e);
      if (x != null) setDrag((d) => (d ? { ...d, x1: x } : d));
    };
    window.addEventListener('mouseup', finish);
    window.addEventListener('mousemove', move);
    return () => {
      window.removeEventListener('mouseup', finish);
      window.removeEventListener('mousemove', move);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, time_at, onBrush, plot_w]);

  const on_down = (e) => {
    if (e.button !== 0) return;
    const x = local_x(e);
    if (x == null) return;
    e.preventDefault(); // stop the browser starting a text selection
    setDrag({ x0: x, x1: x });
  };

  const on_move = (e) => {
    const rect = svg_ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    if (x < PAD.left || x > PAD.left + plot_w) setHover(null);
    else setHover(time_at(x));
  };

  const sel = drag
    ? { x: Math.min(drag.x0, drag.x1), w: Math.abs(drag.x1 - drag.x0) }
    : null;

  return (
    <div
      ref={host}
      style={{
        background: T.bgPanel,
        border: `1px solid ${T.border}`,
        borderRadius: RADIUS.lg,
        padding: SPACE.s4,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        height: expanded ? '100%' : undefined,
      }}
    >
      {/* Header: title, unit, legend, expand */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: SPACE.s3,
          marginBottom: SPACE.s2,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.s2, minWidth: 0 }}>
          <span
            style={{
              font: `600 ${TYPE.body}px ${FONT.sans}`,
              color: T.strong,
              whiteSpace: 'nowrap',
            }}
          >
            {group.title}
          </span>
          <span style={{ font: `400 ${TYPE.cap}px ${FONT.mono}`, color: T.muted }}>
            {group.unit}
          </span>
        </div>

        <div style={{ display: 'flex', gap: SPACE.s3, flexWrap: 'wrap', alignItems: 'center' }}>
          {group.series.map((s, i) => (
            <span
              key={s.key}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                font: `400 ${TYPE.micro}px ${FONT.mono}`,
                color: T.muted,
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 2,
                  background: colors[i % colors.length],
                  borderRadius: 2,
                }}
              />
              {s.label}
              {readout && readout[i] != null && (
                <span style={{ color: T.strong }}>{fmt_tick(readout[i].v)}</span>
              )}
            </span>
          ))}

          <button
            onClick={() => onToggleExpand?.(group.key)}
            title={expanded ? 'Exit full screen (Esc)' : 'Full screen'}
            aria-label={expanded ? 'Exit full screen' : 'Full screen'}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              background: 'transparent',
              border: `1px solid ${T.border}`,
              borderRadius: RADIUS.sm,
              color: T.muted,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <Icon name={expanded ? 'collapse' : 'expand'} size={12} />
          </button>
        </div>
      </div>

      <svg
        ref={svg_ref}
        width={width}
        height={height}
        onMouseDown={on_down}
        onMouseMove={on_move}
        onMouseLeave={() => setHover(null)}
        onDoubleClick={() => onBrush?.(null)}
        style={{
          display: 'block',
          cursor: drag ? 'ew-resize' : 'crosshair',
          userSelect: 'none',
          flex: expanded ? 1 : undefined,
        }}
      >
        {/* FSM state bands */}
        {states.map((s, i) => {
          const tint = STATE_TINT[s.name];
          if (!tint || s.t_end <= s.t_start) return null;
          const x0 = Math.max(PAD.left, px(s.t_start));
          const x1 = Math.min(PAD.left + plot_w, px(s.t_end));
          if (x1 <= x0) return null;
          return (
            <rect
              key={`${s.name}-${i}`}
              x={x0}
              y={PAD.top}
              width={x1 - x0}
              height={plot_h}
              fill={T[tint]}
              opacity={0.08}
            />
          );
        })}

        {/* Y grid + labels */}
        {y_scale.ticks.map((v) => {
          const y = py(v);
          if (y < PAD.top - 1 || y > PAD.top + plot_h + 1) return null;
          return (
            <g key={`y${v}`}>
              <line
                x1={PAD.left}
                x2={PAD.left + plot_w}
                y1={y}
                y2={y}
                stroke={T.gridLine}
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y + 3}
                textAnchor="end"
                style={{ font: `400 10px ${FONT.mono}`, fill: T.faint }}
              >
                {fmt_tick(v)}
              </text>
            </g>
          );
        })}

        {/* X grid + labels */}
        {x_ticks.map((v) => {
          const x = px(v);
          if (x < PAD.left - 1 || x > PAD.left + plot_w + 1) return null;
          return (
            <g key={`x${v}`}>
              <line
                x1={x}
                x2={x}
                y1={PAD.top}
                y2={PAD.top + plot_h}
                stroke={T.gridLine}
                strokeWidth={1}
              />
              <text
                x={x}
                y={height - 8}
                textAnchor="middle"
                style={{ font: `400 10px ${FONT.mono}`, fill: T.faint }}
              >
                {fmt_tick(v)}
              </text>
            </g>
          );
        })}

        {/* Bands then lines, so a line is never hidden by its own band */}
        {paths.map((p, i) =>
          p.band ? (
            <path
              key={`band${i}`}
              d={p.band}
              fill={colors[i % colors.length]}
              opacity={0.16}
              stroke="none"
            />
          ) : null,
        )}
        {paths.map((p, i) => (
          <path
            key={`line${i}`}
            d={p.line}
            fill="none"
            stroke={colors[i % colors.length]}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        ))}

        {/* Drag selection */}
        {sel && sel.w > 0 && (
          <>
            <rect
              x={sel.x}
              y={PAD.top}
              width={sel.w}
              height={plot_h}
              fill={T.accent}
              opacity={0.14}
            />
            <line x1={sel.x} x2={sel.x} y1={PAD.top} y2={PAD.top + plot_h} stroke={T.accent} />
            <line
              x1={sel.x + sel.w}
              x2={sel.x + sel.w}
              y1={PAD.top}
              y2={PAD.top + plot_h}
              stroke={T.accent}
            />
          </>
        )}

        {/* Crosshair */}
        {hover != null && !drag && (
          <line
            x1={px(hover)}
            x2={px(hover)}
            y1={PAD.top}
            y2={PAD.top + plot_h}
            stroke={T.borderStrong}
            strokeWidth={1}
          />
        )}

        {/* Axis frame */}
        <line
          x1={PAD.left}
          x2={PAD.left + plot_w}
          y1={PAD.top + plot_h}
          y2={PAD.top + plot_h}
          stroke={T.border}
        />
        <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + plot_h} stroke={T.border} />
      </svg>

      <div
        style={{
          font: `400 ${TYPE.micro}px ${FONT.mono}`,
          color: T.faint,
          display: 'flex',
          justifyContent: 'space-between',
          gap: SPACE.s2,
          marginTop: 2,
        }}
      >
        <span>
          {drag
            ? `${time_at(Math.min(drag.x0, drag.x1)).toFixed(2)} – ${time_at(
                Math.max(drag.x0, drag.x1),
              ).toFixed(2)} s`
            : zoomed
              ? 'drag to re-zoom · double-click to reset'
              : 'drag to zoom all charts'}
        </span>
        <span>{hover != null ? `t = ${hover.toFixed(3)} s` : 'seconds since first record'}</span>
      </div>
    </div>
  );
}
