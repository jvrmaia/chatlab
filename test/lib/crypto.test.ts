import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptString, decryptString, MASTER_KEY_BYTES } from "../../src/lib/crypto.js";

const GOOD_KEY = randomBytes(MASTER_KEY_BYTES);

describe("crypto error paths", () => {
  it("CRYPTO-01 — encryptString throws when masterKey is wrong size", () => {
    expect(() => encryptString("hello", randomBytes(16))).toThrow(/32 bytes/);
  });

  it("CRYPTO-02 — decryptString throws when masterKey is wrong size", () => {
    expect(() => decryptString("enc:v1:a:b:c", randomBytes(16))).toThrow(/32 bytes/);
  });

  it("CRYPTO-03 — decryptString throws when string does not carry enc:v1: prefix", () => {
    expect(() => decryptString("plaintext-api-key", GOOD_KEY)).toThrow(/not an encrypted string/);
  });

  it("CRYPTO-04 — decryptString throws on malformed ciphertext (wrong part count)", () => {
    // has prefix but only 4 colon-parts (needs 5)
    expect(() => decryptString("enc:v1:abc:def", GOOD_KEY)).toThrow(/malformed/);
  });

  it("CRYPTO-05 — round-trip: encryptString + decryptString preserves plaintext", () => {
    const plain = "sk-test-secret-key";
    const cipher = encryptString(plain, GOOD_KEY);
    expect(cipher).toMatch(/^enc:v1:/);
    expect(decryptString(cipher, GOOD_KEY)).toBe(plain);
  });
});
