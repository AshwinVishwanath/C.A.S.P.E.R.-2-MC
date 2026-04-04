/**
 * Hand-crafted known-good byte arrays for all C.A.S.P.E.R. 2 message types.
 *
 * Each fixture is a complete packet with a valid standard CRC-32 (CRC-32/ISO-HDLC).
 * The CRC covers all bytes from the start up to (but not including) the last 4 bytes,
 * which are the CRC itself in little-endian order.
 *
 * All multi-byte fields are little-endian as per the protocol specification.
 *
 * @module test/fixtures/packets
 */

// ---------------------------------------------------------------------------
// FC_MSG_FAST (msg_id 0x01, 20 bytes)
// ---------------------------------------------------------------------------

/**
 * Valid FC_MSG_FAST with pad-idle telemetry.
 *
 * Layout:
 *   [0]     msg_id = 0x01
 *   [1-2]   status = 0x0000 (Pad, no cont/arm/fired/error)
 *   [3-4]   alt_raw = 0 (0.0 m)
 *   [5-6]   vel_raw = 0 (0.0 m/s)
 *   [7-11]  quat = identity [w=1, x=0, y=0, z=0] (drop_idx=0, A=B=C=0)
 *   [12-13] time_raw = 0 (0.0 s)
 *   [14]    batt_raw = 100 (7.2 V)
 *   [15]    seq = 0
 *   [16-19] CRC-32
 *
 * Expected parsed values:
 *   fsm_state = Pad (0x0)
 *   alt_m = 0, vel_mps = 0, batt_v = 7.2, flight_time_s = 0, seq = 0
 */
export const FC_FAST_PAD_IDLE = new Uint8Array([
  0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x64, 0x00,
  0x67, 0x74, 0x42, 0x43
]);

// ---------------------------------------------------------------------------
// FC_MSG_GPS (msg_id 0x02, 17 bytes)
// ---------------------------------------------------------------------------

/**
 * Valid FC_MSG_GPS with a 3D fix.
 *
 * Layout:
 *   [0]     msg_id = 0x02
 *   [1-4]   dlat = 1000 mm (1.0 m)
 *   [5-8]   dlon = 2000 mm (2.0 m)
 *   [9-10]  alt_raw = 15 (150.0 m MSL)
 *   [11]    fix_type = 3 (3D)
 *   [12]    sat_count = 12
 *   [13-16] CRC-32
 *
 * Expected parsed values:
 *   dlat_m = 1.0, dlon_m = 2.0, alt_msl_m = 150.0
 *   fix_type = 3, sat_count = 12, range_saturated = false
 */
export const FC_GPS_3D_FIX = new Uint8Array([
  0x02, 0xE8, 0x03, 0x00, 0x00, 0xD0, 0x07, 0x00,
  0x00, 0x0F, 0x00, 0x03, 0x0C, 0xF2, 0xA7, 0x11,
  0x01
]);

// ---------------------------------------------------------------------------
// FC_MSG_EVENT (msg_id 0x03, 11 bytes)
// ---------------------------------------------------------------------------

/**
 * Valid FC_MSG_EVENT with an Apogee event.
 *
 * Layout:
 *   [0]    msg_id = 0x03
 *   [1]    event_type = 0x03 (Apogee)
 *   [2-3]  event_data = 50 (apogee marker, store multiplies by 10 -> 500 m)
 *   [4-5]  flight_time = 300 (30.0 s)
 *   [6]    reserved = 0x00
 *   [7-10] CRC-32
 *
 * Expected parsed values:
 *   event_type = 3, event_data = 50, flight_time_s = 30.0
 */
export const FC_EVENT_APOGEE = new Uint8Array([
  0x03, 0x03, 0x32, 0x00, 0x2C, 0x01, 0x00, 0x6E,
  0xD2, 0xBD, 0xD9
]);

// ---------------------------------------------------------------------------
// GS_MSG_TELEM (msg_id 0x10, 38 bytes)
// ---------------------------------------------------------------------------

