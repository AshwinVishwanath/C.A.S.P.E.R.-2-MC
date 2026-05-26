// SensorDiagnostics — sensor-bus status table for the Setup tab.
// Static demo rows; real data wired in a future milestone.
//
// TODO: wire to real sensor diagnostics IPC (window.casper.get_sensor_status)

import React from "react";
import { useTheme } from "../design/ThemeContext";
import { FONT, SPACE, RADIUS, TYPE, SCHEME_PROPS } from "../design/tokens.js";
import { Cap, Pill, Panel, Dot } from "../design/components";

const SENSORS = [
  {
    name: "LSM6DSO32",
    bus: "SPI2 · 833 Hz · ±32 g",
    status: "OK",
    detail: "Self-test passed · σ 0.04 g",
  },
  {
    name: "ADXL372",
    bus: "SPI3 · 6.4 kHz · ±200 g",
    status: "OK",
    detail: "High-G · trigger armed",
  },
  {
    name: "MS5611",
    bus: "SPI4 · OSR 1024",
    status: "OK",
    detail: "T 22.4°C · P 1013.2 hPa",
  },
  {
    name: "u-blox NEO-M9N",
    bus: "UART4 · 38400 · UBX",
    status: "OK",
    detail: "11 sats · 3D fix · HDOP 0.86",
  },
  {
    name: "W25Q512JV",
    bus: "QSPI · 64 MB",
    status: "WARN",
    detail: "38% used · consider erase",
  },
  {
    name: "RFM95W LoRa",
    bus: "SPI1 · 868 MHz · SF7",
    status: "OK",
    detail: "TX -2 dBm · RX -89 dBm",
  },
];

export default function SensorDiagnostics() {
  const T = useTheme();
  const scheme = T.scheme || "fusion";
  const sk = SCHEME_PROPS[scheme] || SCHEME_PROPS.fusion;

  const okCount = SENSORS.filter((s) => s.status === "OK").length;
  const warnCount = SENSORS.filter((s) => s.status === "WARN").length;

  return (
    <Panel
      title="SENSOR BUS · DIAGNOSTICS"
      right={
        <Pill dot color={T.accent} size="sm">
          {okCount} OK{warnCount > 0 ? ` · ${warnCount} WARN` : ""}
        </Pill>
      }
    >
      <div style={{ display: "grid", gap: 1 }}>
        {SENSORS.map((s, i) => {
          const c =
            s.status === "OK"
              ? T.accent
              : s.status === "WARN"
              ? T.warn
              : T.danger;
          return (
            <div
              key={s.name}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1.6fr 1.6fr auto",
                gap: SPACE.s4,
                alignItems: "center",
                padding: `${SPACE.s2}px ${SPACE.s3}px`,
                background: i % 2 === 0 ? "transparent" : T.bgEl + "55",
                borderBottom:
                  i < SENSORS.length - 1 ? `1px solid ${T.border}` : "none",
              }}
            >
              <Dot color={c} size={8} glow={sk.showGlow} />
              <div
                style={{
                  fontFamily: FONT.mono,
                  fontSize: TYPE.body,
                  fontWeight: 600,
                  color: T.strong,
                }}
              >
                {s.name}
              </div>
              <div
                style={{
                  fontFamily: FONT.mono,
                  fontSize: TYPE.cap,
                  color: T.text,
                }}
              >
                {s.bus}
              </div>
              <div
                style={{
                  fontFamily: FONT.mono,
                  fontSize: TYPE.cap,
                  color: T.muted,
                  textAlign: "right",
                }}
              >
                {s.detail}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
