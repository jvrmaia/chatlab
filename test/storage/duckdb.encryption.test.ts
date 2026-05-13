import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { DuckDBInstance } from "@duckdb/node-api";
import { DuckDbAdapter } from "../../src/storage/duckdb.js";
import { isEncrypted } from "../../src/lib/crypto.js";

const KEY = randomBytes(32);
const PLAIN = "sk-very-secret-1234567890";

function tmpPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "chatlab-duckdb-enc-"));
  return join(dir, `ws-${Math.random().toString(36).slice(2)}.duckdb`);
}

// Opens a raw DuckDB connection (after the adapter is closed) to read column values directly.
// DuckDB does not allow multiple simultaneous connections to the same file in embedded mode,
// so the adapter MUST be closed before calling this function.
async function rawSelectApiKey(dbPath: string, agentId: string): Promise<string | null> {
  const inst = await DuckDBInstance.create(dbPath);
  const conn = await inst.connect();
  const res = await conn.run("SELECT api_key FROM agents WHERE id = ?", [agentId] as never);
  const rows = (await res.getRowObjectsJson()) as Array<{ api_key: string | null }>;
  conn.disconnectSync();
  return rows[0]?.api_key ?? null;
}

describe("DuckDB — at-rest encryption of agent API keys", () => {
  it("DUCK-ENC-01 — create armazena ciphertext no disco, devolve plaintext via API", async () => {
    // Given
    const dbPath = tmpPath();
    const a = new DuckDbAdapter(dbPath, KEY);
    await a.init();

    // When
    const created = await a.agents.create({
      workspace_id: "ws-1",
      name: "OpenAI",
      provider: "openai",
      model: "gpt-4o",
      api_key: PLAIN,
      context_window: 20,
    });

    // Then — API pública retorna plaintext
    expect(created.api_key).toBe(PLAIN);

    // And — inspeção raw via segunda conexão revela ciphertext
    await a.close();
    const raw = await rawSelectApiKey(dbPath, created.id);
    expect(raw).toBeTruthy();
    expect(isEncrypted(raw!)).toBe(true);
    expect(raw).not.toContain("sk-");

    // And — reabertura com mesma masterKey descriptografa corretamente
    const b = new DuckDbAdapter(dbPath, KEY);
    await b.init();
    expect((await b.agents.get(created.id))?.api_key).toBe(PLAIN);
    await b.close();
  });

  it("DUCK-ENC-02 — get e list descriptografam corretamente em sessão única", async () => {
    // Given
    const dbPath = tmpPath();
    const a = new DuckDbAdapter(dbPath, KEY);
    await a.init();
    const created = await a.agents.create({
      workspace_id: "ws-1",
      name: "B",
      provider: "openai",
      model: "gpt-4o",
      api_key: "sk-test",
      context_window: 20,
    });

    // When / Then — get retorna plaintext
    const fetched = await a.agents.get(created.id);
    expect(fetched?.api_key).toBe("sk-test");

    // When / Then — list retorna plaintext
    const listed = await a.agents.list();
    expect(listed[0]?.api_key).toBe("sk-test");

    await a.close();
  });

  it("DUCK-ENC-03 — update re-encripta api_key rotacionada", async () => {
    // Given
    const dbPath = tmpPath();
    const a = new DuckDbAdapter(dbPath, KEY);
    await a.init();
    const created = await a.agents.create({
      workspace_id: "ws-1",
      name: "C",
      provider: "openai",
      model: "gpt-4o",
      api_key: "sk-original",
      context_window: 20,
    });

    // When — rotacionar chave
    const updated = await a.agents.update(created.id, { api_key: "sk-rotated" });
    expect(updated?.api_key).toBe("sk-rotated");
    await a.close();

    // Then — raw mostra ciphertext da nova chave
    const raw = await rawSelectApiKey(dbPath, created.id);
    expect(isEncrypted(raw!)).toBe(true);
    expect(raw).not.toContain("sk-rotated");

    // And — reabertura descriptografa nova chave
    const b = new DuckDbAdapter(dbPath, KEY);
    await b.init();
    expect((await b.agents.get(created.id))?.api_key).toBe("sk-rotated");
    await b.close();
  });

  it("DUCK-ENC-04 — rows plaintext legado passam through sem corrupção quando masterKey ativada", async () => {
    // Given — adapter sem masterKey escreve plaintext no disco
    const dbPath = tmpPath();
    const noKey = new DuckDbAdapter(dbPath);
    await noKey.init();
    const legacy = await noKey.agents.create({
      workspace_id: "ws-1",
      name: "Legacy",
      provider: "openai",
      model: "gpt-4o",
      api_key: PLAIN,
      context_window: 20,
    });
    await noKey.close();

    // When — reabre com masterKey
    const withKey = new DuckDbAdapter(dbPath, KEY);
    await withKey.init();

    // Then — api_key legada retorna em plaintext (pass-through sem corrupção)
    const fetched = await withKey.agents.get(legacy.id);
    expect(fetched?.api_key).toBe(PLAIN);
    await withKey.close();
  });
});
