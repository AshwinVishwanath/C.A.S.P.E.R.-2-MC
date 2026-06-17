// CASPER 2 — SETUP TAB

import { useState } from "react";
import { TYPE, SPACE, RADIUS, FONT, SCHEME_PROPS } from "./tokens.js";
import { Cap, Pill, Panel, Btn, StatTile, Dot } from "./components.jsx";
import { FLIGHT_CONFIG_DEFAULTS, flightConfigHash, formatMassKg, formatAltM } from "./flight-config.jsx";

function SerialPortPicker({ T, scheme }) {
  const ports = [
    { path: "/dev/cu.usbmodem142101", desc: "STM32 H743 · CASPER FC", inUse: true },
    { path: "/dev/cu.usbserial-10A1", desc: "FT232R · GS Radio",       inUse: false },
    { path: "/dev/cu.Bluetooth-Incoming-Port", desc: "Bluetooth", inUse: false },
  ];
  return (
    <Panel T={T} scheme={scheme} title="SERIAL DEVICES" right={
      <div style={{ display: "flex", gap: SPACE.s2 }}>
        <Btn T={T} kind="ghost" size="xs">RESCAN</Btn>
        <Pill T={T} dot color={T.accent} size="sm">FC CONNECTED</Pill>
      </div>
    }>
      <div style={{ display: "grid", gap: SPACE.s1 }}>
        {ports.map(p => (
          <div key={p.path} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: `${SPACE.s2}px ${SPACE.s3}px`,
            background: p.inUse ? T.accentBg : T.bgEl,
            border: `1px solid ${p.inUse ? T.accentRing : T.border}`,
            borderRadius: RADIUS.sm,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: SPACE.s3, minWidth: 0 }}>
              <Dot T={T} color={p.inUse ? T.accent : T.faint} size={8} glow={SCHEME_PROPS[scheme].showGlow && p.inUse}/>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: FONT.mono, fontSize: TYPE.body, fontWeight: 600, color: T.strong, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.path}</div>
                <div style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, marginTop: 2 }}>{p.desc}</div>
              </div>
            </div>
            <Btn T={T} kind={p.inUse ? "accent" : "secondary"} size="sm">{p.inUse ? "DISCONNECT" : "CONNECT"}</Btn>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Diagnostics({ T, scheme }) {
  const sensors = [
    { name: "LSM6DSO32",      bus: "SPI2 · 833 Hz · ±32 g",   status: "OK",   detail: "Self-test passed · σ 0.04 g"  },
    { name: "ADXL372",        bus: "SPI3 · 6.4 kHz · ±200 g", status: "OK",   detail: "High-G · trigger armed" },
    { name: "MS5611",         bus: "SPI4 · OSR 1024",         status: "OK",   detail: "T 22.4°C · P 1013.2 hPa" },
    { name: "u-blox NEO-M9N", bus: "UART4 · 38400 · UBX",     status: "OK",   detail: "11 sats · 3D fix · HDOP 0.86" },
    { name: "W25Q512JV",      bus: "QSPI · 64 MB",            status: "WARN", detail: "38% used · consider erase" },
    { name: "RFM95W LoRa",    bus: "SPI1 · 868 MHz · SF7",    status: "OK",   detail: "TX -2 dBm · RX -89 dBm" },
  ];
  return (
    <Panel T={T} scheme={scheme} title="SENSOR BUS · DIAGNOSTICS" right={
      <Pill T={T} dot color={T.accent} size="sm">5 OK · 1 WARN</Pill>
    }>
      <div style={{ display: "grid", gap: 1 }}>
        {sensors.map((s, i) => {
          const c = s.status === "OK" ? T.accent : s.status === "WARN" ? T.warn : T.danger;
          return (
            <div key={s.name} style={{
              display: "grid", gridTemplateColumns: "auto 1.6fr 1.6fr auto", gap: SPACE.s4, alignItems: "center",
              padding: `${SPACE.s2}px ${SPACE.s3}px`,
              background: i % 2 === 0 ? "transparent" : T.bgEl + "55",
              borderBottom: i < sensors.length - 1 ? `1px solid ${T.border}` : "none",
            }}>
              <Dot T={T} color={c} size={8} glow={SCHEME_PROPS[scheme].showGlow}/>
              <div style={{ fontFamily: FONT.mono, fontSize: TYPE.body, fontWeight: 600, color: T.strong }}>{s.name}</div>
              <div style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.text }}>{s.bus}</div>
              <div style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, textAlign: "right" }}>{s.detail}</div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function FlightLog({ T, scheme }) {
  const [progress] = useState(67);
  const sk = SCHEME_PROPS[scheme];
  return (
    <Panel T={T} scheme={scheme} title="FLIGHT LOG · HARVEST" right={
      <div style={{ display: "flex", gap: SPACE.s2 }}>
        <Btn T={T} kind="primary" size="sm" icon="download">DOWNLOAD</Btn>
        <Btn T={T} kind="secondary" size="sm">EXPORT CSV</Btn>
        <Btn T={T} kind="danger" size="sm">ERASE</Btn>
      </div>
    }>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: SPACE.s4, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: SPACE.s2 }}>
            <Cap T={T} color={T.accent}>HIGH-RATE STREAM · 100 Hz</Cap>
            <span style={{ fontFamily: FONT.mono, fontSize: TYPE.body, fontWeight: 700, color: T.accent, fontVariantNumeric: "tabular-nums" }}>{progress}%</span>
          </div>
          <div style={{ height: 8, background: T.bgEl, borderRadius: RADIUS.pill, overflow: "hidden", border: `1px solid ${T.border}` }}>
            <div style={{
              height: "100%", width: `${progress}%`,
              background: `linear-gradient(90deg, ${T.accent} 0%, ${T.accent} 100%)`,
              borderRadius: RADIUS.pill,
              boxShadow: sk.showGlow ? T.glowSoft(T.accent) : "none",
              transition: "width 200ms",
            }}/>
          </div>
          <div style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, marginTop: SPACE.s2, fontVariantNumeric: "tabular-nums" }}>
            0x00C32A0 · 8,431 / 12,580 frames · CRC 0 errors · ~14 s remaining
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: SPACE.s2, marginTop: SPACE.s4 }}>
            <StatTile T={T} label="HIGH-RATE" value="8,431" unit="frames" sub="100 Hz · 8 ch"/>
            <StatTile T={T} label="LOW-RATE"  value="2,134" unit="frames" sub="10 Hz · 16 ch"/>
            <StatTile T={T} label="EVENTS"    value="42"    unit="entries" sub="apogee, deploy, etc" accent/>
          </div>
        </div>

        <div style={{
          background: T.bgEl, border: `1px solid ${T.border}`, borderRadius: RADIUS.md,
          maxHeight: 320, overflowY: "auto",
        }}>
          <div style={{ padding: `${SPACE.s2}px ${SPACE.s3}px`, borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, background: T.bgEl, zIndex: 1 }}>
            <Cap T={T}>EVENT LOG · LAST FLIGHT</Cap>
          </div>
          {[
            { t: 0.000,   m: "PAD ARMED",                              c: "accent" },
            { t: 0.114,   m: "BOOST DETECTED · accel 8.2 g",            c: "info" },
            { t: 4.220,   m: "BURNOUT · velocity 248 m/s",              c: "info" },
            { t: 21.430,  m: "APOGEE · 1,847 m AGL",                    c: "warn" },
            { t: 21.612,  m: "DROGUE DEPLOY · channel 1",               c: "accent" },
            { t: 84.910,  m: "MAIN DEPLOY · 300 m AGL · channel 2",     c: "accent" },
            { t: 96.310,  m: "GPS regained 3D fix · 9 sats",            c: "muted" },
            { t: 142.330, m: "LANDED · battery 7.9 V",                  c: "accent" },
          ].map((e, i) => (
            <div key={i} style={{
              display: "flex", gap: SPACE.s3, padding: `${SPACE.s2}px ${SPACE.s3}px`,
              fontFamily: FONT.mono, fontSize: TYPE.cap,
              borderBottom: `1px solid ${T.border}`,
            }}>
              <span style={{ color: T.accent, minWidth: 60, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                {e.t.toFixed(3)}s
              </span>
              <span style={{ color: T[e.c] || T.text, fontWeight: 500 }}>{e.m}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Flight Config — editable summary (Profile, Motor, Mass, Apogee, etc.)
// Mirrors the read-only panel on the Flight tab right rail. Changes persist
// via the parent's useFlightConfig hook (localStorage-backed).
// ---------------------------------------------------------------------------
function ConfigField({ T, label, value, unit, type = "text", onChange, options, hint }) {
  const isSelect = type === "select";
  const isNumber = type === "number";
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Cap T={T}>{label}</Cap>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        {isSelect ? (
          <select value={value} onChange={(e) => onChange(e.target.value)} style={{
            flex: 1, background: T.bgEl, border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
            color: T.strong, fontFamily: FONT.cond, fontSize: TYPE.body, fontWeight: 600,
            letterSpacing: "0.04em", padding: "8px 10px", outline: "none", cursor: "pointer",
          }}>
            {options.map((o) => <option key={o} value={o} style={{ background: T.bgPanel, color: T.strong }}>{o}</option>)}
          </select>
        ) : (
          <input
            type={isNumber ? "number" : "text"}
            value={value}
            onChange={(e) => onChange(isNumber ? (Number(e.target.value) || 0) : e.target.value)}
            style={{
              flex: 1, background: T.bgEl, border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
              color: T.strong, fontFamily: FONT.mono, fontSize: TYPE.body, fontWeight: 600,
              padding: "8px 10px", outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentRing}`; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}
          />
        )}
        {unit && <span style={{ fontFamily: FONT.mono, fontSize: TYPE.body, color: T.muted, marginLeft: 4, minWidth: 32 }}>{unit}</span>}
      </div>
      {hint && <span style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.faint }}>{hint}</span>}
    </label>
  );
}

function FlightConfigEditor({ T, scheme, flightConfig = FLIGHT_CONFIG_DEFAULTS, updateFlightConfig = () => {}, resetFlightConfig = () => {} }) {
  const [confirmReset, setConfirmReset] = useState(false);
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
    resetFlightConfig();
  }

  const hash = flightConfigHash(flightConfig);

  return (
    <Panel T={T} scheme={scheme} title="FLIGHT CONFIGURATION" right={
      <div style={{ display: "flex", gap: SPACE.s2, alignItems: "center" }}>
        <Pill T={T} color={T.muted} size="sm">{hash}</Pill>
        <Btn T={T} kind={confirmReset ? "warn" : "ghost"} size="xs" onClick={handleReset}>
          {confirmReset ? "CONFIRM RESET" : "RESET"}
        </Btn>
        <Btn T={T} kind="primary" size="sm" icon="upload">UPLOAD TO FC</Btn>
      </div>
    }>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.s4, alignItems: "start" }}>
        {/* Vehicle */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s3 }}>
          <Cap T={T} color={T.accent}>VEHICLE</Cap>
          <ConfigField T={T} label="Profile" type="select"
            value={flightConfig.profile} options={profileOptions}
            onChange={(v) => updateFlightConfig({ profile: v })}/>
          <ConfigField T={T} label="Motor" type="text"
            value={flightConfig.motor}
            onChange={(v) => updateFlightConfig({ motor: v })}
            hint="e.g. AeroTech J350W"/>
          <ConfigField T={T} label="Mass (wet)" type="number" unit="kg"
            value={flightConfig.massWetKg}
            onChange={(v) => updateFlightConfig({ massWetKg: v })}/>
          <ConfigField T={T} label="Vehicle ID" type="text"
            value={flightConfig.vehicleId}
            onChange={(v) => updateFlightConfig({ vehicleId: v })}
            hint="Used for telemetry filtering"/>
        </div>

        {/* Targets / Recovery */}
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.s3 }}>
          <Cap T={T} color={T.accent}>TARGETS</Cap>
          <ConfigField T={T} label="Apogee target" type="number" unit="m"
            value={flightConfig.apogeeTargetM}
            onChange={(v) => updateFlightConfig({ apogeeTargetM: v })}
            hint="Used to size pyro thresholds & dial scales"/>
          <ConfigField T={T} label="Drogue at" type="select"
            value={flightConfig.drogueAt} options={drogueOptions}
            onChange={(v) => updateFlightConfig({ drogueAt: v })}/>
          <ConfigField T={T} label="Main deploy" type="number" unit="m AGL"
            value={flightConfig.mainAtM}
            onChange={(v) => updateFlightConfig({ mainAtM: v })}
            hint="Below this altitude main charge fires"/>
        </div>
      </div>

      {/* Live preview */}
      <div style={{
        marginTop: SPACE.s4, paddingTop: SPACE.s4,
        borderTop: `1px solid ${T.border}`,
      }}>
        <Cap T={T}>PREVIEW · MATCHES FLIGHT TAB · RIGHT RAIL</Cap>
        <div style={{
          marginTop: SPACE.s3,
          padding: `${SPACE.s3}px ${SPACE.s4}px`,
          background: T.bgEl,
          border: `1px solid ${T.border}`,
          borderRadius: RADIUS.md,
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: `${SPACE.s2}px ${SPACE.s5}px`,
          fontFamily: FONT.mono, fontSize: 12,
        }}>
          {[
            ["Profile",        flightConfig.profile],
            ["Motor",          flightConfig.motor],
            ["Mass (wet)",     formatMassKg(flightConfig.massWetKg)],
            ["Apogee target",  formatAltM(flightConfig.apogeeTargetM)],
            ["Drogue at",      flightConfig.drogueAt],
            ["Main at",        formatAltM(flightConfig.mainAtM) + " AGL"],
            ["Vehicle ID",     flightConfig.vehicleId],
            ["CRC hash",       hash],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: SPACE.s3, paddingBottom: 4, borderBottom: `1px solid ${T.border}` }}>
              <span style={{ color: T.muted, letterSpacing: 0.3 }}>{k}</span>
              <span style={{ color: T.strong, fontWeight: 700, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function PyroConfigCard({ T, scheme, ch, role, threshold, unit, options }) {
  return (
    <Panel T={T} scheme={scheme} title={
      <div style={{ display: "flex", alignItems: "center", gap: SPACE.s2 }}>
        <span style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.muted, fontWeight: 600 }}>HW{ch}</span>
        <select defaultValue={role} style={{
          fontFamily: FONT.cond, fontSize: TYPE.body, fontWeight: 700,
          background: "transparent", color: T.strong, border: "none", outline: "none",
          letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
          padding: "2px 4px",
        }}>
          {options.map(r => <option key={r} value={r} style={{ background: T.bgPanel, color: T.strong }}>{r}</option>)}
        </select>
      </div>
    } right={<Pill T={T} dot color={T.accent} size="sm">CONT 2.18 Ω</Pill>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.s3 }}>
        <div>
          <Cap T={T}>FIRE CONDITION</Cap>
          <div style={{ marginTop: SPACE.s1, fontFamily: FONT.mono, fontSize: TYPE.body, color: T.strong, fontWeight: 600 }}>{threshold}</div>
        </div>
        <div>
          <Cap T={T}>THRESHOLD VALUE</Cap>
          <div style={{ marginTop: SPACE.s1, display: "flex", gap: 4, alignItems: "center" }}>
            <input defaultValue="300" style={{
              flex: 1, background: T.bgEl, border: `1px solid ${T.border}`, borderRadius: RADIUS.sm,
              color: T.strong, fontFamily: FONT.mono, fontSize: TYPE.body, fontWeight: 600,
              padding: "6px 10px", outline: "none",
            }}
              onFocus={(e) => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = `0 0 0 3px ${T.accentRing}`; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = "none"; }}/>
            <span style={{ fontFamily: FONT.mono, fontSize: TYPE.body, color: T.muted, marginLeft: 4 }}>{unit}</span>
          </div>
        </div>
        <div>
          <Cap T={T}>FIRE PULSE</Cap>
          <div style={{ marginTop: SPACE.s1, fontFamily: FONT.mono, fontSize: TYPE.body, color: T.strong, fontWeight: 600 }}>250 ms · 2.4 A</div>
        </div>
        <div>
          <Cap T={T}>BACKUP CHANNEL</Cap>
          <div style={{ marginTop: SPACE.s1, fontFamily: FONT.mono, fontSize: TYPE.body, color: T.text, fontWeight: 600 }}>None</div>
        </div>
      </div>
    </Panel>
  );
}

export default function SetupTab({ T, scheme, flightConfig, updateFlightConfig, resetFlightConfig }) {
  const ROLES = ["Apogee", "Main", "Ignition", "Drogue", "Custom", "Disabled"];
  const cfg = [
    { ch: 1, role: "Apogee",   threshold: "T+APOGEE",     unit: "—" },
    { ch: 2, role: "Main",     threshold: "300 m AGL",    unit: "m" },
    { ch: 3, role: "Ignition", threshold: "T+0.8 s",      unit: "s" },
    { ch: 4, role: "Custom",   threshold: "TIMER · T+45", unit: "s" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SCHEME_PROPS[scheme].sectionGap, padding: SPACE.s5, maxWidth: 1640, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <Cap T={T} color={T.accent}>SETUP · CONFIGURATION</Cap>
          <h2 style={{
            fontFamily: scheme === "obsidian" ? FONT.display : FONT.cond,
            fontSize: scheme === "obsidian" ? 44 : 32,
            fontWeight: scheme === "obsidian" ? 500 : 700,
            color: T.strong,
            letterSpacing: scheme === "obsidian" ? "0.02em" : "0.01em",
            textTransform: "uppercase",
            margin: 0, marginTop: SPACE.s2, lineHeight: 1,
          }}>Bench Configuration</h2>
          <div style={{ fontFamily: FONT.mono, fontSize: TYPE.body, color: T.muted, marginTop: SPACE.s2 }}>
            USB connected · 3.0 Mbps · CASPER FC v2.4.1 · git 0x4f2a8c
          </div>
        </div>
        <div style={{ display: "flex", gap: SPACE.s2 }}>
          <Btn T={T} kind="ghost" size="md">DEFAULTS</Btn>
          <Btn T={T} kind="secondary" size="md" icon="download">EXPORT</Btn>
          <Btn T={T} kind="primary" size="md" icon="upload">UPLOAD TO FC</Btn>
        </div>
      </div>

      <SerialPortPicker T={T} scheme={scheme}/>
      <Diagnostics T={T} scheme={scheme}/>
      <FlightConfigEditor T={T} scheme={scheme} flightConfig={flightConfig} updateFlightConfig={updateFlightConfig} resetFlightConfig={resetFlightConfig}/>
      <FlightLog T={T} scheme={scheme}/>

      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: SPACE.s3 }}>
          <Cap T={T} color={T.muted}>PYRO CHANNEL CONFIGURATION</Cap>
          <span style={{ fontFamily: FONT.mono, fontSize: TYPE.cap, color: T.faint }}>4 channels · CAC required to fire</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.s3 }}>
          {cfg.map(p => (
            <PyroConfigCard key={p.ch} T={T} scheme={scheme}
              ch={p.ch} role={p.role} threshold={p.threshold} unit={p.unit}
              options={ROLES}/>
          ))}
        </div>
      </div>
    </div>
  );
}
