/**
 * Tests for SQLite migration guard paths:
 * - ALTER TABLE migrations for columns added after initial schema
 * - rowToMessage with non-null token/timing fields
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { SqliteAdapter } from "../../src/storage/sqlite.js";

function tmpDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "chatlab-sqlite-mig-"));
  return join(dir, "ws.db");
}

describe("SQLite migration guards", () => {
  it("SQLITE-MIG-01 — init() adds missing columns when opening an older schema DB", async () => {
    const path = tmpDb();
    // Create a DB with the core tables but WITHOUT the newer columns
    const raw = new Database(path);
    raw.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        context_window INTEGER NOT NULL DEFAULT 20,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    raw.close();

    // Opening with SqliteAdapter should run migrations without error
    const adapter = new SqliteAdapter(path);
    await adapter.init();

    // Verify columns were added
    const db = new Database(path, { readonly: true });
    const agentCols = (db.prepare("PRAGMA table_info(agents)").all() as { name: string }[]).map((r) => r.name);
    const msgCols = (db.prepare("PRAGMA table_info(messages)").all() as { name: string }[]).map((r) => r.name);
    db.close();

    expect(agentCols).toContain("temperature");
    expect(msgCols).toContain("agent_version");
    expect(msgCols).toContain("prompt_tokens");
    expect(msgCols).toContain("completion_tokens");
    expect(msgCols).toContain("response_time_ms");

    await adapter.close();
  });
});

describe("SQLite rowToMessage with token fields", () => {
  it("SQLITE-TOK-01 — messages.append with token fields round-trips correctly", async () => {
    const path = tmpDb();
    const adapter = new SqliteAdapter(path);
    await adapter.init();

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
      content: "reply",
      status: "ok",
      prompt_tokens: 123,
      completion_tokens: 456,
      response_time_ms: 789,
    });

    expect(msg.prompt_tokens).toBe(123);
    expect(msg.completion_tokens).toBe(456);
    expect(msg.response_time_ms).toBe(789);

    // Verify round-trip via listByChat
    const messages = await adapter.messages.listByChat(chat.id);
    const found = messages.find((m) => m.id === msg.id);
    expect(found?.prompt_tokens).toBe(123);
    expect(found?.completion_tokens).toBe(456);
    expect(found?.response_time_ms).toBe(789);

    await adapter.close();
  });

  it("SQLITE-TOK-02 — messages without token fields have them as undefined", async () => {
    const path = tmpDb();
    const adapter = new SqliteAdapter(path);
    await adapter.init();

    const agent = await adapter.agents.create({
      workspace_id: "ws-1",
      name: "B",
      provider: "openai",
      model: "gpt-4o",
      context_window: 20,
    });
    const chat = await adapter.chats.create({
      workspace_id: "ws-1",
      agent_id: agent.id,
      theme: "t",
    });

    const msg = await adapter.messages.append({
      chat_id: chat.id,
      role: "user",
      content: "hello",
      status: "ok",
    });

    expect(msg.prompt_tokens).toBeUndefined();
    expect(msg.completion_tokens).toBeUndefined();
    expect(msg.response_time_ms).toBeUndefined();

    await adapter.close();
  });
});

describe("SQLite optional field branches", () => {
  it("SQLITE-OPT-01 — agents.create with system_prompt + temperature; agents.update with model + base_url + system_prompt", async () => {
    const path = tmpDb();
    const adapter = new SqliteAdapter(path);
    await adapter.init();

    const ag = await adapter.agents.create({
      workspace_id: "ws-1",
      name: "A",
      provider: "openai",
      model: "gpt-4o",
      context_window: 20,
      system_prompt: "be helpful",
      temperature: 0.4,
    });
    expect(ag.system_prompt).toBe("be helpful");
    expect(ag.temperature).toBe(0.4);

    const updated = await adapter.agents.update(ag.id, {
      model: "gpt-4o-mini",
      base_url: "https://custom.api.example.com/v1",
      system_prompt: "be concise",
    });
    expect(updated?.model).toBe("gpt-4o-mini");
    expect(updated?.base_url).toBe("https://custom.api.example.com/v1");
    expect(updated?.system_prompt).toBe("be concise");

    await adapter.close();
  });

  it("SQLITE-OPT-02 — media.put without filename returns record without filename", async () => {
    const path = tmpDb();
    const adapter = new SqliteAdapter(path);
    await adapter.init();

    const buf = Buffer.from([0x89, 0x50]);
    const rec = await adapter.media.put({
      id: "m-no-name",
      type: "image",
      mime_type: "image/png",
      size: buf.length,
      sha256: "cafebabe",
      content: buf,
      // filename intentionally omitted
    });
    expect(rec.filename).toBeUndefined();

    // get returns the record without filename field
    const fetched = await adapter.media.get("m-no-name");
    expect(fetched?.filename).toBeUndefined();

    await adapter.close();
  });

  it("SQLITE-OPT-03 — feedback.set with all optional fields", async () => {
    const path = tmpDb();
    const adapter = new SqliteAdapter(path);
    await adapter.init();

    const ag = await adapter.agents.create({
      workspace_id: "ws-1",
      name: "A",
      provider: "openai",
      model: "gpt-4o",
      context_window: 20,
    });
    const chat = await adapter.chats.create({ workspace_id: "ws-1", agent_id: ag.id, theme: "t" });
    const msg = await adapter.messages.append({ chat_id: chat.id, role: "assistant", content: "hi", status: "ok" });

    const fb = await adapter.feedback.set({
      message_id: msg.id,
      rating: "down",
      comment: "unhelpful",
      agent_version: "openai/gpt-4o",
      failure_category: "wrong_answer",
      flagged_for_review: true,
    });
    expect(fb.comment).toBe("unhelpful");
    expect(fb.agent_version).toBe("openai/gpt-4o");
    expect(fb.failure_category).toBe("wrong_answer");
    expect(fb.flagged_for_review).toBe(true);

    await adapter.close();
  });

  it("SQLITE-OPT-04 — messages.append with attachments", async () => {
    const path = tmpDb();
    const adapter = new SqliteAdapter(path);
    await adapter.init();

    const ag = await adapter.agents.create({
      workspace_id: "ws-1",
      name: "A",
      provider: "openai",
      model: "gpt-4o",
      context_window: 20,
    });
    const chat = await adapter.chats.create({ workspace_id: "ws-1", agent_id: ag.id, theme: "t" });
    const msg = await adapter.messages.append({
      chat_id: chat.id,
      role: "user",
      content: "with file",
      status: "ok",
      attachments: [{ media_id: "m1", mime_type: "image/png", filename: "photo.png" }],
    });
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments?.[0]?.media_id).toBe("m1");

    // Verify round-trip via listByChat
    const msgs = await adapter.messages.listByChat(chat.id);
    const found = msgs.find((m) => m.id === msg.id);
    expect(found?.attachments).toHaveLength(1);

    await adapter.close();
  });
});

describe("SQLite remaining branch coverage", () => {
  it("SQLITE-COV-01 — media.getContent returns null for non-existent media", async () => {
    const path = tmpDb();
    const adapter = new SqliteAdapter(path);
    await adapter.init();
    expect(await adapter.media.getContent("does-not-exist")).toBeNull();
    await adapter.close();
  });

  it("SQLITE-COV-02 — feedback.set with flagged_for_review: false covers the '0' branch", async () => {
    const path = tmpDb();
    const adapter = new SqliteAdapter(path);
    await adapter.init();

    const ag = await adapter.agents.create({ workspace_id: "ws-1", name: "A", provider: "openai", model: "gpt-4o", context_window: 20 });
    const chat = await adapter.chats.create({ workspace_id: "ws-1", agent_id: ag.id, theme: "t" });
    const msg = await adapter.messages.append({ chat_id: chat.id, role: "assistant", content: "hi", status: "ok" });

    await adapter.feedback.set({ message_id: msg.id, rating: "up", flagged_for_review: false });
    // Read back to verify rowToFeedback handles flagged_for_review = 0 correctly
    const fb = await adapter.feedback.get(msg.id);
    expect(fb?.flagged_for_review).toBe(false);

    await adapter.close();
  });

  it("SQLITE-COV-03 — feedback.list with no filters covers the empty WHERE branch", async () => {
    const path = tmpDb();
    const adapter = new SqliteAdapter(path);
    await adapter.init();

    const ag = await adapter.agents.create({ workspace_id: "ws-1", name: "A", provider: "openai", model: "gpt-4o", context_window: 20 });
    const chat = await adapter.chats.create({ workspace_id: "ws-1", agent_id: ag.id, theme: "t" });
    const msg = await adapter.messages.append({ chat_id: chat.id, role: "assistant", content: "hi", status: "ok" });
    await adapter.feedback.set({ message_id: msg.id, rating: "up" });

    // Call with NO filters → empty WHERE clause (line 593 else branch)
    const all = await adapter.feedback.list({});
    expect(all.length).toBeGreaterThanOrEqual(1);

    await adapter.close();
  });

  it("SQLITE-COV-04 — feedback.get reads back optional fields (rowToFeedback lines 693-695)", async () => {
    const path = tmpDb();
    const adapter = new SqliteAdapter(path);
    await adapter.init();

    const ag = await adapter.agents.create({ workspace_id: "ws-1", name: "A", provider: "openai", model: "gpt-4o", context_window: 20 });
    const chat = await adapter.chats.create({ workspace_id: "ws-1", agent_id: ag.id, theme: "t" });
    const msg = await adapter.messages.append({ chat_id: chat.id, role: "assistant", content: "hi", status: "ok" });

    await adapter.feedback.set({
      message_id: msg.id,
      rating: "down",
      agent_version: "openai/gpt-4o",
      failure_category: "hallucination",
      flagged_for_review: true,
    });

    // Read back from DB → rowToFeedback maps agent_version, failure_category, flagged_for_review
    const fb = await adapter.feedback.get(msg.id);
    expect(fb?.agent_version).toBe("openai/gpt-4o");
    expect(fb?.failure_category).toBe("hallucination");
    expect(fb?.flagged_for_review).toBe(true);

    await adapter.close();
  });
});

describe("SQLite feedback.list with since/until filters", () => {
  it("SQLITE-FB-01 — feedback.list with since filter returns only matching rows", async () => {
    const path = tmpDb();
    const adapter = new SqliteAdapter(path);
    await adapter.init();

    const agent = await adapter.agents.create({
      workspace_id: "ws-1",
      name: "A",
      provider: "openai",
      model: "gpt-4o",
      context_window: 20,
    });
    const chat = await adapter.chats.create({
      workspace_id: "ws-1",
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

    await adapter.close();
  });
});
