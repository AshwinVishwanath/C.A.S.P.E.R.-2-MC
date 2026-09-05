# CASPER MC — Feature Ideas

Desktop Electron operator console for the C.A.S.P.E.R.-2 ecosystem. Software-only, no phone app, no BLE.

**Audience.** A single operator on a folding table in bright sun, with gloved hands, a flaky hotspot, adrenaline, and two minutes to launch. Every feature below is graded against that scenario.

**Positioning.** *Featherweight is a phone app. Fluctus is a utility. CASPER MC is a flight-director console.*

---

## 1. Design constraints — the field laptop reality

The lens. If a feature doesn't survive these conditions, it doesn't ship.

- **Sunlight-readable first.** High-contrast palette, daylight-tested luminance. Dark mode is a setting, not the default — glossy laptop screens reflect in sun and dark UI becomes invisible.
- **Status by shape + colour + text.** Never colour alone. Bright sun makes everyone red-green colour-blind.
- **Critical buttons are big and isolated.** ARM and FIRE do not sit next to anything benign. Fitts's law: big target, away from cursor noise.
- **Hick's law — hide what isn't needed now.** Setup-mode and Flight-mode show different controls. No always-visible "advanced" panels.
- **Hotkeys are chords, never single keys.** A bumped keyboard cannot trigger anything irreversible.
- **Errors are actions, not jargon.** *"Radio dropped — retrying"* beats *"Error: COM3 ENOENT"*. The message tells you what to do.
- **Offline-first.** No internet at most launch sites. Weather, tiles, sim, vehicle history — all cached. Background-fetch on bandwidth; never block on it.
- **Crash recovery is invisible.** Session auto-saves every state change. Relaunch resumes exactly where we were.
- **Boot to ready in under 10 seconds.** Auto-detect serial ports. Remember last session. No first-launch wizard unless it really is the first launch.
- **Audio is a fallback, never primary.** Wind + laptop speakers = silence. Aural telemetry adds to the visual picture; it never replaces it.
- **Single-handed operation must be possible.** One hand on the trackpad, one on a radio. No two-finger gestures on the critical path.

---

## 2. Field-operations-first features

The foundation. Nothing else matters if these aren't right.

### Daylight mode
High-contrast palette tuned for outdoor LCDs in direct sun. One-keystroke toggle to dark mode for indoor setup. Default is daylight.

### Big-button launch overlay
ARM/FIRE controls expand to large isolated targets in the FLIGHT scene. No shrunken trackpad precision on the critical path.

### Always-visible connection bar
Top-strip indicator: serial, radio link, FC handshake, GPS, laptop battery. Three states each (OK / degraded / lost) — colour *and* shape *and* label. No buried settings pane for comms.

### Auto-resume after crash
Continuous session save. Relaunch picks up mid-flight with no data loss — readiness score, scene state, checklist progress, in-progress CAC sequence all restored.

### Glove-friendly hit targets
Minimum 48 px tap targets on every clickable control on the field path. No hover-dependent UX anywhere. Drag affordances always have a click fallback.

### Quiet by default
Only surface events that change what the operator should do next. Everything else goes to a side log they can browse post-flight.

### One-screen FLIGHT scene
Everything needed boost-to-apogee fits on one non-scrolling, non-tabbed view at 1366×768. Anything that doesn't fit is the wrong information.

### Pre-flight ready-light gate
The readiness score (Section 7) gates the UI. You cannot reach FIRE through any sequence if the system isn't ready. No memorising preconditions.

### Plain-language status
Every banner, alert, and modal is one sentence a tired operator can parse in one read. No acronyms without expansion. No error codes without a "what to do" line.

### Stress-test demo mode
A dev scene that simulates sun glare (whitewash overlay), packet loss, single-handed use, and a 20-second-to-launch countdown. UX must survive the worst-case before shipping.

### Field-laptop power awareness
Visible battery indicator. Estimated time-to-empty under current scene load. Auto-dim non-critical animations when on battery <30%. Forced-save before low-battery shutdown.

---

## 3. Manifesto features (v1 headliner bundle)

Six features that, shipped together, have no commercial equivalent. All gated by Section 1–2.

### Predictive console
The console runs ahead of the rocket. Pulls .ork sim + Monte Carlo and surfaces live countdowns — `Burnout T+0.8s`, `Apogee T+6.2s`, `Mains T+12.4s` — each with a shrinking error bar. Grades itself post-flight; prediction error feeds back into sim calibration. Airliner FMC ergonomics for hobby rocketry.

### Shrinking landing footprint
Pre-flight Monte Carlo (mass, wind, ISP, CD variants) draws a fat landing ellipse on the satellite map. Each telemetry frame, the cloud collapses to runs still consistent with observed state. Footprint shrinks 800 m → 50 m by burnout → tight zone by apogee. Chase team leaves the pad with a target.

