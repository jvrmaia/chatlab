import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Symmetric authenticated encryption used to protect provider API keys at
 * rest in storage adapters. AES-256-GCM with a random 96-bit IV per message.
 *
 * Encoded format:
 *   `enc:v1:<iv-b64>:<ciphertext-b64>:<tag-b64>`
 *
 * Strings that don't carry the `enc:v1:` prefix are treated as legacy
 * plaintext — see `isEncrypted` and the migration note in
 * `docs/specs/adr/`.
 */

const ALGO = "aes-256-gcm";
const PREFIX = "enc:v1:";
export const MASTER_KEY_BYTES = 32;
const IV_BYTES = 12;

export function isEncrypted(s: string): boolean {
  return s.startsWith(PREFIX);
}

export function encryptString(plaintext: string, masterKey: Buffer): string {
  if (masterKey.length !== MASTER_KEY_BYTES) {
    throw new Error(`master key must be ${MASTER_KEY_BYTES} bytes`);
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, masterKey, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${enc.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptString(ciphertext: string, masterKey: Buffer): string {
  if (masterKey.length !== MASTER_KEY_BYTES) {
    throw new Error(`master key must be ${MASTER_KEY_BYTES} bytes`);
  }
  if (!isEncrypted(ciphertext)) {
    throw new Error("not an encrypted string");
  }
  const parts = ciphertext.split(":");
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("malformed ciphertext");
  }
  const iv = Buffer.from(parts[2]!, "base64");
  const enc = Buffer.from(parts[3]!, "base64");
  const tag = Buffer.from(parts[4]!, "base64");
  const decipher = createDecipheriv(ALGO, masterKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
