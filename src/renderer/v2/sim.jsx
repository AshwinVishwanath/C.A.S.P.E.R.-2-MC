// CASPER 2 Mission Control v2 — Telemetry simulator.
// Drives the prototype with realistic-feeling values: a slow climb to apogee,
// drogue/main deploys, GPS drift, battery sag, etc. Pure React.
//
// Production wiring: when a real telemetry source is available (the `live`
// prop on the host App), useMissionSim() will pass through real values from
// the existing useTelemetry hook and only synthesize the fields the FC does
// not yet expose.

import { useState, useEffect, useRef } from "react";

export const FSM = ["PAD", "BOOST", "COAST", "APOGEE", "DROGUE", "MAIN", "LANDED"];

function phaseAt(t) {
  if (t < 0)        return "PAD";
  if (t < 3.4)      return "BOOST";
  if (t < 22.0)     return "COAST";
  if (t < 22.5)     return "APOGEE";
  if (t < 84.0)     return "DROGUE";
  if (t < 142.0)    return "MAIN";
  return "LANDED";
}

function telemAt(t) {
  let alt, vel, accel;
  if (t < 0)        { alt = 0;       vel = 0;     accel = 0; }
  else if (t < 3.4) { accel = 9.0 - t * 0.7; vel = 9 * 9.81 * t * 0.78; alt = 0.5 * 0.78 * 9 * 9.81 * t * t; }
  else if (t < 22.0) {
    const v0 = 248, a0 = 1500;
    const dt = t - 3.4;
    accel = -1.2;
    vel = v0 - 9.81 * dt * 1.18;
    alt = a0 + v0 * dt - 0.5 * 9.81 * dt * dt * 1.18;
    if (vel < 0) vel = Math.max(0, vel);
  }
  else if (t < 22.5) { alt = 1847;    vel = 0;     accel = 0; }
  else if (t < 84.0) {
    const dt = t - 22.5;
    accel = 0;
    vel = -25 - Math.sin(dt * 0.4) * 4;
    alt = 1847 + vel * dt;
  }
  else if (t < 142.0) {
    const dt = t - 84.0;
    accel = 0;
    vel = -7 - Math.sin(dt * 0.6) * 2;
    alt = 300 + vel * dt;
  }
  else { alt = 0; vel = 0; accel = 0; }

  alt = Math.max(0, alt);
  const rho = Math.max(0.4, 1.225 - alt * 0.0001);
  const qbar = 0.5 * rho * vel * vel;
  return { alt, vel, accel, qbar };
}

function useHistory(value, maxLen = 200) {
  const [hist, setHist] = useState([]);
  useEffect(() => {
    setHist(prev => {
      const next = prev.length >= maxLen ? prev.slice(1) : prev.slice();
      next.push(value);
      return next;
    });
  }, [value]);
  return hist;
}

export function useMissionSim({ paused = false, autoLaunch = true } = {}) {
  const [met, setMet]           = useState(-12.4);
  const [running, setRunning]   = useState(autoLaunch);
  const [pyro, setPyro]         = useState([
    { ch: 1, role: "Apogee",   armed: true,  cont: 2.18, status: "SAFE",    threshold: "T+APOGEE" },
    { ch: 2, role: "Main",     armed: true,  cont: 2.04, status: "SAFE",    threshold: "300 m AGL" },
    { ch: 3, role: "Ignition", armed: false, cont: 1.92, status: "SAFE",    threshold: "T+0.8 s" },
    { ch: 4, role: "Custom",   armed: false, cont: null, status: "NO CONT", threshold: "—" },
  ]);

  useEffect(() => {
    if (paused || !running) return;
    const id = setInterval(() => {
      setMet(t => {
        const next = t + 0.1;
        if (next > 160) return -12.4;
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [paused, running]);

  const phase = phaseAt(met);
  const t = telemAt(met);

  useEffect(() => {
    setPyro(prev => prev.map(p => {
      if (phase === "APOGEE" && p.role === "Apogee") return { ...p, status: "FIRED" };
      if (phase === "MAIN" && p.role === "Main")     return { ...p, status: "FIRED" };
      if (phase === "BOOST" && p.role === "Ignition") return { ...p, status: "FIRED" };
      return p;
    }));
  }, [phase]);

  const altH  = useHistory(t.alt,  200);
  const velH  = useHistory(t.vel,  200);
  const qbarH = useHistory(t.qbar, 200);

  const gpsLat = 37.77492 + Math.sin(met * 0.05) * 0.0008;
  const gpsLon = -122.4194 + Math.cos(met * 0.05) * 0.0006;

  const batt = Math.max(7.0, 8.2 - Math.max(0, met) * 0.005);

  const tumble = phase === "DROGUE" || phase === "MAIN" ? Math.min(1, met * 0.02) : 0;
  const quat = {
    roll:  phase === "PAD" ? 0 : Math.sin(met * 0.6) * 0.35 * (1 + tumble),
    pitch: phase === "PAD" ? 0.02 : Math.sin(met * 0.4 + 1.0) * 0.20 * (1 + tumble * 1.4),
    yaw:   phase === "PAD" ? 0 : Math.sin(met * 0.3 + 0.5) * 0.30 * (1 + tumble),
  };

  return {
    met, setMet, running, setRunning,
    phase, FSM,
    alt: t.alt, vel: t.vel, accel: t.accel, qbar: t.qbar,
    altH, velH, qbarH,
    gpsLat, gpsLon, gpsFix: "3D", gpsSats: 11, hdop: 0.86,
    rssi: -89 - Math.sin(met * 0.3) * 4,
    dataAge: Math.floor(40 + Math.sin(met * 1.2) * 25),
    batt, temp: 22.4 + met * 0.01,
    pyro,
    quat,
    crc: { errors: 0, total: 12431 + Math.floor(met * 100) },
  };
}

export function fmtMET(t) {
  const sign = t < 0 ? "-" : "+";
  const a = Math.abs(t);
  const m = Math.floor(a / 60);
  const s = Math.floor(a % 60);
  const ms = Math.floor((a - Math.floor(a)) * 10);
  return "T" + sign + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") + "." + ms;
}
