/**
 * Protocol constants for C.A.S.P.E.R. 2 Mission Control.
 *
 * All magic bytes, message IDs, timeouts, sizes, and CRC parameters
 * as specified in PRD Section 3.3.
 *
 * @module protocol/constants
 */

import { NackError } from './types';

// ---------------------------------------------------------------------------
// Message IDs (PRD Section 3.3)
// ---------------------------------------------------------------------------

/** FC_MSG_FAST — high-rate telemetry. */
export const MSG_ID_FAST = 0x01;

/** FC_MSG_GPS — GPS position report. */
export const MSG_ID_GPS = 0x02;

/** FC_MSG_EVENT — discrete event notification. */
export const MSG_ID_EVENT = 0x03;

/** GS_MSG_TELEM — ground station telemetry relay. */
export const MSG_ID_GS_TELEM = 0x10;

/** GS_MSG_GPS — ground station GPS relay. */
export const MSG_ID_GS_GPS = 0x11;

/** GS_MSG_EVENT — ground station event relay. */
export const MSG_ID_GS_EVENT = 0x12;

/** GS_MSG_STATUS — ground station status. */
export const MSG_ID_GS_STATUS = 0x13;

/** GS_MSG_CORRUPT — corrupted message report from GS. */
export const MSG_ID_GS_CORRUPT = 0x14;

/** CMD_ARM — arm/disarm command. */
export const MSG_ID_CMD_ARM = 0x80;

/** CMD_FIRE — fire command. */
export const MSG_ID_CMD_FIRE = 0x81;

/** ACK_ARM — arm acknowledgement. */
export const MSG_ID_ACK_ARM = 0xA0;

/** ACK_FIRE — fire acknowledgement. */
export const MSG_ID_ACK_FIRE = 0xA1;

/** ACK_CONFIG — configuration acknowledgement. */
export const MSG_ID_ACK_CONFIG = 0xA3;

/** NACK — negative acknowledgement. */
export const MSG_ID_NACK = 0xE0;

/** CONFIRM — CAC confirmation. */
export const MSG_ID_CONFIRM = 0xF0;

/** ABORT — CAC abort. */
export const MSG_ID_ABORT = 0xF1;

// ---------------------------------------------------------------------------
// Magic bytes (PRD Section 3.3)
// ---------------------------------------------------------------------------

/** First magic byte in command packets. */
export const MAGIC_1 = 0xCA;

/** Second magic byte in command packets. */
export const MAGIC_2 = 0x5A;

// ---------------------------------------------------------------------------
// Timeouts (PRD Section 3.3)
// ---------------------------------------------------------------------------

/** CAC leg timeout in milliseconds. */
export const CAC_LEG_TIMEOUT_MS = 2000;

/** Overall CAC transaction timeout in milliseconds. */
export const CAC_TOTAL_TIMEOUT_MS = 10000;

/** Telemetry stale threshold in milliseconds. */
export const STALE_THRESHOLD_MS = 500;

/** Duration of stale data before triggering audio alert in milliseconds. */
export const STALE_AUDIO_TRIGGER_MS = 2000;

// ---------------------------------------------------------------------------
// CRC-32 parameters (STM32 hardware CRC peripheral)
// ---------------------------------------------------------------------------

/** CRC-32 polynomial (unreflected, same as STM32 hardware CRC). */
export const CRC32_POLY = 0x04C11DB7;

/** CRC-32 initial value. */
export const CRC32_INIT = 0xFFFFFFFF;

// ---------------------------------------------------------------------------
// Packet sizes in bytes (PRD Section 3.3)
// ---------------------------------------------------------------------------

/** FC_MSG_FAST payload size (excluding msg_id). Total: 19 bytes. */
export const SIZE_FC_MSG_FAST = 19;

/** FC_MSG_GPS payload size. Total: 17 bytes. */
export const SIZE_FC_MSG_GPS = 17;

/** FC_MSG_EVENT payload size. Total: 11 bytes. */
export const SIZE_FC_MSG_EVENT = 11;

/** GS_MSG_TELEM payload size. Total: 38 bytes. */
export const SIZE_GS_MSG_TELEM = 38;

/** CMD_ARM packet size. Total: 12 bytes. */
export const SIZE_CMD_ARM = 12;

/** CMD_FIRE packet size. Total: 13 bytes. */
export const SIZE_CMD_FIRE = 13;

/** CONFIRM packet size. Total: 9 bytes. */
export const SIZE_CONFIRM = 9;

/** ABORT packet size. Total: 9 bytes. */
export const SIZE_ABORT = 9;

/** ACK_ARM payload size. Total: 12 bytes. */
export const SIZE_ACK_ARM = 12;

/** ACK_FIRE payload size. Total: 13 bytes. */
export const SIZE_ACK_FIRE = 13;

/** ACK_CONFIG payload size. Total: 13 bytes. */
export const SIZE_ACK_CONFIG = 13;

/** NACK payload size. Total: 10 bytes. */
export const SIZE_NACK = 10;

// ---------------------------------------------------------------------------
// Ring buffer (PRD Section 3.3)
// ---------------------------------------------------------------------------

/** Ring buffer depth for telemetry history. */
export const RING_BUFFER_DEPTH = 150;

// ---------------------------------------------------------------------------
// Scaling factors (PRD Section 4)
// ---------------------------------------------------------------------------

/** FC_TLM_ALT scaling: raw * ALT_SCALE = metres. */
export const ALT_SCALE = 10.0;

/** FC_TLM_VEL scaling: raw * VEL_SCALE = m/s. */
export const VEL_SCALE = 0.1;

/** FC_FSM_TIME scaling: raw * TIME_SCALE = seconds. */
export const TIME_SCALE = 0.1;

/** FC_PWR_BATT scaling: 6.0 + raw * BATT_SCALE = volts. */
export const BATT_SCALE = 0.012;

/** FC_PWR_BATT offset voltage. */
export const BATT_OFFSET = 6.0;

/** FC_GPS_ALT scaling: raw * GPS_ALT_SCALE = metres. */
export const GPS_ALT_SCALE = 10.0;

// ---------------------------------------------------------------------------
// NACK error messages (PRD Section 17.5)
// ---------------------------------------------------------------------------

/** Human-readable descriptions of NACK error codes. */
export const NACK_ERROR_MESSAGES: Record<NackError, string> = {
  [NackError.CrcFail]: 'CRC check failed',
  [NackError.BadState]: 'Command not valid in current flight state',
  [NackError.NotArmed]: 'Channel not armed',
  [NackError.NoTestMode]: 'Test mode not available',
  [NackError.NonceReuse]: 'Nonce has already been used',
  [NackError.NoContinuity]: 'No continuity detected on channel',
  [NackError.LowBattery]: 'Battery voltage too low',
  [NackError.SelfTest]: 'Self-test failure',
  [NackError.CfgTooLarge]: 'Configuration payload too large',
  [NackError.FlashFail]: 'Flash write failure'
};
