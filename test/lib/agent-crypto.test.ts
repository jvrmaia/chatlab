import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { encryptAgentKey, decryptAgentKey, decryptAgent } from "../../src/lib/agent-crypto.js";
import { isEncrypted } from "../../src/lib/crypto.js";
import type { Agent } from "../../src/types/agent.js";

const KEY = randomBytes(32);
const PLAIN = "sk-very-secret-1234";

const STUB_AGENT: Agent = {
  id: "ag-1",
  workspace_id: "ws-1",
  name: "Test",
  provider: "openai",
  model: "gpt-4o",
  api_key: PLAIN,
  context_window: 20,
  created_at: "2025-01-01T00:00:00.000Z",
  updated_at: "2025-01-01T00:00:00.000Z",
};

describe("agent-crypto", () => {
  it("AC-01 — encryptAgentKey: undefined passthrough", () => {
    expect(encryptAgentKey(undefined, KEY)).toBeUndefined();
  });

  it("AC-02 — encryptAgentKey: already-encrypted passthrough (idempotent)", () => {
    const enc = encryptAgentKey(PLAIN, KEY)!;
    expect(isEncrypted(enc)).toBe(true);
    expect(encryptAgentKey(enc, KEY)).toBe(enc);
  });

  it("AC-03 — encryptAgentKey: no masterKey returns plain", () => {
    expect(encryptAgentKey(PLAIN, undefined)).toBe(PLAIN);
  });

  it("AC-04 — encryptAgentKey: returns enc:v1 ciphertext", () => {
    const result = encryptAgentKey(PLAIN, KEY);
    expect(result).toBeDefined();
    expect(isEncrypted(result!)).toBe(true);
  });

  it("AC-05 — decryptAgentKey: undefined passthrough", () => {
    expect(decryptAgentKey(undefined, KEY)).toBeUndefined();
  });

  it("AC-06 — decryptAgentKey: no masterKey returns stored value unchanged", () => {
    const enc = encryptAgentKey(PLAIN, KEY)!;
    expect(decryptAgentKey(enc, undefined)).toBe(enc);
  });

  it("AC-07 — decryptAgentKey: not-encrypted passthrough (legacy plaintext)", () => {
    expect(decryptAgentKey(PLAIN, KEY)).toBe(PLAIN);
  });

  it("AC-08 — decryptAgentKey: decrypts correctly (round-trip)", () => {
    const enc = encryptAgentKey(PLAIN, KEY)!;
    expect(decryptAgentKey(enc, KEY)).toBe(PLAIN);
  });

  it("AC-09 — decryptAgentKey: corrupt ciphertext returns stored value (best-effort, no throw)", () => {
    const enc = encryptAgentKey(PLAIN, KEY)!;
    const corrupted = enc.slice(0, -5) + "XXXXX";
    expect(() => decryptAgentKey(corrupted, KEY)).not.toThrow();
    const result = decryptAgentKey(corrupted, KEY);
    expect(result).toBeDefined();
  });

  it("AC-10 — decryptAgent: agent without api_key returned as-is", () => {
    const { api_key: _, ...noKey } = STUB_AGENT;
    void _;
    const result = decryptAgent(noKey as Agent, KEY);
    expect(result.api_key).toBeUndefined();
  });

  it("AC-11 — decryptAgent: plaintext api_key returned unchanged (legacy)", () => {
    const result = decryptAgent(STUB_AGENT, KEY);
    expect(result.api_key).toBe(PLAIN);
  });

  it("AC-12 — decryptAgent: encrypted api_key is decrypted in the returned object", () => {
    const encKey = encryptAgentKey(PLAIN, KEY)!;
    const agentEnc: Agent = { ...STUB_AGENT, api_key: encKey };
    const result = decryptAgent(agentEnc, KEY);
    expect(result.api_key).toBe(PLAIN);
  });

  it("AC-13 — decryptAgent: undefined masterKey leaves api_key untouched", () => {
    const encKey = encryptAgentKey(PLAIN, KEY)!;
    const agentEnc: Agent = { ...STUB_AGENT, api_key: encKey };
    const result = decryptAgent(agentEnc, undefined);
    expect(result.api_key).toBe(encKey);
  });
});
