/**
 * DebriefTab — pull a Casper-3 flight off the FC and read it.
 *
 * The whole tab is one flow: connect the FC over USB, press Download, get a
 * .bin on disk and charts on screen. Nothing here needs the ground station —
 * this is a direct FC link, which is why it does not care about `gs_connected`.
 *
 * The .bin is written before anything is decoded and its path is shown with a
 * Reveal button, because that file is the only copy of the flight data off
 * the chip and a decoder problem must never cost a re-dump.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '../design/ThemeContext';
import { Cap, Pill, Panel, Btn, StatTile, Toggle } from '../design/components.jsx';
import { FONT, SPACE, TYPE, RADIUS } from '../design/tokens.js';
import FlightChart from './debrief/FlightChart.jsx';

const fmt_bytes = (n) => {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};

const fmt_secs = (s) => {
  if (!Number.isFinite(s) || s < 0) return '—';
  if (s < 60) return `${s.toFixed(0)} s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
};

const num = (v, digits = 1, unit = '') =>
  v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(digits)}${unit}`;

export default function DebriefTab({ serial }) {
  const T = useTheme();
  const api = typeof window !== 'undefined' ? window.casper : undefined;

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [load, setLoad] = useState(null); // DebriefLoadResult
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // flight_id
  const [detail, setDetail] = useState(null);
  const [includePrelaunch, setIncludePrelaunch] = useState(false);

  // Progress subscription lives for the life of the tab: a dump takes minutes
  // and subscribing only while `busy` would race the first event.
  useEffect(() => {
    if (!api?.on_debrief_progress) return undefined;
    return api.on_debrief_progress((p) => setProgress(p));
  }, [api]);

  const load_flight = useCallback(
    async (flight_id) => {
      if (!api?.debrief_flight) return;
      setSelected(flight_id);
      setDetail(null);
      const res = await api.debrief_flight(flight_id);
      if (res?.ok) setDetail(res);
      else setError(res?.error ?? 'Could not decode that flight.');
    },
    [api],
  );

  /** Shared post-load path for both Download and Open. */
  const accept_load = useCallback(
    (res) => {
      if (!res?.ok) {
        if (!res?.cancelled) setError(res?.error ?? 'Load failed.');
        return;
      }
      setLoad(res);
      setError(null);
      if (res.flights.length > 0) load_flight(res.flights[0].flight_id);
      else setDetail(null);
    },
    [load_flight],
  );

  const on_download = async () => {
    if (!api?.debrief_download) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      accept_load(await api.debrief_download({ include_prelaunch: includePrelaunch }));
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const on_open = async () => {
    if (!api?.debrief_open) return;
    setBusy(true);
    try {
      accept_load(await api.debrief_open());
    } catch (err) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  };

  const stats = detail?.series?.stats;
  const groups = detail?.series?.groups ?? [];
  const states = detail?.series?.states ?? [];

  const t_bounds = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const g of groups) {
      for (const s of g.series) {
        if (s.t.length === 0) continue;
        if (s.t[0] < lo) lo = s.t[0];
        if (s.t[s.t.length - 1] > hi) hi = s.t[s.t.length - 1];
      }
    }
    return Number.isFinite(lo) ? { lo, hi } : { lo: 0, hi: 1 };
  }, [groups]);

  const pct =
    progress && progress.bytes_total > 0
      ? Math.min(100, (progress.bytes_done / progress.bytes_total) * 100)
      : 0;

  const warnings = detail?.warnings ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.s4, minWidth: 0 }}>
      {/* ---------------------------------------------------------------- */}
      {/* Acquire                                                           */}
      {/* ---------------------------------------------------------------- */}
      <Panel title="FLIGHT DATA" right={<Cap>DIRECT USB LINK TO THE FLIGHT COMPUTER</Cap>}>
        <div style={{ display: 'flex', gap: SPACE.s3, flexWrap: 'wrap', alignItems: 'center' }}>
          <Pill dot color={serial?.fc_connected ? T.success : T.muted}>
            {serial?.fc_connected ? 'FC CONNECTED' : 'FC NOT CONNECTED'}
          </Pill>

          <Btn
            onClick={on_download}
            disabled={busy || !serial?.fc_connected}
            kind="primary"
          >
            {busy ? 'Downloading…' : 'Download flight data'}
          </Btn>

          <Btn onClick={on_open} disabled={busy}>
            Open .bin…
          </Btn>

          {busy && (
            <Btn onClick={() => api?.debrief_cancel?.()} kind="danger">
              Cancel
            </Btn>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.s2 }}>
            <Toggle
              on={includePrelaunch}
              onChange={setIncludePrelaunch}
              label="Include pre-launch region"
            />
          </div>
        </div>

        <div
          style={{
            font: `400 ${TYPE.micro}px ${FONT.mono}`,
            color: T.faint,
            marginTop: SPACE.s2,
          }}
        >
          {includePrelaunch
            ? 'Adds the 39.4 MiB PAD wrap region (~64 MB total). Only needed when launch detect missed and the flight never left PAD.'
            : 'Pulls the standard regions (~24.6 MB). The pre-launch wrap region is skipped.'}
        </div>

        {!serial?.fc_connected && (
          <div
            style={{
              font: `400 ${TYPE.micro}px ${FONT.mono}`,
              color: T.warn,
              marginTop: SPACE.s2,
            }}
          >
            Connect the flight computer on the Setup tab first. The dump needs a CDC=telem
            build — the state machine is compiled only when CDC_STREAM == 1.
          </div>
        )}

        {progress && busy && (
          <div style={{ marginTop: SPACE.s3 }}>
            <div
              style={{
                height: 6,
                background: T.bgHi,
                borderRadius: RADIUS.pill,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: T.accent,
                  transition: 'width 120ms linear',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                font: `400 ${TYPE.micro}px ${FONT.mono}`,
                color: T.muted,
                marginTop: 4,
              }}
            >
              <span>
                {progress.region_name ? `${progress.region_name} · ` : ''}
                {fmt_bytes(progress.bytes_done)} / {fmt_bytes(progress.bytes_total)}
              </span>
              <span>
                {progress.bytes_per_sec > 0 ? `${fmt_bytes(progress.bytes_per_sec)}/s` : ''}
                {progress.eta_s != null ? ` · ETA ${fmt_secs(progress.eta_s)}` : ''}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: SPACE.s3,
              padding: SPACE.s3,
              background: T.dangerBg,
              border: `1px solid ${T.danger}`,
              borderRadius: RADIUS.md,
              font: `400 ${TYPE.micro}px ${FONT.mono}`,
              color: T.strong,
            }}
          >
            {error}
          </div>
        )}

        {load && (
          <div
            style={{
              marginTop: SPACE.s3,
              font: `400 ${TYPE.micro}px ${FONT.mono}`,
              color: T.muted,
              display: 'flex',
              gap: SPACE.s3,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span>
              Saved: <span style={{ color: T.strong }}>{load.bin_path ?? load.source}</span>
            </span>
            {load.bin_path && (
              <Btn size="sm" onClick={() => api?.debrief_reveal?.()}>
                Reveal
              </Btn>
            )}
            {load.firmware && (
              <span>
                FW {load.firmware.git_hash?.slice(0, 8) || '?'} · sig{' '}
                {load.firmware.build_sig || '?'}
              </span>
            )}
            {!load.prologue_found && (
              <span style={{ color: T.warn }}>
                No valid prologue — decoded with default quantisation scales.
              </span>
            )}
          </div>
        )}
      </Panel>

      {/* ---------------------------------------------------------------- */}
      {/* Flights                                                           */}
      {/* ---------------------------------------------------------------- */}
      {load && (
        <Panel title="FLIGHTS" right={<Cap>{`${load.flights.length} IN THIS IMAGE`}</Cap>}>
          {load.flights.length === 0 ? (
            <div style={{ font: `400 ${TYPE.body}px ${FONT.sans}`, color: T.muted }}>
              The index is empty — this chip has no recorded flights.
            </div>
          ) : (
            <div style={{ display: 'flex', gap: SPACE.s2, flexWrap: 'wrap' }}>
              {load.flights.map((f) => {
                const active = f.flight_id === selected;
                return (
                  <button
                    key={f.flight_id}
                    onClick={() => load_flight(f.flight_id)}
                    style={{
                      background: active ? T.accentBg : T.bgEl,
                      border: `1px solid ${active ? T.accent : T.border}`,
                      borderRadius: RADIUS.md,
                      padding: `${SPACE.s2}px ${SPACE.s3}px`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: T.text,
                      font: `400 ${TYPE.micro}px ${FONT.mono}`,
                    }}
                  >
                    <div style={{ color: T.strong, fontWeight: 600 }}>
                      Flight {f.flight_id}
                      {f.dirty ? ' · UNCLOSED' : ''}
                    </div>
                    <div>
                      {fmt_secs(f.index_duration_s)} · {fmt_bytes(f.hr_bytes)} HR
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Summary                                                           */}
      {/* ---------------------------------------------------------------- */}
      {stats && (
        <Panel title="SUMMARY" right={<Cap>{`FLIGHT ${stats.flight_id}`}</Cap>}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: SPACE.s3,
            }}
          >
            <StatTile label="APOGEE" value={num(stats.apogee_m, 1)} unit="m" large />
            <StatTile label="MAX VELOCITY" value={num(stats.max_vel_mps, 1)} unit="m/s" large />
            <StatTile label="MAX ACCEL" value={num(stats.max_accel_g, 2)} unit="g" large />
            <StatTile label="MAX HIGH-G" value={num(stats.max_highg_g, 1)} unit="g" />
            <StatTile label="MAX RATE" value={num(stats.max_gyro_dps, 0)} unit="°/s" />
            <StatTile label="APOGEE AT" value={num(stats.apogee_t_s, 2)} unit="s" />
            <StatTile label="BURNOUT AT" value={num(stats.burnout_t_s, 2)} unit="s" />
            <StatTile label="DURATION" value={fmt_secs(stats.duration_s)} />
            <StatTile label="HR RATE" value={num(stats.hr_rate_hz, 1)} unit="Hz" />
            <StatTile
              label="RECORDS"
              value={`${stats.hr_count}`}
              sub={`${stats.lr_count} LR · ${stats.bmi_count} BMI`}
            />
            <StatTile
              label="CRC FAILURES"
              value={`${stats.hr_crc_failures + stats.bmi_crc_failures}`}
              color={stats.hr_crc_failures + stats.bmi_crc_failures > 0 ? T.warn : undefined}
            />
            <StatTile label="GPS BEST" value={`${stats.gps_best_sats ?? '—'}`} unit="sv" />
          </div>

          {states.length > 0 && (
            <div style={{ marginTop: SPACE.s4 }}>
              <Cap>STATE TIMELINE</Cap>
              <div
                style={{
                  display: 'flex',
                  gap: SPACE.s2,
                  flexWrap: 'wrap',
                  marginTop: SPACE.s2,
                  font: `400 ${TYPE.micro}px ${FONT.mono}`,
                  color: T.muted,
                }}
              >
                {states.map((s, i) => (
                  <span
                    key={`${s.name}-${i}`}
                    style={{
                      padding: '2px 6px',
                      background: T.bgEl,
                      border: `1px solid ${T.border}`,
                      borderRadius: RADIUS.sm,
                    }}
                  >
                    <span style={{ color: T.strong }}>{s.name}</span> {s.t_start.toFixed(1)}–
                    {s.t_end.toFixed(1)}s
                  </span>
                ))}
              </div>
            </div>
          )}
        </Panel>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Data-integrity warnings                                           */}
      {/* ---------------------------------------------------------------- */}
      {warnings.length > 0 && (
        <Panel title="DATA INTEGRITY" right={<Cap color={T.warn}>READ BEFORE ERASING THE CHIP</Cap>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE.s2 }}>
            {warnings.map((w, i) => (
              <div
                key={i}
                style={{
                  padding: SPACE.s3,
                  background: w.kind === 'pool-wrapped' ? T.dangerBg : T.warnBg,
                  border: `1px solid ${w.kind === 'pool-wrapped' ? T.danger : T.warn}`,
                  borderRadius: RADIUS.md,
                  font: `400 ${TYPE.micro}px ${FONT.mono}`,
                  color: T.text,
                }}
              >
                <span style={{ color: T.strong, fontWeight: 600 }}>
                  {w.region} · {w.kind}
                </span>
                <div style={{ marginTop: 4 }}>{w.detail}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* Charts                                                            */}
      {/* ---------------------------------------------------------------- */}
      {detail && groups.length === 0 && (
        <Panel title="CHARTS">
          <div style={{ font: `400 ${TYPE.body}px ${FONT.sans}`, color: T.muted }}>
            This flight decoded with no plottable records. If the chip was read while the
            logger was still writing, re-dump — the data is still on the chip.
          </div>
        </Panel>
      )}

      {groups.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
            gap: SPACE.s4,
          }}
        >
          {groups.map((g) => (
            <FlightChart
              key={g.key}
              group={g}
              states={states}
              t_min={t_bounds.lo}
              t_max={t_bounds.hi}
            />
          ))}
        </div>
      )}

      {detail?.slot2_is_legacy_adxl && (
        <div
          style={{
            font: `400 ${TYPE.micro}px ${FONT.mono}`,
            color: T.muted,
          }}
        >
          This image predates 2026-08-27: log stream slot 2 holds the retired ADXL records,
          not the BMI088, so there is no second-IMU trace to cross-check against.
        </div>
      )}
    </div>
  );
}
