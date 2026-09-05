/**
 * FlightChart — a time-series panel for the Debrief tab.
 *
 * Hand-rolled SVG rather than a charting library: MC ships as an offline
 * portable .exe with three runtime dependencies, and a chart library is a
 * large one to add for line plots with a shared X axis.
 *
 * Two things this draws that a naive line chart would not:
 *
 *  - The min/max BAND behind each line. Series arrive decimated (c3_series
 *    buckets ~400 Hz down to ~1400 points), and the peak acceleration of a
 *    flight lasts a handful of samples. The line shows bucket means; the band
 *    shows the true extremes inside each bucket, so a 12 g spike cannot be
 *    averaged into invisibility.
 *  - FSM state bands along the background, so BOOST/COAST/APOGEE/DROGUE are
 *    readable against every trace without a separate timeline widget.
 */
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useTheme } from '../../design/ThemeContext';
import { FONT, SPACE, TYPE, RADIUS } from '../../design/tokens.js';

const PAD = { top: 10, right: 14, bottom: 26, left: 52 };
const HEIGHT = 210;

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

/** Round a range out to "nice" bounds and pick a tick step a human would. */
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
  // Guard the loop on count as well as value: accumulated float error on a
  // tiny step can otherwise run this far past `hi`.
  for (let v = lo, i = 0; v <= hi + step * 0.5 && i < 64; v += step, i++) {
    ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  }
  return { min: lo, max: hi, ticks };
}

function fmt_tick(v) {
  const a = Math.abs(v);
  if (a >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  if (a >= 1) return v.toFixed(1);
  if (a === 0) return '0';
  return v.toFixed(2);
}

/** Distinct, theme-aware series colours. Order matters: the first series in
 *  a panel is the primary one and gets the accent. */
function series_colors(T) {
  return [T.accent, T.info, T.warn, T.danger, T.muted];
}

/** Muted background tints for the FSM state bands. PAD and LANDED stay
 *  neutral so the powered/coasting part of the flight is what stands out. */
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

export default function FlightChart({ group, states, t_min, t_max }) {
  const T = useTheme();
  const host = useRef(null);
  const width = useWidth(host);
  const [hover, setHover] = useState(null);

  const colors = series_colors(T);
  const plot_w = Math.max(80, width - PAD.left - PAD.right);
  const plot_h = HEIGHT - PAD.top - PAD.bottom;

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

  const x_scale = useMemo(() => nice_scale(t_min, t_max, 6), [t_min, t_max]);

  const px = (t) => PAD.left + ((t - x_scale.min) / (x_scale.max - x_scale.min || 1)) * plot_w;
  const py = (v) =>
    PAD.top + plot_h - ((v - y_scale.min) / (y_scale.max - y_scale.min || 1)) * plot_h;

  const paths = useMemo(
    () =>
      group.series.map((s) => {
        let line = '';
        for (let i = 0; i < s.t.length; i++) {
          line += `${i === 0 ? 'M' : 'L'}${px(s.t[i]).toFixed(1)} ${py(s.v[i]).toFixed(1)}`;
        }
        // Band: forward along the highs, back along the lows.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group, y_scale, x_scale, plot_w, plot_h],
  );

  /** Nearest sample per series at the hovered time, for the readout row. */
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
      const j =
        lo > 0 && Math.abs(s.t[lo - 1] - hover) < Math.abs(s.t[lo] - hover) ? lo - 1 : lo;
      return { v: s.v[j], t: s.t[j] };
    });
  }, [hover, group]);

  const on_move = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < PAD.left || x > PAD.left + plot_w) {
      setHover(null);
      return;
    }
    setHover(x_scale.min + ((x - PAD.left) / plot_w) * (x_scale.max - x_scale.min));
  };

  return (
    <div
      ref={host}
      style={{
        background: T.bgPanel,
        border: `1px solid ${T.border}`,
        borderRadius: RADIUS.lg,
        padding: SPACE.s4,
        minWidth: 0,
      }}
    >
      {/* Header: title, unit, legend */}
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
        <div style={{ display: 'flex', gap: SPACE.s3, flexWrap: 'wrap' }}>
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
        </div>
      </div>

      <svg
        width={width}
        height={HEIGHT}
        onMouseMove={on_move}
        onMouseLeave={() => setHover(null)}
        style={{ display: 'block', cursor: 'crosshair' }}
      >
        {/* FSM state bands */}
        {states.map((s, i) => {
          const tint = STATE_TINT[s.name];
          if (!tint || s.t_end <= s.t_start) return null;
          const x0 = px(s.t_start);
          const x1 = px(s.t_end);
          return (
            <rect
              key={`${s.name}-${i}`}
              x={x0}
              y={PAD.top}
              width={Math.max(0, x1 - x0)}
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
        {x_scale.ticks.map((v) => {
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
                y={HEIGHT - 8}
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

        {/* Crosshair */}
        {hover != null && (
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
          textAlign: 'right',
          marginTop: 2,
        }}
      >
        {hover != null ? `t = ${hover.toFixed(2)} s` : 'seconds since first record'}
      </div>
    </div>
  );
}
