import { useState } from "react";

var MONO = "'IBM Plex Mono','Menlo',monospace";
var COND = "'IBM Plex Sans Condensed','Arial Narrow',sans-serif";

function PortRow({ label, ports, connected, selectedPort, onSelect, onConnect, onDisconnect, theme }) {
  var T = theme;
  var dotColor = connected ? T.accent : T.muted;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 0",
      }}
    >
      {/* Connection indicator dot */}
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: dotColor,
          boxShadow: connected ? T.glow(T.accent) : "none",
          flexShrink: 0,
        }}
      />

      {/* Label */}
      <span
        style={{
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 700,
          color: connected ? T.accent : T.muted,
          minWidth: 22,
          flexShrink: 0,
        }}
      >
        {label}
      </span>

      {/* Port dropdown */}
      <select
        value={selectedPort}
        onChange={function (e) {
          onSelect(e.target.value);
        }}
        disabled={connected}
        style={{
          flex: 1,
          fontFamily: MONO,
          fontSize: 9,
          padding: "4px 6px",
          borderRadius: 3,
          border: "1px solid " + T.border,
          background: connected ? T.bgEl : T.bgPanel,
          color: connected ? T.muted : T.text,
          cursor: connected ? "not-allowed" : "pointer",
          minWidth: 0,
          appearance: "auto",
        }}
      >
        <option value="">-- select port --</option>
        {ports &&
          ports.map(function (p) {
            var path = typeof p === "string" ? p : p.path || p.comName || "";
            var desc = typeof p === "object" && p.description ? p.description : "";
            var display = desc ? path + " (" + desc + ")" : path;
            return (
              <option key={path} value={path}>
                {display}
              </option>
            );
          })}
      </select>

      {/* Connect / Disconnect button */}
      {connected ? (
        <button
          onClick={onDisconnect}
          style={{
            fontFamily: MONO,
            fontSize: 9,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 3,
            border: "1px solid " + T.danger + "66",
            background: T.danger + "15",
            color: T.danger,
            cursor: "pointer",
            flexShrink: 0,
            letterSpacing: 0.5,
          }}
        >
          DISCONNECT
        </button>
      ) : (
        <button
          onClick={onConnect}
          disabled={!selectedPort}
          style={{
            fontFamily: MONO,
            fontSize: 9,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 3,
            border: "1px solid " + (selectedPort ? T.accent + "66" : T.border),
            background: selectedPort ? T.accent + "15" : "transparent",
            color: selectedPort ? T.accent : T.muted,
            cursor: selectedPort ? "pointer" : "not-allowed",
            opacity: selectedPort ? 1 : 0.5,
            flexShrink: 0,
            letterSpacing: 0.5,
          }}
        >
          CONNECT
        </button>
      )}
    </div>
  );
}

export function SerialPortPicker({ serial, theme }) {
  var T = theme;
  var [fcPort, setFcPort] = useState("");
  var [gsPort, setGsPort] = useState("");

  var ports = serial.ports || [];

  return (
    <div
      style={{
        background: T.bgPanel,
        border: "1px solid " + T.border,
        borderRadius: 5,
        overflow: "hidden",
        boxShadow: T.shadow,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "7px 12px",
          borderBottom: "1px solid " + T.border,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: T.bgEl,
        }}
      >
        <span
          style={{
            fontFamily: COND,
            fontSize: 10.5,
            fontWeight: 600,
            color: T.muted,
            textTransform: "uppercase",
            letterSpacing: 1.8,
          }}
        >
          Serial Ports
        </span>
        <button
          onClick={function () {
            if (serial.scan) serial.scan();
          }}
          style={{
            fontFamily: MONO,
            fontSize: 9,
            fontWeight: 700,
            padding: "3px 10px",
            borderRadius: 3,
            border: "1px solid " + T.border,
            background: "transparent",
            color: T.muted,
            cursor: "pointer",
            letterSpacing: 0.5,
          }}
        >
          SCAN PORTS
        </button>
      </div>

      {/* Port rows */}
      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        <PortRow
          label="FC"
          ports={ports}
          connected={serial.fc_connected}
          selectedPort={fcPort}
          onSelect={setFcPort}
          onConnect={function () {
            if (serial.connect_fc) serial.connect_fc(fcPort);
          }}
          onDisconnect={function () {
            if (serial.disconnect_fc) serial.disconnect_fc();
          }}
          theme={T}
        />
        <PortRow
          label="GS"
          ports={ports}
          connected={serial.gs_connected}
          selectedPort={gsPort}
          onSelect={setGsPort}
          onConnect={function () {
            if (serial.connect_gs) serial.connect_gs(gsPort);
          }}
          onDisconnect={function () {
            if (serial.disconnect_gs) serial.disconnect_gs();
          }}
          theme={T}
        />
      </div>
    </div>
  );
}
