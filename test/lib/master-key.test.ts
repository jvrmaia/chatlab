import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { MASTER_KEY_BYTES } from "../../src/lib/crypto.js";
import { loadMasterKey } from "../../src/lib/master-key.js";

describe("lib/master-key", () => {
  let home: string;

  beforeEach(() => {
    home = join(tmpdir(), `chatlab-mk-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it("MK-01 — valid CHATLAB_MASTER_KEY env var returns the decoded buffer", () => {
    const key = Buffer.alloc(MASTER_KEY_BYTES, 0xab);
    const loaded = loadMasterKey(home, { CHATLAB_MASTER_KEY: key.toString("base64") });
    expect(loaded).toEqual(key);
  });

  it("MK-02 — CHATLAB_MASTER_KEY with wrong byte length throws", () => {
    const short = Buffer.alloc(16, 0xff).toString("base64");
    expect(() => loadMasterKey(home, { CHATLAB_MASTER_KEY: short })).toThrow(
      /must decode to exactly 32 bytes/,
    );
  });

  it("MK-03 — no env var and no file auto-generates a 32-byte key file", () => {
    const loaded = loadMasterKey(home, {});
    expect(loaded).toHaveLength(MASTER_KEY_BYTES);
  });

  it("MK-04 — generated key is persisted: second call returns the same bytes", () => {
    const first = loadMasterKey(home, {});
    const second = loadMasterKey(home, {});
    expect(second).toEqual(first);
  });

  it("MK-05 — existing key file with wrong byte length throws", () => {
    writeFileSync(join(home, "master.key"), Buffer.alloc(8));
    expect(() => loadMasterKey(home, {})).toThrow(/must contain exactly 32 bytes/);
  });

});
