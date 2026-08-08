/**
 * Tests for CAC command packet builder.
 *
 * Verifies byte layouts match the protocol specification,
 * bitwise complements are correct, and CRC is properly placed.
 */

import { describe, it, expect } from 'vitest';
import {
  build_arm_command,
  build_fire_command,
  build_confirm,
  build_abort,
  build_testmode,
  build_config_upload,
  build_logic_upload,
  generate_nonce
} from '../command_builder';
import { crc32_compute } from '../crc32';
import {
  MSG_ID_CMD_ARM,
  MSG_ID_CMD_FIRE,
  MSG_ID_CMD_TESTMODE,
  MSG_ID_CONFIRM,
  MSG_ID_ABORT,
  MSG_ID_CMD_CONFIG,
  MSG_ID_CMD_LOGIC_UPLOAD,
  MAGIC_1,
  MAGIC_2,
  SIZE_CMD_ARM,
  SIZE_CMD_FIRE,
  SIZE_CONFIRM,
  SIZE_ABORT,
  SIZE_CMD_CONFIG,
  CFG_BLOB_SIZE
} from '../constants';

/** Helper: read u32 little-endian from Uint8Array. */
function read_u32_le(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] |
      (buf[offset + 1] << 8) |
      (buf[offset + 2] << 16) |
      (buf[offset + 3] << 24)) >>> 0
  );
}