/**
 * Valid GS_MSG_TELEM during boost phase.
 *
 * Layout:
 *   [0]     msg_id = 0x10
 *   [1-2]   status: byte0=0x01 (CNT1), byte1=0x10 (FSM=Boost)
 *   [3-4]   alt_raw = 100 (100.0 m)
 *   [5-6]   vel_raw = 500 (50.0 m/s)
 *   [7-11]  quat = identity
 *   [12-13] time_raw = 50 (5.0 s)
 *   [14]    batt_raw = 100 (7.2 V)
 *   [15]    seq = 42
 *   [16-17] rssi_raw = -1200 (-120.0 dBm)
 *   [18]    snr_raw = 40 (10.0 dB)
 *   [19-20] freq_err_raw = 50 (50 Hz)
 *   [21-22] data_age_ms = 100
 *   [23]    recovery = 0x00 (not recovered)
 *   [24-25] mach_raw = 147 (0.147)
 *   [26-27] qbar_raw = 1500 Pa
 *   [28-29] roll_raw = 0 (0.0 deg)
 *   [30-31] pitch_raw = 900 (90.0 deg)
 *   [32-33] yaw_raw = 0 (0.0 deg)
 *   [34-37] CRC-32
 *
 * Expected parsed values:
 *   fsm_state = Boost, alt_m = 100, vel_mps = 50, batt_v = 7.2
 *   seq = 42, rssi_dbm = -120, snr_db = 10, data_age_ms = 100
 *   stale = false, mach = 0.147, qbar_pa = 1500, pitch_deg = 90
 */
export const GS_TELEM_BOOST = new Uint8Array([
  0x10, 0x01, 0x10, 0x64, 0x00, 0xF4, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x32, 0x00, 0x64, 0x2A,
  0x50, 0xFB, 0x28, 0x32, 0x00, 0x64, 0x00, 0x00,
  0x93, 0x00, 0xDC, 0x05, 0x00, 0x00, 0x84, 0x03,
  0x00, 0x00, 0xC1, 0xBF, 0xB7, 0xAC
]);

// ---------------------------------------------------------------------------
// ACK_ARM (msg_id 0xA0, 12 bytes)
// ---------------------------------------------------------------------------

/**
 * Valid ACK_ARM for channel 1 arm.
 *
 * Layout:
 *   [0]    msg_id = 0xA0
 *   [1-2]  nonce = 0x1234
 *   [3]    echo_channel = 0 (0-indexed, user channel 1)
 *   [4]    echo_action = 1 (arm)
 *   [5]    arm_state = 0x01 (ch1 armed)
 *   [6]    cont_state = 0x01 (ch1 continuity)
 *   [7]    reserved = 0x00
 *   [8-11] CRC-32
 *
 * Expected parsed values:
 *   nonce = 0x1234, echo_channel = 0, echo_action = 1
 *   arm_state = 1, cont_state = 1
 */
export const ACK_ARM_CH1 = new Uint8Array([
  0xA0, 0x34, 0x12, 0x00, 0x01, 0x01, 0x01, 0x00,
  0x27, 0x26, 0x38, 0x7D
]);

// ---------------------------------------------------------------------------
// ACK_FIRE (msg_id 0xA1, 13 bytes)
// ---------------------------------------------------------------------------

/**
 * Valid ACK_FIRE for channel 2 with 100ms duration.
 *
 * Layout:
 *   [0]    msg_id = 0xA1
 *   [1-2]  nonce = 0x5678
 *   [3]    echo_channel = 1 (0-indexed, user channel 2)
 *   [4]    echo_duration = 100 ms
 *   [5]    flags = 0x02 (channel_armed=1, test_mode=0)
 *   [6]    cont_state = 0x03 (ch1+ch2 continuity)
 *   [7-8]  reserved = 0x00, 0x00
 *   [9-12] CRC-32
 *
 * Expected parsed values:
 *   nonce = 0x5678, echo_channel = 1, echo_duration = 100
 *   test_mode = false, channel_armed = true, cont_state = 3
 */
export const ACK_FIRE_CH2 = new Uint8Array([
  0xA1, 0x78, 0x56, 0x01, 0x64, 0x02, 0x03, 0x00,
  0x00, 0x53, 0xA0, 0xC7, 0x25
]);

// ---------------------------------------------------------------------------
// NACK (msg_id 0xE0, 10 bytes)
// ---------------------------------------------------------------------------

/**
 * Valid NACK with NotArmed error (error_code 0x03).
 *
 * Layout:
 *   [0]    msg_id = 0xE0
 *   [1-2]  nonce = 0xABCD
 *   [3]    error_code = 0x03 (NotArmed)
 *   [4-5]  reserved = 0x00, 0x00
 *   [6-9]  CRC-32
 *
 * Expected parsed values:
 *   nonce = 0xABCD, error_code = NackError.NotArmed (3)
 */
export const NACK_NOT_ARMED = new Uint8Array([
  0xE0, 0xCD, 0xAB, 0x03, 0x00, 0x00, 0x16, 0xB6,
  0x2F, 0x2E
]);
