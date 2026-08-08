/**
 * Tests for config serialiser.
 *
 * Tests round-trip serialisation consistency and hash stability.
 */

import { describe, it, expect } from 'vitest';
import { serialise_config, config_hash } from '../config_serialiser';
import { crc32_compute } from '../crc32';
import { FlightConfig, PyroChannelConfig } from '../types';

/** Helper: create a minimal valid FlightConfig. */
function make_config(overrides?: Partial<FlightConfig>): FlightConfig {
  const default_pyro: PyroChannelConfig = {
    hw_channel: 0,
    role: 'Apogee',
    altitude_source: 'ekf',
    fire_duration_s: 1.0,
    deploy_alt_m: 0,
    time_after_apogee_s: 0,
    early_deploy_enabled: false,
    backup_mode: 'time',
    backup_time_s: 0
  };

  return {
    pyro_channels: [
      { ...default_pyro, hw_channel: 0, role: 'Apogee' },
      { ...default_pyro, hw_channel: 1, role: 'Main', deploy_alt_m: 300 },
      { ...default_pyro, hw_channel: 2, role: 'Apogee Backup', backup_mode: 'time', backup_time_s: 2.0 },
      { ...default_pyro, hw_channel: 3, role: 'Main Backup', deploy_alt_m: 250 }
    ],
    pad_lat_deg: 32.9901,
    pad_lon_deg: -106.9749,
    pad_alt_msl_m: 1400,
    sf_fallback: {
      alt_threshold_m: 50,
      vel_threshold_mps: -5
    },
    checks: {
      min_batt_v: 7.0,
      min_integrity_pct: 90
    },
    ...overrides
  };
}

