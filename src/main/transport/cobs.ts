/**
 * COBS (Consistent Overhead Byte Stuffing) encode/decode.
 *
 * Frame delimiter is 0x00. Encoded output never contains 0x00,
 * so 0x00 can be used unambiguously as a frame boundary on the wire.
 *
 * Convention used here: functions operate on the payload/frame
 * WITHOUT the trailing 0x00 delimiter. The caller is responsible
 * for appending/stripping the delimiter byte when sending/receiving.
 */

/** Frame delimiter byte value. */
const FRAME_DELIMITER = 0x00;

/** Maximum COBS code-block length (254 data bytes + 1 overhead byte). */
const COBS_MAX_BLOCK_LEN = 254;

/**
 * COBS-encode a payload.
 *
 * @param data - Raw payload bytes to encode.
 * @returns Encoded bytes WITHOUT the trailing 0x00 delimiter.
 */
export function cobs_encode(data: Uint8Array): Uint8Array {
  if (data.length === 0) {
    // Empty payload encodes to a single overhead byte [0x01].
    return new Uint8Array([0x01]);
  }

  // Worst-case encoded size: original length + ceil(length/254) overhead bytes.
  const out = new Uint8Array(data.length + Math.ceil(data.length / COBS_MAX_BLOCK_LEN) + 1);
  let write_idx = 0;

  // Pointer to the code byte that will be back-patched with the distance
  // to the next zero (or end of block).
  let code_idx = write_idx;
  write_idx++;
  let code = 1; // Distance counter (starts at 1 because code byte itself counts).

  for (let i = 0; i < data.length; i++) {
    if (data[i] === FRAME_DELIMITER) {
      // Back-patch the code byte with the distance to this zero.
      out[code_idx] = code;
      code_idx = write_idx;
      write_idx++;
      code = 1;
    } else {
      out[write_idx] = data[i];
      write_idx++;
      code++;

      if (code === COBS_MAX_BLOCK_LEN + 1) {
        // Block full (254 data bytes). Back-patch and start new block.
        out[code_idx] = code;
        code_idx = write_idx;
        write_idx++;
        code = 1;
      }
    }
  }

  // Back-patch the final code byte.
  out[code_idx] = code;

  return out.slice(0, write_idx);
}

/**
 * COBS-decode a frame.
 *
 * @param frame - Encoded frame bytes WITHOUT the trailing 0x00 delimiter.
 * @returns Decoded payload, or null if the frame is malformed.
 */
export function cobs_decode(frame: Uint8Array): Uint8Array | null {
  if (frame.length === 0) {
    // Empty frame is malformed (need at least one code byte).
    return null;
  }

  // Decoded data is at most frame.length - 1 bytes (minus overhead bytes).
  const out = new Uint8Array(frame.length);
  let write_idx = 0;
  let read_idx = 0;

  while (read_idx < frame.length) {
    const code = frame[read_idx];

    if (code === 0) {
      // 0x00 must never appear inside a COBS-encoded frame.
      return null;
    }

    read_idx++;

    // Copy (code - 1) data bytes from the frame.
    const data_count = code - 1;
    if (read_idx + data_count > frame.length) {
      // Frame too short for the advertised block length.
      return null;
    }

    for (let i = 0; i < data_count; i++) {
      if (frame[read_idx] === FRAME_DELIMITER) {
        // 0x00 found inside encoded block data -- malformed.
        return null;
      }
      out[write_idx] = frame[read_idx];
      write_idx++;
      read_idx++;
    }

    // If code < 255 and we are not at the end, the implicit zero is restored.
    if (code < COBS_MAX_BLOCK_LEN + 1 && read_idx < frame.length) {
      out[write_idx] = FRAME_DELIMITER;
      write_idx++;
    }
  }

  return out.slice(0, write_idx);
}
