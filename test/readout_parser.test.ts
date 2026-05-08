/**
 * Unit tests for the C.A.S.P.E.R.-2 binary readout parser.
 *
 * Tests cover HR/LR entry decoding, header parsing, metadata parsing,
 * summary entry decoding, and CRC validation.  All test buffers are
 * hand-built with known field values to verify derived-field calculations
 * match the Python reference implementation exactly.
 *
 * @module test/readout_parser
 */

import { describe, it, expect } from 'vitest';
import { crc32_compute } from '../src/main/protocol/crc32';
import {
  parse_hr_lr_header,
  parse_summary_header,
  parse_metadata,
  decode_hr_entry,
  decode_lr_entry,
  decode_summary_entries,
  verify_data_crc
} from '../src/main/readout/readout_parser';
import {
  HR_ENTRY_SIZE, LR_ENTRY_SIZE,
  HR_LR_HEADER_SIZE, SUMMARY_HEADER_SIZE, METADATA_SIZE,
  MAGIC_CASP, MAGIC_SUMM, MAGIC_META
} from '../src/main/readout/readout_types';

// ---------------------------------------------------------------------------
// Little-endian write helpers (for building test buffers)
// ---------------------------------------------------------------------------

function write_u8(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = val & 0xFF;
}

function write_i8(buf: Uint8Array, offset: number, val: number): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setInt8(offset, val);
}

function write_u16_le(buf: Uint8Array, offset: number, val: number): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setUint16(offset, val, true);
}

function write_i16_le(buf: Uint8Array, offset: number, val: number): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setInt16(offset, val, true);
}

function write_u32_le(buf: Uint8Array, offset: number, val: number): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setUint32(offset, val, true);
}

function write_i32_le(buf: Uint8Array, offset: number, val: number): void {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  view.setInt32(offset, val, true);
}

// ---------------------------------------------------------------------------
// Test: HR entry decode
// ---------------------------------------------------------------------------

