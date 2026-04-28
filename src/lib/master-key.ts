import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { MASTER_KEY_BYTES } from "./crypto.js";

/**
 * Resolves the at-rest encryption master key. Order of precedence:
 *
 *   1. `CHATLAB_MASTER_KEY` env var — base64 of exactly 32 bytes.
 *   2. `<home>/master.key` — 32-byte binary file (auto-generated, mode 0600).
 *
 * The env path is the right wiring for CI and Docker secrets. The file path
 * is the default for laptop usage. OS-keychain integration is a future ADR.
 */
export function loadMasterKey(home: string, env: NodeJS.ProcessEnv = process.env): Buffer {
  const fromEnv = env["CHATLAB_MASTER_KEY"];
  if (fromEnv) {
    const buf = Buffer.from(fromEnv, "base64");
    if (buf.length !== MASTER_KEY_BYTES) {
      throw new Error(
        `CHATLAB_MASTER_KEY must decode to exactly ${MASTER_KEY_BYTES} bytes (got ${buf.length})`,
      );
    }
    return buf;
  }
  const path = join(home, "master.key");
  if (existsSync(path)) {
    const buf = readFileSync(path);
    if (buf.length !== MASTER_KEY_BYTES) {
      throw new Error(
        `${path} must contain exactly ${MASTER_KEY_BYTES} bytes (got ${buf.length})`,
      );
    }
    return buf;
  }
  mkdirSync(dirname(path), { recursive: true });
  const generated = randomBytes(MASTER_KEY_BYTES);
  writeFileSync(path, generated, { mode: 0o600 });
  return generated;
}