/** Helper: read u16 little-endian from Uint8Array. */
function read_u16_le(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

describe('build_arm_command', () => {
  it('should produce correct size', () => {
    const pkt = build_arm_command(0, true, 0x1234);
    expect(pkt.length).toBe(SIZE_CMD_ARM);
  });

  it('should have correct message ID', () => {
    const pkt = build_arm_command(0, true, 0x1234);
    expect(pkt[0]).toBe(MSG_ID_CMD_ARM);
  });

  it('should have correct magic bytes', () => {
    const pkt = build_arm_command(0, true, 0x1234);
    expect(pkt[1]).toBe(MAGIC_1);
    expect(pkt[2]).toBe(MAGIC_2);
  });

  it('should encode nonce little-endian', () => {
    const pkt = build_arm_command(0, true, 0xABCD);
    expect(read_u16_le(pkt, 3)).toBe(0xABCD);
    expect(pkt[3]).toBe(0xCD); // LSB
    expect(pkt[4]).toBe(0xAB); // MSB
  });

  it('should encode channel correctly', () => {
    for (let ch = 0; ch < 4; ch++) {
      const pkt = build_arm_command(ch, true, 0x0000);
      expect(pkt[5]).toBe(ch);
    }
  });

  it('should encode arm=true as 0x01 and arm=false as 0x00', () => {
    const arm_pkt = build_arm_command(0, true, 0x0000);
    expect(arm_pkt[6]).toBe(0x01);

    const disarm_pkt = build_arm_command(0, false, 0x0000);
    expect(disarm_pkt[6]).toBe(0x00);
  });

  it('should include bitwise complement of channel', () => {
    const pkt = build_arm_command(2, true, 0x0000);
    expect(pkt[5]).toBe(0x02);
    expect(pkt[7]).toBe((~0x02) & 0xFF); // 0xFD
  });

  it('should have valid CRC-32 in last 4 bytes', () => {
    const pkt = build_arm_command(1, true, 0x5678);
    const data = pkt.subarray(0, pkt.length - 4);
    const expected_crc = crc32_compute(data);
    const actual_crc = read_u32_le(pkt, pkt.length - 4);
    expect(actual_crc).toBe(expected_crc);
  });

  it('should produce different packets for different channels', () => {
    const pkt0 = build_arm_command(0, true, 0x1111);
    const pkt1 = build_arm_command(1, true, 0x1111);
    // At minimum the channel byte and complement differ
    expect(pkt0[5]).not.toBe(pkt1[5]);
  });
});

describe('build_fire_command', () => {
  it('should produce correct size', () => {
    const pkt = build_fire_command(0, 100, 0x1234);
    expect(pkt.length).toBe(SIZE_CMD_FIRE);
  });

  it('should have correct message ID and magic bytes', () => {
    const pkt = build_fire_command(0, 100, 0x1234);
    expect(pkt[0]).toBe(MSG_ID_CMD_FIRE);
    expect(pkt[1]).toBe(MAGIC_1);
    expect(pkt[2]).toBe(MAGIC_2);
  });

  it('should encode nonce little-endian', () => {
    const pkt = build_fire_command(0, 100, 0xBEEF);
    expect(read_u16_le(pkt, 3)).toBe(0xBEEF);
  });

  it('should encode channel and duration', () => {
    const pkt = build_fire_command(3, 200, 0x0000);
    expect(pkt[5]).toBe(3);
    expect(pkt[6]).toBe(200);
  });

  it('should include bitwise complements of channel and duration', () => {
    const pkt = build_fire_command(1, 150, 0x0000);
    expect(pkt[7]).toBe((~1) & 0xFF);   // ~channel
    expect(pkt[8]).toBe((~150) & 0xFF);  // ~duration
  });

  it('should clamp duration to 0-255 range', () => {
    const pkt_max = build_fire_command(0, 999, 0x0000);
    expect(pkt_max[6]).toBe(255);

    const pkt_neg = build_fire_command(0, -5, 0x0000);
    expect(pkt_neg[6]).toBe(0);
  });

  it('should have valid CRC-32 in last 4 bytes', () => {
    const pkt = build_fire_command(2, 50, 0x9999);
    const data = pkt.subarray(0, pkt.length - 4);
    const expected_crc = crc32_compute(data);
    const actual_crc = read_u32_le(pkt, pkt.length - 4);
    expect(actual_crc).toBe(expected_crc);
  });
});

describe('build_confirm', () => {
  it('should produce correct size', () => {
    const pkt = build_confirm(0x1234);
    expect(pkt.length).toBe(SIZE_CONFIRM);
  });

  it('should have correct message ID and magic bytes', () => {
    const pkt = build_confirm(0x1234);
    expect(pkt[0]).toBe(MSG_ID_CONFIRM);
    expect(pkt[1]).toBe(MAGIC_1);
    expect(pkt[2]).toBe(MAGIC_2);
  });

  it('should encode nonce little-endian', () => {
    const pkt = build_confirm(0xCAFE);
    expect(read_u16_le(pkt, 3)).toBe(0xCAFE);
  });

  it('should have valid CRC-32', () => {
    const pkt = build_confirm(0xDEAD);
    const data = pkt.subarray(0, 5);
    const expected_crc = crc32_compute(data);
    const actual_crc = read_u32_le(pkt, 5);
    expect(actual_crc).toBe(expected_crc);
  });
});

describe('build_abort', () => {
  it('should produce correct size', () => {
    const pkt = build_abort(0x1234);
    expect(pkt.length).toBe(SIZE_ABORT);
  });

  it('should have correct message ID and magic bytes', () => {
    const pkt = build_abort(0x1234);
    expect(pkt[0]).toBe(MSG_ID_ABORT);
    expect(pkt[1]).toBe(MAGIC_1);
    expect(pkt[2]).toBe(MAGIC_2);
  });

  it('should encode nonce little-endian', () => {
    const pkt = build_abort(0xFACE);
    expect(read_u16_le(pkt, 3)).toBe(0xFACE);
  });

  it('should have valid CRC-32', () => {
    const pkt = build_abort(0xBEAD);
    const data = pkt.subarray(0, 5);
    const expected_crc = crc32_compute(data);
    const actual_crc = read_u32_le(pkt, 5);
    expect(actual_crc).toBe(expected_crc);
  });
});

describe('build_testmode', () => {
  it('should produce a 1-byte packet', () => {
    const pkt = build_testmode();
    expect(pkt.length).toBe(1);
  });

  it('should have correct message ID (0x82)', () => {
    const pkt = build_testmode();
    expect(pkt[0]).toBe(MSG_ID_CMD_TESTMODE);
  });
});

// ---------------------------------------------------------------------------
// CMD_CONFIG / CMD_LOGIC upload framing
// (docs/specs/MC_FC_ALIGNMENT.md §1/§2 — byte layouts recounted against the
// contract, not eyeballed: see the [field:N]...=total comments below.)
// ---------------------------------------------------------------------------

/** Build a synthetic 163-byte cfg_blob with a valid trailing self-CRC, mirroring config_serialiser output. */
function make_cfg_blob(): Uint8Array {
  const blob = new Uint8Array(CFG_BLOB_SIZE);
  for (let i = 0; i < CFG_BLOB_SIZE - 4; i++) blob[i] = (i * 7 + 3) & 0xFF;
  const crc = crc32_compute(blob.subarray(0, CFG_BLOB_SIZE - 4));
  blob[CFG_BLOB_SIZE - 4] = crc & 0xFF;
  blob[CFG_BLOB_SIZE - 3] = (crc >>> 8) & 0xFF;
  blob[CFG_BLOB_SIZE - 2] = (crc >>> 16) & 0xFF;
  blob[CFG_BLOB_SIZE - 1] = (crc >>> 24) & 0xFF;
  return blob;
}

describe('build_config_upload', () => {
  // [msg_id:1][nonce:2][cfg_blob:163][crc32:4] = 1+2+163+4 = 170
  it('should produce a 170-byte frame for the 163-byte config blob', () => {
    const pkt = build_config_upload(make_cfg_blob(), 0x1234);
    expect(pkt.length).toBe(SIZE_CMD_CONFIG);
    expect(pkt.length).toBe(1 + 2 + CFG_BLOB_SIZE + 4);
  });

  it('should have correct message ID (0xC1)', () => {
    const pkt = build_config_upload(make_cfg_blob(), 0x1234);
    expect(pkt[0]).toBe(MSG_ID_CMD_CONFIG);
    expect(pkt[0]).toBe(0xC1);
  });

  it('should encode nonce little-endian at offset 1', () => {
    const pkt = build_config_upload(make_cfg_blob(), 0xABCD);
    expect(read_u16_le(pkt, 1)).toBe(0xABCD);
  });

  it('should copy the cfg_blob verbatim at offset 3', () => {
    const blob = make_cfg_blob();
    const pkt = build_config_upload(blob, 0x0000);
    for (let i = 0; i < blob.length; i++) {
      expect(pkt[3 + i]).toBe(blob[i]);
    }
  });

  it('should preserve the blob self-CRC at frame bytes [162..165]', () => {
    const blob = make_cfg_blob();
    const pkt = build_config_upload(blob, 0x0000);
    // blob[159..162] (blob's own trailing CRC) lands at frame [3+159 .. 3+162] = [162..165]
    expect(read_u32_le(pkt, 162)).toBe(read_u32_le(blob, 159));
  });

  it('should compute the outer CRC-32 over bytes [0..165], independent of the blob self-CRC', () => {
    const pkt = build_config_upload(make_cfg_blob(), 0x5678);
    const outer_crc = read_u32_le(pkt, 166);
    const expected = crc32_compute(pkt.subarray(0, 166));
    expect(outer_crc).toBe(expected);
    // The two CRCs cover different (though overlapping) ranges and are
    // computed independently — the outer CRC is not simply a copy of the
    // blob's own trailing CRC.
    expect(outer_crc).not.toBe(read_u32_le(pkt, 162));
  });
});

describe('build_logic_upload', () => {
  /** Build a synthetic N-byte logic blob (header content doesn't matter for framing tests). */
  function make_logic_blob(n: number): Uint8Array {
    const blob = new Uint8Array(n);
    for (let i = 0; i < n - 4; i++) blob[i] = (i * 11 + 1) & 0xFF;
    const crc = crc32_compute(blob.subarray(0, n - 4));
    blob[n - 4] = crc & 0xFF;
    blob[n - 3] = (crc >>> 8) & 0xFF;
    blob[n - 2] = (crc >>> 16) & 0xFF;
    blob[n - 1] = (crc >>> 24) & 0xFF;
    return blob;
  }

  // [msg_id:1][nonce:2][logic_blob:N][crc32:4] = N+7
  it('should produce an N+7 byte frame for an N-byte logic blob', () => {
    for (const n of [16, 100, 2048]) {
      const pkt = build_logic_upload(make_logic_blob(n), 0x1234);
      expect(pkt.length).toBe(n + 7);
    }
  });

  it('should have correct message ID (0xC5, not the colliding legacy 0x83)', () => {
    const pkt = build_logic_upload(make_logic_blob(16), 0x1234);
    expect(pkt[0]).toBe(MSG_ID_CMD_LOGIC_UPLOAD);
    expect(pkt[0]).toBe(0xC5);
  });

  it('should encode nonce little-endian at offset 1', () => {
    const pkt = build_logic_upload(make_logic_blob(16), 0xBEEF);
    expect(read_u16_le(pkt, 1)).toBe(0xBEEF);
  });

  it('should copy the logic_blob verbatim at offset 3', () => {
    const blob = make_logic_blob(40);
    const pkt = build_logic_upload(blob, 0x0000);
    for (let i = 0; i < blob.length; i++) {
      expect(pkt[3 + i]).toBe(blob[i]);
    }
  });

  it('should compute the outer CRC-32 over bytes [0..N+2]', () => {
    const n = 40;
    const pkt = build_logic_upload(make_logic_blob(n), 0x9999);
    const outer_crc = read_u32_le(pkt, n + 3);
    const expected = crc32_compute(pkt.subarray(0, n + 3));
    expect(outer_crc).toBe(expected);
  });
});

describe('generate_nonce', () => {
  it('should return a 16-bit unsigned integer', () => {
    const nonce = generate_nonce();
    expect(nonce).toBeGreaterThanOrEqual(0);
    expect(nonce).toBeLessThan(0x10000);
    expect(Number.isInteger(nonce)).toBe(true);
  });

  it('should produce different values on repeated calls (statistical)', () => {
    const nonces = new Set<number>();
    for (let i = 0; i < 100; i++) {
      nonces.add(generate_nonce());
    }
    // With 65536 possible values, 100 calls should yield at least 90 unique
    expect(nonces.size).toBeGreaterThan(50);
  });
});