describe('serialise_config', () => {
  it('should produce a non-empty Uint8Array', () => {
    const config = make_config();
    const result = serialise_config(config);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should start with config version byte', () => {
    const config = make_config();
    const result = serialise_config(config);
    expect(result[0]).toBe(0x01); // CONFIG_VERSION
  });

  it('should have total length in bytes 1-2 (LE)', () => {
    const config = make_config();
    const result = serialise_config(config);
    const total_length = result[1] | (result[2] << 8);
    expect(total_length).toBe(result.length);
  });

  it('should have valid CRC-32 in the last 4 bytes', () => {
    const config = make_config();
    const result = serialise_config(config);

    const data = result.subarray(0, result.length - 4);
    const expected_crc = crc32_compute(data);

    const actual_crc =
      (result[result.length - 4] |
        (result[result.length - 3] << 8) |
        (result[result.length - 2] << 16) |
        (result[result.length - 1] << 24)) >>> 0;

    expect(actual_crc).toBe(expected_crc);
  });

  it('should encode pyro channel hw_channel values', () => {
    const config = make_config();
    const result = serialise_config(config);

    // Channel data starts at offset 3
    // Each channel is 32 bytes, hw_channel is at offset 0 of each
    expect(result[3]).toBe(0);   // channel 0
    expect(result[35]).toBe(1);  // channel 1
    expect(result[67]).toBe(2);  // channel 2
    expect(result[99]).toBe(3);  // channel 3
  });

  it('should produce deterministic output', () => {
    const config = make_config();
    const result1 = serialise_config(config);
    const result2 = serialise_config(config);

    expect(result1.length).toBe(result2.length);
    for (let i = 0; i < result1.length; i++) {
      expect(result1[i]).toBe(result2[i]);
    }
  });

  it('should produce different output for different configs', () => {
    const config1 = make_config({ pad_lat_deg: 32.0 });
    const config2 = make_config({ pad_lat_deg: 33.0 });
    const result1 = serialise_config(config1);
    const result2 = serialise_config(config2);

    let different = false;
    for (let i = 0; i < result1.length; i++) {
      if (result1[i] !== result2[i]) {
        different = true;
        break;
      }
    }
    expect(different).toBe(true);
  });

  // docs/specs/MC_FC_ALIGNMENT.md §4/§5/§10.8 — per-channel flags bit 7 is
  // CHANNEL_LIVE. Default (unset `live`) must serialise to 0 (no-charge, safe).
  describe('CHANNEL_LIVE (flags bit 7)', () => {
    it('should leave bit 7 clear when `live` is unset (safe default)', () => {
      const config = make_config(); // default_pyro has no `live` field
      const result = serialise_config(config);
      for (let ch = 0; ch < 4; ch++) {
        const flags = result[3 + ch * 32 + 3];
        expect(flags & 0x80).toBe(0);
      }
    });

    it('should leave bit 7 clear when `live: false` is explicit', () => {
      const config = make_config();
      config.pyro_channels[1].live = false;
      const result = serialise_config(config);
      const flags = result[3 + 1 * 32 + 3];
      expect(flags & 0x80).toBe(0);
    });

    it('should set bit 7 when `live: true`, independent of other flag bits', () => {
      const config = make_config();
      config.pyro_channels[2].live = true;
      config.pyro_channels[2].early_deploy_enabled = true; // bit 0
      config.pyro_channels[2].backup_mode = 'height';       // bit 1
      const result = serialise_config(config);
      const flags = result[3 + 2 * 32 + 3];
      expect(flags & 0x80).toBe(0x80);
      expect(flags & 0x01).toBe(0x01); // early_deploy untouched by the live bit
      expect(flags & 0x02).toBe(0x02); // backup_mode untouched by the live bit
    });

    it('should set bit 7 independently per channel', () => {
      const config = make_config();
      config.pyro_channels[0].live = true;
      config.pyro_channels[3].live = true;
      const result = serialise_config(config);
      expect(result[3 + 0 * 32 + 3] & 0x80).toBe(0x80);
      expect(result[3 + 1 * 32 + 3] & 0x80).toBe(0);
      expect(result[3 + 2 * 32 + 3] & 0x80).toBe(0);
      expect(result[3 + 3 * 32 + 3] & 0x80).toBe(0x80);
    });

    it('should change config_hash when only a LIVE bit changes', () => {
      const config_off = make_config();
      const config_on = make_config();
      config_on.pyro_channels[0].live = true;
      expect(config_hash(config_off)).not.toBe(config_hash(config_on));
    });
  });

  it('should encode optional fields as zero when not set', () => {
    const config = make_config();
    // Clear all optional fields on channel 0
    config.pyro_channels[0] = {
      hw_channel: 0,
      role: 'Custom',
      altitude_source: 'baro',
      fire_duration_s: 0.5
    };

    const result = serialise_config(config);
    expect(result).toBeInstanceOf(Uint8Array);
    // Should not throw
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('config_hash', () => {
  it('should return a 32-bit unsigned integer', () => {
    const config = make_config();
    const hash = config_hash(config);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  it('should be deterministic', () => {
    const config = make_config();
    const hash1 = config_hash(config);
    const hash2 = config_hash(config);
    expect(hash1).toBe(hash2);
  });

  it('should change when config changes', () => {
    const config1 = make_config({ pad_lat_deg: 32.0 });
    const config2 = make_config({ pad_lat_deg: 33.0 });
    expect(config_hash(config1)).not.toBe(config_hash(config2));
  });

  it('should match the CRC embedded in serialised output', () => {
    const config = make_config();
    const hash = config_hash(config);
    const serialised = serialise_config(config);

    // The CRC in the serialised output should match config_hash
    const embedded_crc =
      (serialised[serialised.length - 4] |
        (serialised[serialised.length - 3] << 8) |
        (serialised[serialised.length - 2] << 16) |
        (serialised[serialised.length - 1] << 24)) >>> 0;

    expect(hash).toBe(embedded_crc);
  });

  it('should produce different hashes for fire_duration_s changes', () => {
    const config1 = make_config();
    config1.pyro_channels[0].fire_duration_s = 1.0;

    const config2 = make_config();
    config2.pyro_channels[0].fire_duration_s = 2.0;

    expect(config_hash(config1)).not.toBe(config_hash(config2));
  });
});