### Self-verifying checklist
Every step graded by live telemetry, not operator taps. Continuity, GPS lock, IMU sanity, sim-hash match, battery trend — all auto-greens. Manual taps only for things electronics can't see. The state of the launch *is* the checklist.

### Scene system (OBS-style)
Named layouts — `PAD`, `FLIGHT`, `RECOVERY`, `DEBRIEF` — switched with one keystroke and a crossfade. Rule engine can trigger scenes (FC enters BOOST → auto-switch to FLIGHT). Multi-monitor aware; layouts saved per display configuration.

### Adaptive airframe sim
Every flight, MC back-solves CD(M) from the coast phase and persists it to the vehicle profile. Next flight uses *your airframe's* actual drag, not Barrowman. After three flights the predictions are dead-nuts accurate. Compounds. OpenRocket itself does not do this.

### Time-travel replay
Scrub a timeline, the entire console snaps to that millisecond: telemetry, predictions, CAC state, pyros, sim overlay, anomalies. Drag in a GoPro/RunCam MP4 — MC auto-aligns to T0 via shock impulse on the audio track — and the scrubber drives video + data together.

---

## 4. OpenRocket (.ork) integration

### Parsing
- .ork is zip-wrapped XML. Deps: `jszip` + `fast-xml-parser`.
- Two halves: design (always present) + simulations (optional).

### Data model
- `OrkVehicleProfile` — masses, CG/CP, stability, stage/motor info.
- `OrkSimulation` — conditions, summary, time-series (t, alt, vel, accel, mach, thrust, cg, cp, cd), events.
- `ork_sha256` folded into config CRC for post-flight traceability.

### Transonic honesty
OpenRocket drag is degraded at M 0.8–1.2 (±15–30% apogee). Every predicted figure shows a confidence chip derived from sim max-Mach; charts crossing M 0.8 get a hatched "OR transonic — degraded" band. The most useful UI nudge for high-power flyers.

### SETUP tab additions
- Import .ork button → vehicle summary card.
- CG/CP migration animation through motor burn.
- Stability gate: green 1.0–2.5 cal, amber outside. Dry and wet.
- Motor card with thrust-curve sparkline.
- Predicted flight envelope with per-figure confidence chips.
- Sim picker for multi-sim files.
- One-click "apply suggested pyro thresholds from sim."
- What-if sliders (mass, wind, launch angle) via sim interpolation.

### TRACK tab additions
- Sim vs flight overlay for altitude, velocity, accel, mach.
- Transonic/supersonic bands drawn from flight Mach trace.
- Per-segment delta table: boost / coast / descent.
- **CD back-solve** — empirical CD(M) from ballistic coast deceleration vs OR's curve. The killer feature.
- Mass back-solve: normalize for measured wet mass before comparison.

---

## 5. Desktop-only differentiators

### Multi-monitor operator console
Spread MC across 1–3 monitors. Layouts saved per monitor count; auto-restore when an external display reconnects. Field use is usually 1 screen — design for that primary, scale up gracefully.

### Keyboard-driven everything
Chord shortcuts for every action — ARM, FIRE, scene switch, alarm-ack, scrub. Visible cheat sheet. Practice mode drills hotkeys against a replay.

### Stream Deck / MIDI / HID surface
Map FIRE to a physical button on a desk box. Foot pedal for checklist advance. Survives glove conditions where trackpad doesn't.

### Dual-operator CAC over LAN
Two laptops on the same network. ARM confirmed on A, FIRE confirmed on B. Real two-person rule without phones or hardware. Toggleable.

### Witness mode (browser-based)
Electron serves a localhost+LAN read-only HTTP mirror. Any browser opens the URL — RSO/observer uses their existing laptop. Not a phone app, just a webpage.

### Drag-in camera sync
Drop a GoPro/RunCam MP4 in DEBRIEF; MC auto-aligns to T0 via shock impulse on audio. Scrubber drives data + video together.

### Range simulator / chair-fly mode
Replay past flights as if live; CAC + rule engine react in real time. Operator training, cert-flight rehearsal, rule-chain validation.

### Cached weather
METAR / NOAA forecast pulled when the hotspot is up, cached for the rest of the day. Feeds the Monte Carlo. Never blocks the UI.

### Mission Pack file format
Single `.casper` zip bundling airframe + .ork + checklist + rule chain + scene layouts + crew + waivers. Shareable. A club ships one pack; everyone flies the same console state.

---

## 6. Operator depth

### Scriptable rule engine
Conditional rule chains on live telemetry or sim deltas. Triggers: scene change, alarm, sequencer step, log event, anomaly assertion. Visible on the prediction timeline.