describe('decode_hr_entry', () => {
  it('should decode a 64-byte HR entry with known values and verify all derived fields', () => {
    const buf = new Uint8Array(HR_ENTRY_SIZE);

    // timestamp_us = 1000000 (1 second)
    write_u32_le(buf, 0, 1000000);
    // fresh = 0x07 (all fresh: imu, highg, baro)
    write_u8(buf, 4, 0x07);
    // fsm_state = 0x01 (BOOST)
    write_u8(buf, 5, 0x01);
    // accel_mg = [1000, 0, 0]
    write_i16_le(buf, 6, 1000);
    write_i16_le(buf, 8, 0);
    write_i16_le(buf, 10, 0);
    // gyro_raw = [1000, 0, 0]
    write_i16_le(buf, 12, 1000);
    write_i16_le(buf, 14, 0);
    write_i16_le(buf, 16, 0);
    // imu_temp_c100 = 2500
    write_i16_le(buf, 18, 2500);
    // highg_10mg = [500, 0, 0]
    write_i16_le(buf, 20, 500);
    write_i16_le(buf, 22, 0);
    write_i16_le(buf, 24, 0);
    // baro_pa = 101325
    write_u32_le(buf, 26, 101325);
    // baro_temp_c100 = 2200
    write_i16_le(buf, 30, 2200);
    // ekf_alt_cm = 10000
    write_i32_le(buf, 32, 10000);
    // ekf_vel_cmps = 5000
    write_i32_le(buf, 36, 5000);
    // ekf_abias_mmps2 = 50
    write_i16_le(buf, 40, 50);
    // ekf_bbias_cm = -10
    write_i16_le(buf, 42, -10);
    // quat_packed = [0, 0, 0] -> identity quaternion (w=1)
    write_i16_le(buf, 44, 0);
    write_i16_le(buf, 46, 0);
    write_i16_le(buf, 48, 0);
    // tilt_cdeg = 500
    write_i16_le(buf, 50, 500);
    // flags = 0x02 (launched)
    write_u8(buf, 52, 0x02);
    // reserved bytes 53..63 = 0 (already zero)

    const entry = decode_hr_entry(buf);

    // Timestamp
    expect(entry.timestamp_us).toBe(1000000);
    expect(entry.timestamp_s).toBeCloseTo(1.0, 6);

    // Fresh flags
    expect(entry.fresh).toBe(0x07);
    expect(entry.fresh_imu).toBe(true);
    expect(entry.fresh_highg).toBe(true);
    expect(entry.fresh_baro).toBe(true);

    // FSM state
    expect(entry.fsm_state).toBe(0x01);
    expect(entry.fsm_name).toBe('BOOST');

    // Accelerometer
    expect(entry.accel_x_mg).toBe(1000);
    expect(entry.accel_y_mg).toBe(0);
    expect(entry.accel_z_mg).toBe(0);
    expect(entry.accel_x_g).toBeCloseTo(1.0, 3);
    expect(entry.accel_y_g).toBeCloseTo(0.0, 3);
    expect(entry.accel_z_g).toBeCloseTo(0.0, 3);

    // Gyroscope
    expect(entry.gyro_x_raw).toBe(1000);
    expect(entry.gyro_y_raw).toBe(0);
    expect(entry.gyro_z_raw).toBe(0);
    expect(entry.gyro_x_dps).toBeCloseTo(70.0, 3);
    expect(entry.gyro_y_dps).toBeCloseTo(0.0, 3);
    expect(entry.gyro_z_dps).toBeCloseTo(0.0, 3);

    // IMU temperature
    expect(entry.imu_temp_c).toBeCloseTo(25.0, 2);

    // High-g accelerometer
    expect(entry.highg_x_10mg).toBe(500);
    expect(entry.highg_y_10mg).toBe(0);
    expect(entry.highg_z_10mg).toBe(0);
    expect(entry.highg_x_g).toBeCloseTo(5.0, 2);
    expect(entry.highg_y_g).toBeCloseTo(0.0, 2);
    expect(entry.highg_z_g).toBeCloseTo(0.0, 2);

    // Barometer
    expect(entry.baro_pa).toBe(101325);
    expect(entry.baro_hpa).toBeCloseTo(1013.25, 2);
    expect(entry.baro_temp_c).toBeCloseTo(22.0, 2);

    // EKF
    expect(entry.ekf_alt_cm).toBe(10000);
    expect(entry.ekf_alt_m).toBeCloseTo(100.0, 2);
    expect(entry.ekf_vel_cmps).toBe(5000);
    expect(entry.ekf_vel_mps).toBeCloseTo(50.0, 2);
    expect(entry.ekf_abias_mmps2).toBe(50);
    expect(entry.ekf_abias_mps2).toBeCloseTo(0.05, 3);
    expect(entry.ekf_bbias_cm).toBe(-10);
    expect(entry.ekf_bbias_m).toBeCloseTo(-0.1, 2);

    // Quaternion (identity: w=1, x=y=z=0)
    expect(entry.quat_w).toBeCloseTo(1.0, 4);
    expect(entry.quat_x).toBeCloseTo(0.0, 4);
    expect(entry.quat_y).toBeCloseTo(0.0, 4);
    expect(entry.quat_z).toBeCloseTo(0.0, 4);

    // Tilt
    expect(entry.tilt_cdeg).toBe(500);
    expect(entry.tilt_deg).toBeCloseTo(5.0, 2);

    // Flags
    expect(entry.flags).toBe(0x02);
    expect(entry.flag_baro_gated).toBe(false);
    expect(entry.flag_launched).toBe(true);
    expect(entry.flag_mag_valid).toBe(false);
  });

  it('should handle negative accelerometer and gyro values', () => {
    const buf = new Uint8Array(HR_ENTRY_SIZE);
    write_u32_le(buf, 0, 500000);
    write_u8(buf, 4, 0x01); // fresh_imu only
    write_u8(buf, 5, 0x02); // COAST
    write_i16_le(buf, 6, -2000);   // accel_x_mg = -2000 -> -2.0g
    write_i16_le(buf, 8, -500);
    write_i16_le(buf, 10, 9810);   // ~9.81g
    write_i16_le(buf, 12, -1000);  // gyro -> -70 dps
    write_i16_le(buf, 14, 500);
    write_i16_le(buf, 16, -500);
    write_i16_le(buf, 18, -100);   // imu_temp = -1.0 C
    // rest zeros
    write_u32_le(buf, 26, 0);      // baro_pa
    write_i16_le(buf, 30, 0);      // baro_temp
    write_i32_le(buf, 32, -5000);  // ekf_alt_cm = -50m
    write_i32_le(buf, 36, -1000);  // ekf_vel = -10 m/s
    write_i16_le(buf, 40, 0);
    write_i16_le(buf, 42, 0);
    write_i16_le(buf, 44, 0);
    write_i16_le(buf, 46, 0);
    write_i16_le(buf, 48, 0);
    write_i16_le(buf, 50, 0);
    write_u8(buf, 52, 0x05); // baro_gated + mag_valid

    const entry = decode_hr_entry(buf);

    expect(entry.accel_x_mg).toBe(-2000);
    expect(entry.accel_x_g).toBeCloseTo(-2.0, 3);
    expect(entry.accel_z_mg).toBe(9810);
    expect(entry.accel_z_g).toBeCloseTo(9.81, 2);
    expect(entry.gyro_x_raw).toBe(-1000);
    expect(entry.gyro_x_dps).toBeCloseTo(-70.0, 3);
    expect(entry.imu_temp_c).toBeCloseTo(-1.0, 2);
    expect(entry.ekf_alt_m).toBeCloseTo(-50.0, 2);
    expect(entry.ekf_vel_mps).toBeCloseTo(-10.0, 2);
    expect(entry.fsm_name).toBe('COAST');
    expect(entry.fresh_imu).toBe(true);
    expect(entry.fresh_highg).toBe(false);
    expect(entry.fresh_baro).toBe(false);
    expect(entry.flag_baro_gated).toBe(true);
    expect(entry.flag_launched).toBe(false);
    expect(entry.flag_mag_valid).toBe(true);
  });

  it('should return UNKNOWN for unrecognized FSM state', () => {
    const buf = new Uint8Array(HR_ENTRY_SIZE);
    write_u8(buf, 5, 0xFF); // unknown FSM state

    const entry = decode_hr_entry(buf);
    expect(entry.fsm_name).toBe('UNKNOWN(255)');
  });

  it('should throw on wrong buffer size', () => {
    expect(() => decode_hr_entry(new Uint8Array(32))).toThrow('HR entry must be 64 bytes');
  });

  it('should handle non-trivial quaternion values', () => {
    const buf = new Uint8Array(HR_ENTRY_SIZE);
    // Pack a quaternion with x=0.5 -> packed = 0.5 * 16384 = 8192
    write_i16_le(buf, 44, 8192);   // x_packed
    write_i16_le(buf, 46, 0);      // y_packed
    write_i16_le(buf, 48, 0);      // z_packed

    const entry = decode_hr_entry(buf);
    expect(entry.quat_x).toBeCloseTo(0.5, 4);
    expect(entry.quat_y).toBeCloseTo(0.0, 4);
    expect(entry.quat_z).toBeCloseTo(0.0, 4);
    // w = sqrt(1 - 0.25) = sqrt(0.75) ~ 0.8660
    expect(entry.quat_w).toBeCloseTo(Math.sqrt(0.75), 4);
  });
});

