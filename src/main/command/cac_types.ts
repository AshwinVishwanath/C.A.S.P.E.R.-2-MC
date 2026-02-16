/**
 * CAC (Command-Acknowledge-Confirm) state machine types.
 *
 * Defines the phase enum, request/response interfaces, UI state,
 * and callback contracts used by the CacMachine.
 *
 * @module command/cac_types
 */

// ---------------------------------------------------------------------------
// Phase enum
// ---------------------------------------------------------------------------

/** Current phase of the CAC exchange. */
export type CacPhase =
  | 'idle'
  | 'sending_cmd'
  | 'awaiting_ack'
  | 'verifying_ack'
  | 'sending_confirm'
  | 'complete'
  | 'failed';

// ---------------------------------------------------------------------------
// Command type
// ---------------------------------------------------------------------------

/** Type of command being executed through the CAC machine. */
export type CacCommandType = 'arm' | 'disarm' | 'fire' | 'config' | 'testmode';

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/** Encapsulates a single CAC command transaction. */
export interface CacRequest {
  /** Command type. */
  type: CacCommandType;
  /** Pyro channel (1-4 for arm/disarm/fire). */
  channel?: number;
  /** Action byte (0x01=ARM, 0x00=DISARM). */
  action?: number;
  /** Fire duration in ms (for fire commands). */
  duration_ms?: number;
  /** Unique 16-bit nonce for this transaction. */
  nonce: number;
  /** Built command packet ready for transmission. */
  payload: Uint8Array;
}

// ---------------------------------------------------------------------------
// UI state snapshot
// ---------------------------------------------------------------------------

/** Read-only state snapshot for the renderer / UI layer. */
export interface CacUiState {
  /** True while a CAC exchange is in progress. */
  busy: boolean;
  /** Active command type, or null when idle. */
  command_type: CacCommandType | null;
  /** Target pyro channel (1-4), or null when idle. */
  target_channel: number | null;
  /** Human-readable error message on failure, or null. */
  error: string | null;
  /** Raw NACK error code if the failure was a NACK, or null. */
  nack_code: number | null;
  /** Number of retransmissions attempted so far. */
  retry_count: number;
}

// ---------------------------------------------------------------------------
// Callbacks
// ---------------------------------------------------------------------------

/** Callbacks the CAC machine uses to interact with the transport and UI. */
export interface CacCallbacks {
  /** Send raw bytes to the transport layer (LoRa / serial). */
  send: (data: Uint8Array) => void;
  /** Notify the UI of a state change. */
  on_state_change: (state: CacUiState) => void;
}