### Flight sequencer
Pre-programmed action sequence with optional auto-arm. Each step has a predicted timestamp from the sim.

### Anomaly co-pilot
Inference engine compares live telemetry against history of the same airframe + active sim. Surfaces anomalies as plain English: *"RSSI 8 dB below previous flights at this altitude"*, *"Spin rate 50% above sim — possible misaligned fin"*, *"CD diverging from sim 60% at M 0.9 — possible deployed component."*

### Hackable plugin canvas
Tile-based widget canvas (Grafana for rocketry). Documented JS plugin spec. Expert path; *not* on the field-critical path. Available in DEBRIEF and SETUP, never live in FLIGHT.

### Built-in Python sandbox
In-app Python runner with the flight log preloaded as a dataframe. Expert path inside the app instead of "export to MATLAB and start over." Lives in DEBRIEF only.

### Aural telemetry
Synth tone: altitude → pitch, velocity → tempo. Heartbeat-click per telemetry frame; stutter = comms issue. Voice TTS for major events. *Augments* the visual console; never replaces it.

---

## 7. Ease-of-use polish

### One-number readiness score (0–100)
Computed from continuity, GPS, baro, batt, RSSI, IMU sanity, sim hash, checklist. Big number at top. FIRE gates on ≥95. The single cognitive offload.

### Auto-generated PDF post-flight report
Summary, sim overlay, CD back-solve, GPS map, anomaly log. Suitable for cert paperwork. One button.

### First-flight bring-up wizard
New airframe: rotate through known orientations, verify IMU axes, test pyros, save a calibration record tied to airframe ID. Five minutes, then never again for that airframe.

### Auto-download post-flight log
Already in the readout pipeline; surface prominently in DEBRIEF.

### Pre-flight rehearsal
"Run this launch as a simulation" button — replays the planned mission against the sim without any radio commands going out. Trains the operator on this exact launch before doing it for real.

---

## 8. Safety & traceability

### Cryptographic black-box
Each telemetry frame chains into a Merkle hash committed to flash. Recovered logs cryptographically proven untampered. Useful for TRA/NAR record-attempt verification and insurance.

### Range card auto-print
One-page printable for LCO/RSO: predicted apogee, max-Q, motor, mass, sim hash, drogue/main altitudes, descent rate, wind. The kneeboard rocketry never had.

### Witness cert PDF
Auto-generated from a witness-mode session record. Signed event timeline, max altitude verified, sim correlation, observer scan log. Cert paperwork as a by-product.

### In-flight CD anomaly detector
During coast, EKF already solves alt/vel. Solve CD live; >50% divergence from sim banners *"Drag anomaly — possible deployed component."* Can catch a partial-deploy before apogee.

---

## 9. Stretch / experimental

- **Telemetry health radar** — polar plot of RSSI vs bearing as rocket spins; predict antenna nulls.
- **CG/CP migration visualizer** — animated rocket silhouette, CG and CP marks moving through the burn.
- **Range-site mapper** — tap pad, range head, car park, recovery start on a satellite tile; saved per-site.
- **Mode-driven console themes** — daylight palette shifts subtly between PAD / FLIGHT / RECOVERY / DEBRIEF scenes for ambient awareness. Never at the cost of contrast.
- **Multi-rocket flock** — LoRa addressing already supports it; flock view, ripple-fire sequencing. Deferred.

---

## 10. Build priority

### Priority 0 — field-readiness baseline (gate for *everything*)
Nothing in the MVP ships until these are met:
- Daylight palette with dark-mode toggle
- Always-visible connection bar (serial / radio / FC / GPS / battery)
- Auto-resume after crash
- 48 px minimum hit targets on the critical path
- Quiet-by-default notification model
- One-screen FLIGHT scene at 1366×768
- Plain-language error/banner copy across the app
- Boot-to-ready under 10 s
- Stress-test demo mode green in CI

### MVP — the manifesto release (sits on top of Priority 0)
1. .ork import + parser + canonical data model
2. Predictive console (FMC timeline)
3. Shrinking footprint (Monte Carlo + cached weather)
4. Self-verifying checklist
5. Scene system + multi-monitor layouts
6. Adaptive airframe sim (CD back-solve persisted)
7. Time-travel replay + camera sync

### Follow-ups
- Anomaly co-pilot
- Dual-operator CAC over LAN
- Witness mode + cert PDF
- Hackable plugin canvas (DEBRIEF/SETUP only)
- Aural telemetry
- Range simulator / chair-fly mode
- Cryptographic black-box

### Deferred
- Multi-rocket flock view
- Built-in Python sandbox
- Stream Deck / MIDI control surfaces
- Mission Pack file format (waits on stable data shapes)