// ---------------------------------------------------------------------------
// Test: LR entry decode
// ---------------------------------------------------------------------------

describe('decode_lr_entry', () => {
  it('should decode a 64-byte LR entry with known values and verify all derived fields', () => {
    const buf = new Uint8Array(LR_ENTRY_SIZE);

    // timestamp_us = 2000000 (2 seconds)
    write_u32_le(buf, 0, 2000000);
    // fsm_state = 0x00 (PAD)
    write_u8(buf, 4, 0x00);
    // flags = 0x02 (test_mode)
    write_u8(buf, 5, 0x02);
    // mag_raw = [100, -200, 300]
    write_i16_le(buf, 6, 100);
    write_i16_le(buf, 8, -200);
    write_i16_le(buf, 10, 300);
    // mag_temp_c100 = 2300 -> 23.0 C
    write_i16_le(buf, 12, 2300);
    // batt_mv = 7400 -> 7.4 V
    write_u16_le(buf, 14, 7400);
    // batt_ma = 350
    write_i16_le(buf, 16, 350);
    // cont_scaled = [10, 20, 30, 40]
    write_u8(buf, 18, 10);
    write_u8(buf, 19, 20);
    write_u8(buf, 20, 30);
    write_u8(buf, 21, 40);
    // gps_lat_deg7 = 408374500 (40.8374500 deg)
    write_i32_le(buf, 22, 408374500);
    // gps_lon_deg7 = -739512300 (-73.9512300 deg)
    write_i32_le(buf, 26, -739512300);
    // gps_alt_dm = 1500 -> 150.0 m
    write_i16_le(buf, 30, 1500);
    // gps_vel_d_cmps = -250 -> -2.5 m/s
    write_i16_le(buf, 32, -250);
    // gps_sats = 12
    write_u8(buf, 34, 12);
    // gps_fix = 3
    write_u8(buf, 35, 3);
    // gps_pdop = 15
    write_u8(buf, 36, 15);
    // gps_fresh = 1
    write_u8(buf, 37, 1);
    // radio_tx_seq = 42
    write_u8(buf, 38, 42);
    // radio_rx_good = 10
    write_u8(buf, 39, 10);
    // radio_rx_bad = 2
    write_u8(buf, 40, 2);
    // radio_rssi = -80
    write_i8(buf, 41, -80);
    // radio_snr = 10
    write_i8(buf, 42, 10);
    // pyro_arm_cont = 0xA5 -> arm_bitmap=0x0A, cont_bitmap=0x05
    write_u8(buf, 43, 0xA5);
    // reserved bytes 44..63 = 0

    const entry = decode_lr_entry(buf);

    // Timestamp
    expect(entry.timestamp_us).toBe(2000000);
    expect(entry.timestamp_s).toBeCloseTo(2.0, 6);

    // FSM state
    expect(entry.fsm_state).toBe(0x00);
    expect(entry.fsm_name).toBe('PAD');

    // Flags
    expect(entry.flags).toBe(0x02);
    expect(entry.flag_firing).toBe(false);
    expect(entry.flag_test_mode).toBe(true);
    expect(entry.flag_sim_active).toBe(false);

    // Magnetometer
    expect(entry.mag_x_raw).toBe(100);
    expect(entry.mag_y_raw).toBe(-200);
    expect(entry.mag_z_raw).toBe(300);
    expect(entry.mag_temp_c).toBeCloseTo(23.0, 2);

    // Battery
    expect(entry.batt_mv).toBe(7400);
    expect(entry.batt_v).toBeCloseTo(7.4, 3);
    expect(entry.batt_ma).toBe(350);

    // Continuity
    expect(entry.cont_scaled).toEqual([10, 20, 30, 40]);

    // GPS
    expect(entry.gps_lat_deg7).toBe(408374500);
    expect(entry.gps_lon_deg7).toBe(-739512300);
    expect(entry.gps_lat_deg).toBeCloseTo(40.83745, 5);
    expect(entry.gps_lon_deg).toBeCloseTo(-73.95123, 5);
    expect(entry.gps_alt_dm).toBe(1500);
    expect(entry.gps_alt_m).toBeCloseTo(150.0, 1);
    expect(entry.gps_vel_d_cmps).toBe(-250);
    expect(entry.gps_vel_d_mps).toBeCloseTo(-2.5, 2);
    expect(entry.gps_sats).toBe(12);
    expect(entry.gps_fix).toBe(3);
    expect(entry.gps_pdop).toBe(15);
    expect(entry.gps_fresh).toBe(true);

    // Radio
    expect(entry.radio_tx_seq).toBe(42);
    expect(entry.radio_rx_good).toBe(10);
    expect(entry.radio_rx_bad).toBe(2);
    expect(entry.radio_rssi).toBe(-80);
    expect(entry.radio_snr).toBe(10);

    // Pyro
    expect(entry.pyro_arm_bitmap).toBe(0x0A);
    expect(entry.pyro_cont_bitmap).toBe(0x05);
  });

  it('should handle mag_temp sentinel (0x7FFF) as null', () => {
    const buf = new Uint8Array(LR_ENTRY_SIZE);
    // Write 0x7FFF for mag_temp_c100 — this means "no sensor"
    write_i16_le(buf, 12, 0x7FFF);

    const entry = decode_lr_entry(buf);
    expect(entry.mag_temp_c).toBeNull();
  });

  it('should handle gps_fresh=0 as false', () => {
    const buf = new Uint8Array(LR_ENTRY_SIZE);
    write_u8(buf, 37, 0);

    const entry = decode_lr_entry(buf);
    expect(entry.gps_fresh).toBe(false);
  });

  it('should throw on wrong buffer size', () => {
    expect(() => decode_lr_entry(new Uint8Array(32))).toThrow('LR entry must be 64 bytes');
  });

  it('should decode all LR flags correctly', () => {
    const buf = new Uint8Array(LR_ENTRY_SIZE);
    write_u8(buf, 5, 0x07); // firing + test_mode + sim_active

    const entry = decode_lr_entry(buf);
    expect(entry.flag_firing).toBe(true);
    expect(entry.flag_test_mode).toBe(true);
    expect(entry.flag_sim_active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test: Summary entries decode
// ---------------------------------------------------------------------------

describe('decode_summary_entries', () => {
  it('should decode two summary entries from a payload buffer', () => {
    const msg1 = 'Liftoff detected';
    const msg2 = 'Apogee at 1500m';
    const enc1 = new TextEncoder().encode(msg1);
    const enc2 = new TextEncoder().encode(msg2);

    // Total: (4 + 1 + msg1.length) + (4 + 1 + msg2.length)
    const total = 5 + enc1.length + 5 + enc2.length;
    const buf = new Uint8Array(total);

    // Entry 1: timestamp_ms = 5000, msg = "Liftoff detected"
    let offset = 0;
    write_u32_le(buf, offset, 5000);
    buf[offset + 4] = enc1.length;
    buf.set(enc1, offset + 5);
    offset += 5 + enc1.length;

    // Entry 2: timestamp_ms = 12000, msg = "Apogee at 1500m"
    write_u32_le(buf, offset, 12000);
    buf[offset + 4] = enc2.length;
    buf.set(enc2, offset + 5);

    const entries = decode_summary_entries(buf);

    expect(entries).toHaveLength(2);

    expect(entries[0].timestamp_ms).toBe(5000);
    expect(entries[0].timestamp_s).toBeCloseTo(5.0, 3);
    expect(entries[0].msg).toBe('Liftoff detected');

    expect(entries[1].timestamp_ms).toBe(12000);
    expect(entries[1].timestamp_s).toBeCloseTo(12.0, 3);
    expect(entries[1].msg).toBe('Apogee at 1500m');
  });

  it('should stop at erased region sentinel (0xFFFFFFFF)', () => {
    const msg = 'Hello';
    const enc = new TextEncoder().encode(msg);
    // One valid entry, then sentinel
    const buf = new Uint8Array(5 + enc.length + 4);
    write_u32_le(buf, 0, 1000);
    buf[4] = enc.length;
    buf.set(enc, 5);

    // Sentinel at next position
    write_u32_le(buf, 5 + enc.length, 0xFFFFFFFF);

    const entries = decode_summary_entries(buf);
    expect(entries).toHaveLength(1);
    expect(entries[0].msg).toBe('Hello');
  });

  it('should stop on truncated entry (not enough bytes for header)', () => {
    // Only 3 bytes — too short for timestamp_ms(4) + len(1)
    const buf = new Uint8Array([0x01, 0x02, 0x03]);
    const entries = decode_summary_entries(buf);
    expect(entries).toHaveLength(0);
  });

  it('should stop on truncated entry (not enough bytes for message)', () => {
    const buf = new Uint8Array(10);
    write_u32_le(buf, 0, 1000);
    buf[4] = 20; // msg_len = 20, but only 5 remaining bytes
    const entries = decode_summary_entries(buf);
    expect(entries).toHaveLength(0);
  });

  it('should return empty array for empty buffer', () => {
    const entries = decode_summary_entries(new Uint8Array(0));
    expect(entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test: HR/LR header parse
// ---------------------------------------------------------------------------

describe('parse_hr_lr_header', () => {
  it('should parse a valid 16-byte CASP header with correct CRC', () => {
    const header = new Uint8Array(HR_LR_HEADER_SIZE);

    // Magic: CASP
    header.set(MAGIC_CASP, 0);
    // stream_id = 0x01 (HR)
    header[4] = 0x01;
    // entry_size = 64
    header[5] = 64;
    // reserved bytes 6-7 = 0
    // count = 100
    write_u32_le(header, 8, 100);

    // Compute CRC over first 12 bytes and write to bytes 12-15
    const crc = crc32_compute(header.subarray(0, 12));
    write_u32_le(header, 12, crc);

    const result = parse_hr_lr_header(header);

    expect(result.stream_id).toBe(0x01);
    expect(result.entry_size).toBe(64);
    expect(result.count).toBe(100);
  });

  it('should parse an LR header (stream_id = 0x02)', () => {
    const header = new Uint8Array(HR_LR_HEADER_SIZE);
    header.set(MAGIC_CASP, 0);
    header[4] = 0x02; // LR
    header[5] = 64;
    write_u32_le(header, 8, 50);
    const crc = crc32_compute(header.subarray(0, 12));
    write_u32_le(header, 12, crc);

    const result = parse_hr_lr_header(header);
    expect(result.stream_id).toBe(0x02);
    expect(result.count).toBe(50);
  });

  it('should throw on bad magic', () => {
    const header = new Uint8Array(HR_LR_HEADER_SIZE);
    header[0] = 0xDE; // wrong magic
    header[1] = 0xAD;
    header[2] = 0xBE;
    header[3] = 0xEF;

    expect(() => parse_hr_lr_header(header)).toThrow('Bad magic');
  });

  it('should throw on CRC mismatch', () => {
    const header = new Uint8Array(HR_LR_HEADER_SIZE);
    header.set(MAGIC_CASP, 0);
    header[4] = 0x01;
    header[5] = 64;
    write_u32_le(header, 8, 100);
    // Write correct CRC
    const crc = crc32_compute(header.subarray(0, 12));
    write_u32_le(header, 12, crc);

    // Corrupt one byte in the counted region
    header[5] = 32; // change entry_size after CRC was computed

    expect(() => parse_hr_lr_header(header)).toThrow('CRC mismatch');
  });

  it('should throw on too-short header', () => {
    const header = new Uint8Array(8);
    expect(() => parse_hr_lr_header(header)).toThrow('too short');
  });
});

// ---------------------------------------------------------------------------
// Test: Summary header parse
// ---------------------------------------------------------------------------

describe('parse_summary_header', () => {
  it('should parse a valid 12-byte SUMM header with correct CRC', () => {
    const header = new Uint8Array(SUMMARY_HEADER_SIZE);

    // Magic: SUMM
    header.set(MAGIC_SUMM, 0);
    // payload_size = 256
    write_u32_le(header, 4, 256);
    // CRC over first 8 bytes
    const crc = crc32_compute(header.subarray(0, 8));
    write_u32_le(header, 8, crc);

    const result = parse_summary_header(header);
    expect(result.payload_size).toBe(256);
  });

  it('should throw on bad magic', () => {
    const header = new Uint8Array(SUMMARY_HEADER_SIZE);
    header[0] = 0xFF;
    expect(() => parse_summary_header(header)).toThrow('Bad magic');
  });

  it('should throw on CRC mismatch', () => {
    const header = new Uint8Array(SUMMARY_HEADER_SIZE);
    header.set(MAGIC_SUMM, 0);
    write_u32_le(header, 4, 256);
    const crc = crc32_compute(header.subarray(0, 8));
    write_u32_le(header, 8, crc);

    // Corrupt payload_size after CRC was computed
    write_u32_le(header, 4, 512);

    expect(() => parse_summary_header(header)).toThrow('CRC mismatch');
  });

  it('should throw on too-short header', () => {
    const header = new Uint8Array(4);
    expect(() => parse_summary_header(header)).toThrow('too short');
  });
});

// ---------------------------------------------------------------------------
// Test: Metadata parse
// ---------------------------------------------------------------------------

describe('parse_metadata', () => {
  it('should parse a valid 28-byte META response with correct CRC', () => {
    const data = new Uint8Array(METADATA_SIZE);

    // Magic: META
    data.set(MAGIC_META, 0);
    // hr_count = 5000
    write_u32_le(data, 4, 5000);
    // lr_count = 200
    write_u32_le(data, 8, 200);
    // summary_bytes = 1024
    write_u32_le(data, 12, 1024);
    // hr_addr = 0x00100000
    write_u32_le(data, 16, 0x00100000);
    // lr_addr = 0x00200000
    write_u32_le(data, 20, 0x00200000);
    // CRC over first 24 bytes
    const crc = crc32_compute(data.subarray(0, 24));
    write_u32_le(data, 24, crc);

    const meta = parse_metadata(data);

    expect(meta.hr_count).toBe(5000);
    expect(meta.lr_count).toBe(200);
    expect(meta.summary_bytes).toBe(1024);
    expect(meta.hr_addr).toBe(0x00100000);
    expect(meta.lr_addr).toBe(0x00200000);
  });

  it('should throw on bad magic', () => {
    const data = new Uint8Array(METADATA_SIZE);
    data[0] = 0xBA;
    data[1] = 0xAD;
    expect(() => parse_metadata(data)).toThrow('Bad magic');
  });

  it('should throw on CRC mismatch', () => {
    const data = new Uint8Array(METADATA_SIZE);
    data.set(MAGIC_META, 0);
    write_u32_le(data, 4, 5000);
    write_u32_le(data, 8, 200);
    write_u32_le(data, 12, 1024);
    write_u32_le(data, 16, 0x00100000);
    write_u32_le(data, 20, 0x00200000);
    const crc = crc32_compute(data.subarray(0, 24));
    write_u32_le(data, 24, crc);

    // Corrupt hr_count after CRC was computed
    write_u32_le(data, 4, 9999);

    expect(() => parse_metadata(data)).toThrow('CRC mismatch');
  });

  it('should throw on too-short data', () => {
    const data = new Uint8Array(10);
    expect(() => parse_metadata(data)).toThrow('too short');
  });
});

// ---------------------------------------------------------------------------
// Test: Data CRC verification
// ---------------------------------------------------------------------------

describe('verify_data_crc', () => {
  it('should not throw for matching CRC', () => {
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    const crc = crc32_compute(data);
    expect(() => verify_data_crc(data, crc)).not.toThrow();
  });

  it('should throw for mismatched CRC', () => {
    const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
    expect(() => verify_data_crc(data, 0xDEADBEEF)).toThrow('Data CRC mismatch');
  });

  it('should work for empty data', () => {
    const data = new Uint8Array(0);
    const crc = crc32_compute(data);
    expect(() => verify_data_crc(data, crc)).not.toThrow();
  });
});
