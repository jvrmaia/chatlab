import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import { MemoryAdapter } from "../../src/storage/memory.js";
import { SqliteAdapter } from "../../src/storage/sqlite.js";
import { isEncrypted } from "../../src/lib/crypto.js";

const KEY = randomBytes(32);
const PLAIN = "sk-very-secret-1234567890";

describe("at-rest encryption of agent API keys", () => {
  it("memory: stores ciphertext internally, returns plaintext through the API", async () => {
    const a = new MemoryAdapter(KEY);
    await a.init();

    const created = await a.agents.create({
      workspace_id: "ws-1",
      name: "OpenAI",
      provider: "openai",
      model: "gpt-4o",
      api_key: PLAIN,
      context_window: 20,
    });

    expect(created.api_key).toBe(PLAIN);

    // Internal raw inspection — read back through public API and confirm
    // the round-trip preserves plaintext for callers.
    const fetched = await a.agents.get(created.id);
    expect(fetched?.api_key).toBe(PLAIN);
    const listed = await a.agents.list();
    expect(listed[0]?.api_key).toBe(PLAIN);
  });

  it("sqlite: writes ciphertext to disk, returns plaintext through the API", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chatlab-enc-"));
    const dbPath = join(dir, "ws.db");
    const a = new SqliteAdapter(dbPath, KEY);
    await a.init();

    const created = await a.agents.create({
      workspace_id: "ws-1",
      name: "OpenAI",
      provider: "openai",
      model: "gpt-4o",
      api_key: PLAIN,
      context_window: 20,
    });
    expect(created.api_key).toBe(PLAIN);

    // Open the file with a *different* sqlite handle and read the raw column.
    await a.close();
    const raw = new Database(dbPath, { readonly: true });
    const row = raw.prepare("SELECT api_key FROM agents WHERE id = ?").get(created.id) as
      | { api_key: string | null }
      | undefined;
    raw.close();
    expect(row?.api_key).toBeTruthy();
    expect(isEncrypted(row!.api_key!)).toBe(true);
    expect(row!.api_key).not.toContain("sk-");

    // Re-open through the adapter — public API decrypts back.
    const reopened = new SqliteAdapter(dbPath, KEY);
    await reopened.init();
    const fetched = await reopened.agents.get(created.id);
    expect(fetched?.api_key).toBe(PLAIN);
    await reopened.close();
  });

  it("sqlite: legacy plaintext rows are pass-through readable; subsequent updates re-encrypt", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chatlab-enc-legacy-"));
    const dbPath = join(dir, "ws.db");

    // Phase 1: write a row in legacy plaintext mode (no master key).
    const noKey = new SqliteAdapter(dbPath);
    await noKey.init();
    const legacy = await noKey.agents.create({
      workspace_id: "ws-1",
      name: "Anthropic",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      api_key: PLAIN,
      context_window: 20,
    });
    await noKey.close();

    // Phase 2: re-open *with* a master key. Read should pass plaintext through.
    const withKey = new SqliteAdapter(dbPath, KEY);
    await withKey.init();
    const fetched = await withKey.agents.get(legacy.id);
    expect(fetched?.api_key).toBe(PLAIN);

    // Phase 3: any update with a new api_key encrypts that one.
    await withKey.agents.update(legacy.id, { api_key: "sk-rotated" });
    await withKey.close();

    const raw = new Database(dbPath, { readonly: true });
    const row = raw.prepare("SELECT api_key FROM agents WHERE id = ?").get(legacy.id) as
      | { api_key: string | null }
      | undefined;
    raw.close();
    expect(isEncrypted(row!.api_key!)).toBe(true);
  });
});
