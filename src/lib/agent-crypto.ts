import { encryptString, decryptString, isEncrypted } from "./crypto.js";
import type { Agent } from "../types/agent.js";

export function encryptAgentKey(
  plain: string | undefined,
  masterKey: Buffer | undefined,
): string | undefined {
  if (plain === undefined) return undefined;
  if (!masterKey || isEncrypted(plain)) return plain;
  return encryptString(plain, masterKey);
}

export function decryptAgentKey(
  stored: string | undefined,
  masterKey: Buffer | undefined,
): string | undefined {
  if (stored === undefined) return undefined;
  if (!masterKey || !isEncrypted(stored)) return stored;
  try {
    return decryptString(stored, masterKey);
  } catch {
    return stored;
  }
}

export function decryptAgent(a: Agent, masterKey: Buffer | undefined): Agent {
  if (a.api_key === undefined) return a;
  const decrypted = decryptAgentKey(a.api_key, masterKey);
  if (decrypted === a.api_key) return a;
  const { api_key: _, ...rest } = a;
  void _;
  return decrypted !== undefined ? { ...rest, api_key: decrypted } : rest;
}
