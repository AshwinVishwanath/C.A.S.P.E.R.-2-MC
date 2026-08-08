// FlightConfigEditor — editable flight configuration panel.
// Mirrors the read-only FLIGHT CONFIG panel on the Flight tab right rail.
// Changes persist via useFlightConfig (localStorage-backed).
//
// Usage:
//   const [config, updateConfig, resetConfig] = useFlightConfig();
//   <FlightConfigEditor config={config} onUpdate={updateConfig} onReset={resetConfig} />

import React, { useState, useCallback } from "react";
import { useTheme } from "../design/ThemeContext";
import { FONT, SPACE, RADIUS, TYPE } from "../design/tokens.js";
import { Cap, Pill, Panel, Btn } from "../design/components";
import {
  FLIGHT_CONFIG_DEFAULTS,
  flightConfigHash,
  formatMassKg,
  formatAltM,
  buildFlightConfig,
} from "../hooks/useFlightConfig.js";

// ---------------------------------------------------------------------------
// PyroChannelsField — 4-row per-channel role + LIVE checkbox editor.
// Drives per-channel flags bit 7 (CHANNEL_LIVE) in the wire FlightConfig —
// see docs/specs/MC_FC_ALIGNMENT.md §4/§5/§10.8. LIVE defaults unchecked.
// ---------------------------------------------------------------------------
function PyroChannelsField({ channels, onChange }) {
  const T = useTheme();
  const roleOptions = [
    "Apogee", "Apogee Backup", "Main", "Main Backup",
    "Ignition", "Ignition Backup", "Custom",
  ];
  const rows = channels && channels.length === 4
    ? channels
    : FLIGHT_CONFIG_DEFAULTS.pyroChannels;

  function setRole(i, role) {
    const next = rows.map((c, idx) => (idx === i ? { ...c, role } : c));
    onChange(next);
  }
  function setLive(i, live) {
    const next = rows.map((c, idx) => (idx === i ? { ...c, live } : c));
    onChange(next);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Cap>Pyro Channels</Cap>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: `${SPACE.s2}px ${SPACE.s3}px`,
        }}
      >
        {rows.map((ch, i) => (
          <React.Fragment key={i}>
            <span
              style={{
                fontFamily: FONT.mono,
                fontSize: TYPE.cap,
                color: T.muted,
                minWidth: 18,
              }}
            >
              CH{i}
            </span>
            <select
              value={ch.role}
              onChange={(e) => setRole(i, e.target.value)}
              style={{
                background: T.bgEl,
                border: `1px solid ${T.border}`,
                borderRadius: RADIUS.sm,
                color: T.strong,
                fontFamily: FONT.cond,
                fontSize: TYPE.body,
                fontWeight: 600,
                letterSpacing: "0.04em",
                padding: "6px 8px",
                outline: "none",
                cursor: "pointer",
              }}
            >
              {roleOptions.map((o) => (
                <option key={o} value={o} style={{ background: T.bgPanel, color: T.strong }}>
                  {o}
                </option>
              ))}
            </select>
            <label
              title="CHANNEL_LIVE — live pyro charge fitted. Unchecked = no-charge (safe default)."
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontFamily: FONT.mono,
                fontSize: TYPE.cap,
                fontWeight: 700,
                color: ch.live ? T.danger : T.muted,
                cursor: "pointer",
                userSelect: "none",
                whiteSpace: "nowrap",
              }}
            >
              <input
                type="checkbox"
                checked={!!ch.live}
                onChange={(e) => setLive(i, e.target.checked)}
                style={{ accentColor: T.danger, cursor: "pointer" }}
              />
              LIVE
            </label>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ConfigField — single labelled input (text / number / select)
// ---------------------------------------------------------------------------
function ConfigField({ label, value, unit, type = "text", onChange, options, hint }) {
  const T = useTheme();
  const isSelect = type === "select";
  const isNumber = type === "number";

  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Cap>{label}</Cap>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {isSelect ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              flex: 1,
              background: T.bgEl,
              border: `1px solid ${T.border}`,
              borderRadius: RADIUS.sm,
              color: T.strong,
              fontFamily: FONT.cond,
              fontSize: TYPE.body,
              fontWeight: 600,
              letterSpacing: "0.04em",
              padding: "8px 10px",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {options.map((o) => (
              <option key={o} value={o} style={{ background: T.bgPanel, color: T.strong }}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={isNumber ? "number" : "text"}
            value={value}
            onChange={(e) =>
              onChange(isNumber ? Number(e.target.value) || 0 : e.target.value)
            }
            style={{
              flex: 1,
              background: T.bgEl,
              border: `1px solid ${T.border}`,
              borderRadius: RADIUS.sm,
              color: T.strong,
              fontFamily: FONT.mono,
              fontSize: TYPE.body,
              fontWeight: 600,
              padding: "8px 10px",
              outline: "none",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = T.accent;
              e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentRing}`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = T.border;
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        )}
        {unit && (
          <span
            style={{
              fontFamily: FONT.mono,
              fontSize: TYPE.body,
              color: T.muted,
              marginLeft: 4,
              minWidth: 32,
            }}
          >
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <span style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.faint }}>
          {hint}
        </span>
      )}
    </label>
  );
}

// ---------------------------------------------------------------------------
// FlightConfigEditor — two-column VEHICLE | TARGETS editor
// ---------------------------------------------------------------------------
export default function FlightConfigEditor({
  config = FLIGHT_CONFIG_DEFAULTS,
  onUpdate = () => {},
  onReset = () => {},
}) {
  const T = useTheme();
  const [confirmReset, setConfirmReset] = useState(false);

  // Upload-to-FC state: null | 'pending' | 'verified' | 'mismatch' | 'timeout' | 'nack' | 'err'
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadDetail, setUploadDetail] = useState("");

  const handleUploadToFc = useCallback(async () => {
    const api = typeof window !== "undefined" ? window.casper : null;
    if (!api || typeof api.upload_config !== "function") {
      setUploadStatus("err");
      setUploadDetail("Bridge missing: window.casper.upload_config not available");
      return;
    }
    setUploadStatus("pending");
    setUploadDetail("Uploading…");
    try {
      const wireConfig = buildFlightConfig(config);
      const res = await api.upload_config(wireConfig);
      if (res && res.ok && res.verified) {
        const hashHex = (res.hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
        setUploadStatus("verified");
        setUploadDetail(`Verified · FC hash 0x${hashHex}`);
      } else if (res && res.ok && res.verified === false) {
        setUploadStatus("mismatch");
        setUploadDetail(res.error || "ACK hash did not match the uploaded config");
      } else if (res && res.nack_code !== undefined) {
        setUploadStatus("nack");
        setUploadDetail(res.error || `NACK 0x${(res.nack_code >>> 0).toString(16)}`);
      } else if (res && /timeout/i.test(res.error || "")) {
        setUploadStatus("timeout");
        setUploadDetail(res.error);
      } else {
        setUploadStatus("err");
        setUploadDetail((res && res.error) || "Upload failed");
      }
    } catch (e) {
      setUploadStatus("err");
      setUploadDetail(String((e && e.message) || e));
    }
  }, [config]);

  const uploadStatusColor =
    uploadStatus === "verified" ? T.accent
    : uploadStatus === "mismatch" ? T.warn
    : uploadStatus === "timeout" ? T.warn
    : uploadStatus === "nack" ? T.danger
    : uploadStatus === "err" ? T.danger
    : uploadStatus === "pending" ? T.warn
    : T.muted;

  const uploadStatusLabel =
    uploadStatus === "verified" ? "VERIFIED"
    : uploadStatus === "mismatch" ? "HASH MISMATCH"
    : uploadStatus === "timeout" ? "TIMEOUT"
    : uploadStatus === "nack" ? "NACK"
    : uploadStatus === "err" ? "ERROR"
    : uploadStatus === "pending" ? "UPLOADING…"
    : null;

  const profileOptions = [
    "L1 single-stage",
    "L2 single-stage",
    "L3 single-stage",
    "Two-stage",
    "Multi-stage",
    "Custom",
  ];

  const drogueOptions = [
    "T+APOGEE",
    "Apogee detect",
    "Apogee + 0.5 s",
    "Apogee + 1.0 s",
    "Manual only",
  ];

  function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    setConfirmReset(false);
    onReset();
  }

  const hash = flightConfigHash(config);

  return (
    <Panel
      title="FLIGHT CONFIGURATION"
      right={
        <div style={{ display: "flex", gap: SPACE.s2, alignItems: "center" }}>
          <Pill color={T.muted} size="sm">{hash}</Pill>
          {uploadStatusLabel && (
            <div
              title={uploadDetail}
              style={{
                fontFamily: FONT.mono,
                fontSize: 10,
                color: uploadStatusColor,
                padding: "6px 10px",
                border: `1px solid ${uploadStatusColor}55`,
                background: `${uploadStatusColor}10`,
                borderRadius: RADIUS.sm,
                maxWidth: 320,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {uploadStatusLabel}{uploadDetail ? ` · ${uploadDetail}` : ""}
            </div>
          )}
          <Btn
            kind={confirmReset ? "warn" : "ghost"}
            size="xs"
            onClick={handleReset}
          >
            {confirmReset ? "CONFIRM RESET" : "RESET"}
          </Btn>
          <Btn
            kind="primary"
            size="sm"
            disabled={uploadStatus === "pending"}
            onClick={handleUploadToFc}
          >
            {uploadStatus === "pending" ? "UPLOADING…" : "UPLOAD TO FC"}
          </Btn>
        </div>
      }
    >
      {/* Three-column: VEHICLE | TARGETS | PYRO CHANNELS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1.2fr",
          gap: SPACE.s4,
          alignItems: "start",
        }}
      >
        {/* VEHICLE column */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s3 }}>
          <Cap color={T.accent}>VEHICLE</Cap>
          <ConfigField
            label="Profile"
            type="select"
            value={config.profile}
            options={profileOptions}
            onChange={(v) => onUpdate({ profile: v })}
          />
          <ConfigField
            label="Motor"
            type="text"
            value={config.motor}
            onChange={(v) => onUpdate({ motor: v })}
            hint="e.g. AeroTech J350W"
          />
          <ConfigField
            label="Mass (wet)"
            type="number"
            unit="kg"
            value={config.massWetKg}
            onChange={(v) => onUpdate({ massWetKg: v })}
          />
          <ConfigField
            label="Vehicle ID"
            type="text"
            value={config.vehicleId}
            onChange={(v) => onUpdate({ vehicleId: v })}
            hint="Used for telemetry filtering"
          />
        </div>

        {/* TARGETS column */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s3 }}>
          <Cap color={T.accent}>TARGETS</Cap>
          <ConfigField
            label="Apogee target"
            type="number"
            unit="m"
            value={config.apogeeTargetM}
            onChange={(v) => onUpdate({ apogeeTargetM: v })}
            hint="Used to size pyro thresholds & dial scales"
          />
          <ConfigField
            label="Drogue at"
            type="select"
            value={config.drogueAt}
            options={drogueOptions}
            onChange={(v) => onUpdate({ drogueAt: v })}
          />
          <ConfigField
            label="Main deploy"
            type="number"
            unit="m AGL"
            value={config.mainAtM}
            onChange={(v) => onUpdate({ mainAtM: v })}
            hint="Below this altitude main charge fires"
          />
        </div>

        {/* PYRO CHANNELS column — feeds the wire FlightConfig (0xC1) upload */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s3 }}>
          <Cap color={T.accent}>PYRO CHANNELS</Cap>
          <PyroChannelsField
            channels={config.pyroChannels || FLIGHT_CONFIG_DEFAULTS.pyroChannels}
            onChange={(pyroChannels) => onUpdate({ pyroChannels })}
          />
          <span style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.faint }}>
            LIVE = real pyro charge fitted. Unchecked channels arm and auto-fire
            without continuity (no-charge, safe default).
          </span>
        </div>
      </div>

      {/* Live preview — matches Flight tab right rail */}
      <div
        style={{
          marginTop: SPACE.s4,
          paddingTop: SPACE.s4,
          borderTop: `1px solid ${T.border}`,
        }}
      >
        <Cap>PREVIEW · MATCHES FLIGHT TAB · RIGHT RAIL</Cap>
        <div
          style={{
            marginTop: SPACE.s3,
            padding: `${SPACE.s3}px ${SPACE.s4}px`,
            background: T.bgEl,
            border: `1px solid ${T.border}`,
            borderRadius: RADIUS.md,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: `${SPACE.s2}px ${SPACE.s5}px`,
            fontFamily: FONT.mono,
            fontSize: 12,
          }}
        >
          {[
            ["Profile",       config.profile],
            ["Motor",         config.motor],
            ["Mass (wet)",    formatMassKg(config.massWetKg)],
            ["Apogee target", formatAltM(config.apogeeTargetM)],
            ["Drogue at",     config.drogueAt],
            ["Main at",       formatAltM(config.mainAtM) + " AGL"],
            ["Vehicle ID",    config.vehicleId],
            ["CRC hash",      hash],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: SPACE.s3,
                paddingBottom: 4,
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              <span style={{ color: T.muted, letterSpacing: 0.3 }}>{k}</span>
              <span
                style={{
                  color: T.strong,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  textAlign: "right",
                }}
              >
                {v}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
