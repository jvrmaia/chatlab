/**
 * DuckDB-specific tests for coverage gaps not addressed by the battery suite.
 * Covers feedback.list filters (since/until), migration guards, and rowToMessage paths.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { DuckDbAdapter } from "../../src/storage/duckdb.js";

function tmpDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "chatlab-duckdb-extras-"));
  return join(dir, "ws.duckdb");
}

describe("DuckDB migration guards", () => {
  it("DUCK-MIG-01 — init() adds missing columns when opening an older schema DB", async () => {
    const path = tmpDb();

    // Create a DuckDB file with a legacy schema missing newer columns
    const instance = await DuckDBInstance.create(path);
    const conn = await instance.connect();
    await conn.run(`CREATE TABLE chats (id VARCHAR PRIMARY KEY, workspace_id VARCHAR NOT NULL, agent_id VARCHAR NOT NULL, theme VARCHAR NOT NULL, created_at VARCHAR NOT NULL, updated_at VARCHAR NOT NULL)`);
    await conn.run(`CREATE TABLE messages (id VARCHAR PRIMARY KEY, chat_id VARCHAR NOT NULL, role VARCHAR NOT NULL, content VARCHAR NOT NULL, attachments_json VARCHAR, status VARCHAR NOT NULL, error VARCHAR, created_at VARCHAR NOT NULL)`);
    await conn.run(`CREATE TABLE agents (id VARCHAR PRIMARY KEY, workspace_id VARCHAR NOT NULL, name VARCHAR NOT NULL, provider VARCHAR NOT NULL, model VARCHAR NOT NULL, api_key VARCHAR, base_url VARCHAR, system_prompt VARCHAR, context_window INTEGER NOT NULL DEFAULT 20, created_at VARCHAR NOT NULL, updated_at VARCHAR NOT NULL)`);
    await conn.run(`CREATE TABLE media (id VARCHAR PRIMARY KEY, type VARCHAR NOT NULL, mime_type VARCHAR NOT NULL, size BIGINT NOT NULL, sha256 VARCHAR NOT NULL, filename VARCHAR, content BLOB NOT NULL, created_at VARCHAR NOT NULL)`);
    await conn.run(`CREATE TABLE feedback (message_id VARCHAR PRIMARY KEY, rating VARCHAR NOT NULL, comment VARCHAR, rated_at VARCHAR NOT NULL, agent_version VARCHAR, failure_category VARCHAR, flagged_for_review BOOLEAN)`);
    await conn.run(`CREATE TABLE annotations (chat_id VARCHAR PRIMARY KEY, body VARCHAR NOT NULL, updated_at VARCHAR NOT NULL)`);
    conn.disconnectSync();
    instance.closeSync();

    // Opening with DuckDbAdapter should run migrations and add missing columns
    const adapter = new DuckDbAdapter(path);
    await adapter.init();

    // Verify new columns work by using them
    const agent = await adapter.agents.create({
      workspace_id: "ws-1",
      name: "A",
      provider: "openai",
      model: "gpt-4o",
      context_window: 20,
      temperature: 0.5,
    });
    expect(agent.temperature).toBe(0.5);

    const chat = await adapter.chats.create({ workspace_id: "ws-1", agent_id: agent.id, theme: "t" });
    const msg = await adapter.messages.append({
      chat_id: chat.id,
      role: "assistant",
      content: "hi",
      status: "ok",
      agent_version: "openai/gpt-4o",
      prompt_tokens: 5,
      completion_tokens: 10,
      response_time_ms: 200,
    });
    expect(msg.agent_version).toBe("openai/gpt-4o");
    expect(msg.prompt_tokens).toBe(5);
    expect(msg.completion_tokens).toBe(10);
    expect(msg.response_time_ms).toBe(200);

    await adapter.close();
  });
});

describe("DuckDB messages with attachments", () => {
  it("DUCK-ATT-01 — messages.append with attachments round-trips via listByChat (line 642)", async () => {
    const path = tmpDb();
    const adapter = new DuckDbAdapter(path);
    await adapter.init();

    try {
      const agent = await adapter.agents.create({
        workspace_id: "ws-1",
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        context_window: 20,
      });
      const chat = await adapter.chats.create({ workspace_id: "ws-1", agent_id: agent.id, theme: "t" });
      const msg = await adapter.messages.append({
        chat_id: chat.id,
        role: "user",
        content: "with file",
        status: "ok",
        attachments: [{ media_id: "m1", mime_type: "image/png", filename: "photo.png" }],
      });
      expect(msg.attachments).toHaveLength(1);
      expect(msg.attachments?.[0]?.media_id).toBe("m1");

      const msgs = await adapter.messages.listByChat(chat.id);
      const found = msgs.find((m) => m.id === msg.id);
      expect(found?.attachments).toHaveLength(1);
      expect(found?.attachments?.[0]?.media_id).toBe("m1");
    } finally {
      await adapter.close();
    }
  });
});

describe("DuckDB feedback.list with since/until filters", () => {
  it("DUCK-FB-01 — feedback.list with since and until filters returns correct rows", async () => {
    const path = tmpDb();
    const adapter = new DuckDbAdapter(path);
    await adapter.init();

    try {
      const ws = { workspace_id: "ws-1" };
      const agent = await adapter.agents.create({
        ...ws,
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        context_window: 20,
      });
      const chat = await adapter.chats.create({
        ...ws,
        agent_id: agent.id,
        theme: "t",
      });
      const msg = await adapter.messages.append({
        chat_id: chat.id,
        role: "assistant",
        content: "x",
        status: "ok",
      });
      await adapter.feedback.set({ message_id: msg.id, rating: "up" });

      const past = new Date(Date.now() - 60_000).toISOString();
      const future = new Date(Date.now() + 60_000).toISOString();

      // since in the past → includes the row
      const rows1 = await adapter.feedback.list({ since: past });
      expect(rows1.length).toBeGreaterThanOrEqual(1);

      // since in the future → empty
      const rows2 = await adapter.feedback.list({ since: future });
      expect(rows2).toHaveLength(0);

      // until in the future → includes the row
      const rows3 = await adapter.feedback.list({ until: future });
      expect(rows3.length).toBeGreaterThanOrEqual(1);

      // until in the past → empty
      const rows4 = await adapter.feedback.list({ until: past });
      expect(rows4).toHaveLength(0);

      // since + until together
      const rows5 = await adapter.feedback.list({ since: past, until: future });
      expect(rows5.length).toBeGreaterThanOrEqual(1);
    } finally {
      await adapter.close();
    }
  });
});
