// Tests for buildFlightConfig() — the Setup-UI -> wire FlightConfig mapping
// required by docs/specs/MC_FC_ALIGNMENT.md §10.8, in particular that the
// per-channel LIVE checkbox drives flags bit 7 (CHANNEL_LIVE) and defaults
// to unchecked (no-charge, safe).
//
// Also exercises the full round-trip through the main-process serialiser so
// the byte offset the renderer's checkbox writes to is proven, not assumed.

import { describe, it, expect } from "vitest";
import { buildFlightConfig, FLIGHT_CONFIG_DEFAULTS } from "../useFlightConfig.js";
import { serialise_config } from "../../../main/protocol/config_serialiser";

describe("buildFlightConfig", () => {
  it("produces 4 pyro_channels with sequential hw_channel indices", () => {
    const cfg = buildFlightConfig(FLIGHT_CONFIG_DEFAULTS);
    expect(cfg.pyro_channels).toHaveLength(4);
    cfg.pyro_channels.forEach((ch, i) => expect(ch.hw_channel).toBe(i));
  });

  it("defaults every channel to live: false (no-charge, safe) when the UI config is untouched", () => {
    const cfg = buildFlightConfig(FLIGHT_CONFIG_DEFAULTS);
    for (const ch of cfg.pyro_channels) {
      expect(ch.live).toBe(false);
    }
  });

  it("maps role from the UI's pyroChannels array", () => {
    const cfg = buildFlightConfig(FLIGHT_CONFIG_DEFAULTS);
    expect(cfg.pyro_channels[0].role).toBe("Apogee");
    expect(cfg.pyro_channels[1].role).toBe("Main");
    expect(cfg.pyro_channels[2].role).toBe("Apogee Backup");
    expect(cfg.pyro_channels[3].role).toBe("Main Backup");
  });

  it("carries a checked LIVE checkbox through to live: true on the matching channel only", () => {
    const ui = {
      ...FLIGHT_CONFIG_DEFAULTS,
      pyroChannels: [
        { role: "Apogee", live: false },
        { role: "Main", live: true },
        { role: "Apogee Backup", live: false },
        { role: "Main Backup", live: false },
      ],
    };
    const cfg = buildFlightConfig(ui);
    expect(cfg.pyro_channels[0].live).toBe(false);
    expect(cfg.pyro_channels[1].live).toBe(true);
    expect(cfg.pyro_channels[2].live).toBe(false);
    expect(cfg.pyro_channels[3].live).toBe(false);
  });

  it("sets deploy_alt_m from mainAtM for Main-role channels only", () => {
    const ui = { ...FLIGHT_CONFIG_DEFAULTS, mainAtM: 450 };
    const cfg = buildFlightConfig(ui);
    expect(cfg.pyro_channels[1].deploy_alt_m).toBe(450); // role: "Main"
    expect(cfg.pyro_channels[3].deploy_alt_m).toBe(450); // role: "Main Backup" (starts with "Main")
    expect(cfg.pyro_channels[0].deploy_alt_m).toBe(0);   // role: "Apogee"
    expect(cfg.pyro_channels[2].deploy_alt_m).toBe(0);   // role: "Apogee Backup"
  });

  it("falls back to FLIGHT_CONFIG_DEFAULTS.pyroChannels when the UI config omits it", () => {
    const cfg = buildFlightConfig({});
    expect(cfg.pyro_channels).toHaveLength(4);
    expect(cfg.pyro_channels[0].role).toBe("Apogee");
    expect(cfg.pyro_channels[0].live).toBe(false);
  });

  // --- Round-trip through the real wire serialiser ---------------------------
  // Proves the LIVE checkbox lands on the exact byte/bit the FC contract
  // specifies (per-channel flags byte, bit 7), not just on some JS field.
  describe("round-trip through serialise_config", () => {
    it("sets flags bit 7 on the wire for a LIVE channel and leaves it clear elsewhere", () => {
      const ui = {
        ...FLIGHT_CONFIG_DEFAULTS,
        pyroChannels: [
          { role: "Apogee", live: true },
          { role: "Main", live: false },
          { role: "Apogee Backup", live: false },
          { role: "Main Backup", live: false },
        ],
      };
      const wire = buildFlightConfig(ui);
      const bytes = serialise_config(wire);

      // Per-channel block layout: 3-byte header + 32 bytes/channel;
      // flags is byte offset 3 within each 32-byte block (§15 / MC_FC_ALIGNMENT.md §1).
      const flags_ch0 = bytes[3 + 0 * 32 + 3];
      const flags_ch1 = bytes[3 + 1 * 32 + 3];
      const flags_ch2 = bytes[3 + 2 * 32 + 3];
      const flags_ch3 = bytes[3 + 3 * 32 + 3];

      expect(flags_ch0 & 0x80).toBe(0x80); // CH0 LIVE checked
      expect(flags_ch1 & 0x80).toBe(0);
      expect(flags_ch2 & 0x80).toBe(0);
      expect(flags_ch3 & 0x80).toBe(0);
    });

    it("leaves flags bit 7 clear on every channel for the safe (all-unchecked) default", () => {
      const wire = buildFlightConfig(FLIGHT_CONFIG_DEFAULTS);
      const bytes = serialise_config(wire);
      for (let ch = 0; ch < 4; ch++) {
        const flags = bytes[3 + ch * 32 + 3];
        expect(flags & 0x80).toBe(0);
      }
    });

    it("produces a 163-byte blob (3 header + 4x32 channel + 12 pad + 8 fallback + 8 thresholds + 4 CRC)", () => {
      const wire = buildFlightConfig(FLIGHT_CONFIG_DEFAULTS);
      const bytes = serialise_config(wire);
      expect(bytes.length).toBe(163);
    });
  });
});
