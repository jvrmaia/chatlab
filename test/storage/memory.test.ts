import { describe, expect, it } from "vitest";
import { MemoryAdapter } from "../../src/storage/memory.js";
import { runStorageBattery } from "./_battery.js";

runStorageBattery("memory", () => new MemoryAdapter());

describe("MemoryAdapter — optional field branches", () => {
  it("MEM-OPT-01 — agents.create with system_prompt + temperature sets those fields", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const ag = await a.agents.create({
      workspace_id: "ws-1",
      name: "A",
      provider: "openai",
      model: "gpt-4o",
      context_window: 20,
      system_prompt: "be helpful",
      temperature: 0.3,
    });
    expect(ag.system_prompt).toBe("be helpful");
    expect(ag.temperature).toBe(0.3);
    await a.close();
  });

  it("MEM-OPT-02 — agents.update with model + base_url + system_prompt patches those fields", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const ag = await a.agents.create({
      workspace_id: "ws-1",
      name: "A",
      provider: "openai",
      model: "gpt-4o",
      context_window: 20,
    });
    const updated = await a.agents.update(ag.id, {
      model: "gpt-4o-mini",
      base_url: "https://custom.api.example.com/v1",
      system_prompt: "be concise",
      temperature: 0.9,
    });
    expect(updated?.model).toBe("gpt-4o-mini");
    expect(updated?.base_url).toBe("https://custom.api.example.com/v1");
    expect(updated?.system_prompt).toBe("be concise");
    expect(updated?.temperature).toBe(0.9);
    await a.close();
  });

  it("MEM-OPT-03 — agents.update returns null for non-existent agent", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const result = await a.agents.update("does-not-exist", { name: "x" });
    expect(result).toBeNull();
    await a.close();
  });

  it("MEM-OPT-04 — messages.append with token fields and attachments", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const chat = await a.chats.create({ workspace_id: "ws-1", agent_id: "ag-1", theme: "t" });
    const msg = await a.messages.append({
      chat_id: chat.id,
      role: "assistant",
      content: "reply",
      status: "ok",
      agent_version: "openai/gpt-4o",
      prompt_tokens: 10,
      completion_tokens: 5,
      response_time_ms: 250,
      attachments: [{ media_id: "m1", mime_type: "image/png" }],
    });
    expect(msg.agent_version).toBe("openai/gpt-4o");
    expect(msg.prompt_tokens).toBe(10);
    expect(msg.completion_tokens).toBe(5);
    expect(msg.response_time_ms).toBe(250);
    expect(msg.attachments).toHaveLength(1);
    await a.close();
  });

  it("MEM-OPT-05 — feedback.set with all optional fields", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const chat = await a.chats.create({ workspace_id: "ws-1", agent_id: "ag-1", theme: "t" });
    const msg = await a.messages.append({ chat_id: chat.id, role: "assistant", content: "hi" });
    const fb = await a.feedback.set({
      message_id: msg.id,
      rating: "down",
      comment: "not helpful",
      agent_version: "openai/gpt-4o",
      failure_category: "wrong_answer",
      flagged_for_review: true,
    });
    expect(fb.comment).toBe("not helpful");
    expect(fb.agent_version).toBe("openai/gpt-4o");
    expect(fb.failure_category).toBe("wrong_answer");
    expect(fb.flagged_for_review).toBe(true);
    await a.close();
  });

  it("MEM-OPT-06 — media.put without filename + media.get null path", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const buf = Buffer.from([0x01, 0x02]);
    const rec = await a.media.put({
      id: "m-no-name",
      type: "image",
      mime_type: "image/png",
      size: buf.length,
      sha256: "deadbeef",
      content: buf,
      // filename intentionally omitted
    });
    expect(rec.filename).toBeUndefined();
    expect(await a.media.get("does-not-exist")).toBeNull();
    expect(await a.media.getContent("does-not-exist")).toBeNull();
    await a.close();
  });

  it("MEM-OPT-07 — chats.get returns null for non-existent chat", async () => {
    const a = new MemoryAdapter();
    await a.init();
    expect(await a.chats.get("does-not-exist")).toBeNull();
    expect(await a.chats.delete("does-not-exist")).toBe(false);
    await a.close();
  });

  it("MEM-OPT-08 — feedback.list with all filters", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const chat = await a.chats.create({ workspace_id: "ws-1", agent_id: "ag-1", theme: "t" });
    const msg = await a.messages.append({ chat_id: chat.id, role: "assistant", content: "hi" });
    await a.feedback.set({ message_id: msg.id, rating: "up" });

    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();

    const bySince = await a.feedback.list({ since: past });
    expect(bySince.length).toBeGreaterThanOrEqual(1);

    const byUntil = await a.feedback.list({ until: future });
    expect(byUntil.length).toBeGreaterThanOrEqual(1);

    const byChatId = await a.feedback.list({ chat_id: chat.id });
    expect(byChatId.length).toBeGreaterThanOrEqual(1);

    const byRating = await a.feedback.list({ rating: "down" });
    expect(byRating).toHaveLength(0);

    await a.close();
  });
});

describe("MemoryAdapter — remaining branch coverage", () => {
  it("MEM-COV-01 — chats.delete skips messages that belong to a different chat (line 71 false branch)", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const chat1 = await a.chats.create({ workspace_id: "ws-1", agent_id: "ag-1", theme: "t" });
    const chat2 = await a.chats.create({ workspace_id: "ws-1", agent_id: "ag-1", theme: "t" });
    const msg1 = await a.messages.append({ chat_id: chat1.id, role: "user", content: "c1" });
    const msg2 = await a.messages.append({ chat_id: chat2.id, role: "user", content: "c2" });

    // Delete chat1 — message for chat2 (msg2) should NOT be deleted
    await a.chats.delete(chat1.id);
    expect(await a.messages.get(msg1.id)).toBeNull();
    expect(await a.messages.get(msg2.id)).not.toBeNull();
    await a.close();
  });

  it("MEM-COV-02 — chats.touch for non-existent chat is a no-op (line 82 false branch)", async () => {
    const a = new MemoryAdapter();
    await a.init();
    // Should not throw
    await expect(a.chats.touch("no-such-chat")).resolves.toBeUndefined();
    await a.close();
  });

  it("MEM-COV-03 — messages.append with non-existent chat_id skips touch (line 121 false branch)", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const msg = await a.messages.append({ chat_id: "ghost-chat", role: "user", content: "x" });
    expect(msg.id).toBeTruthy();
    await a.close();
  });

  it("MEM-COV-04 — messages.append with empty attachments array skips attachments field (line 108 false branch)", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const chat = await a.chats.create({ workspace_id: "ws-1", agent_id: "ag-1", theme: "t" });
    const msg = await a.messages.append({ chat_id: chat.id, role: "user", content: "x", attachments: [] });
    expect(msg.attachments).toBeUndefined();
    await a.close();
  });

  it("MEM-COV-05 — messages.delete for non-existent message returns false (line 134 false branch)", async () => {
    const a = new MemoryAdapter();
    await a.init();
    expect(await a.messages.delete("no-such-msg")).toBe(false);
    await a.close();
  });

  it("MEM-COV-06 — agents.create with base_url stores it (line 152 true branch)", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const ag = await a.agents.create({
      workspace_id: "ws-1",
      name: "Custom",
      provider: "custom",
      model: "m",
      context_window: 20,
      base_url: "https://api.example.com/v1",
    });
    expect(ag.base_url).toBe("https://api.example.com/v1");
    await a.close();
  });

  it("MEM-COV-07 — agents.update with provider, context_window, and api_key covers lines 180/182/185", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const ag = await a.agents.create({
      workspace_id: "ws-1",
      name: "A",
      provider: "openai",
      model: "gpt-4o",
      context_window: 20,
    });
    const updated = await a.agents.update(ag.id, {
      provider: "anthropic",
      context_window: 50,
      api_key: "sk-new-key-1234",
    });
    expect(updated?.provider).toBe("anthropic");
    expect(updated?.context_window).toBe(50);
    await a.close();
  });

  it("MEM-COV-08 — agents.delete for non-existent agent returns false (line 193 false branch)", async () => {
    const a = new MemoryAdapter();
    await a.init();
    expect(await a.agents.delete("no-such-agent")).toBe(false);
    await a.close();
  });

  it("MEM-COV-09 — media.delete for non-existent media returns false (line 225 false branch)", async () => {
    const a = new MemoryAdapter();
    await a.init();
    expect(await a.media.delete("no-such-media")).toBe(false);
    await a.close();
  });

  it("MEM-COV-10 — feedback.sweepOlderThan removes old entries, keeps recent (line 280 branches)", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const chat = await a.chats.create({ workspace_id: "ws-1", agent_id: "ag-1", theme: "t" });
    const msg1 = await a.messages.append({ chat_id: chat.id, role: "assistant", content: "old" });
    const msg2 = await a.messages.append({ chat_id: chat.id, role: "assistant", content: "new" });

    await a.feedback.set({ message_id: msg1.id, rating: "up" });
    await new Promise((r) => setTimeout(r, 5));
    const cutoff = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 5));
    await a.feedback.set({ message_id: msg2.id, rating: "down" });

    const removed = await a.feedback.sweepOlderThan(cutoff);
    expect(removed).toBe(1);
    expect(await a.feedback.get(msg1.id)).toBeNull();
    expect(await a.feedback.get(msg2.id)).not.toBeNull();
    await a.close();
  });

  it("MEM-COV-11 — annotations.sweepOlderThan removes old entries, keeps recent (line 305 branches)", async () => {
    const a = new MemoryAdapter();
    await a.init();
    const chat1 = await a.chats.create({ workspace_id: "ws-1", agent_id: "ag-1", theme: "t" });
    const chat2 = await a.chats.create({ workspace_id: "ws-1", agent_id: "ag-1", theme: "t" });

    await a.annotations.set({ chat_id: chat1.id, body: "old note" });
    await new Promise((r) => setTimeout(r, 5));
    const cutoff = new Date().toISOString();
    await new Promise((r) => setTimeout(r, 5));
    await a.annotations.set({ chat_id: chat2.id, body: "new note" });

    const removed = await a.annotations.sweepOlderThan(cutoff);
    expect(removed).toBe(1);
    expect(await a.annotations.get(chat1.id)).toBeNull();
    expect(await a.annotations.get(chat2.id)).not.toBeNull();
    await a.close();
  });
});

describe("MemoryAdapter — agents.list sort order", () => {
  it("list() returns agents sorted by created_at when multiple agents exist", async () => {
    const a = new MemoryAdapter();
    await a.init();

    const ag1 = await a.agents.create({
      workspace_id: "ws-1",
      name: "First",
      provider: "openai",
      model: "gpt-4o",
      context_window: 20,
    });
    // Small delay to ensure distinct timestamps
    await new Promise((r) => setTimeout(r, 2));
    const ag2 = await a.agents.create({
      workspace_id: "ws-1",
      name: "Second",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      context_window: 20,
    });

    const list = await a.agents.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe(ag1.id);
    expect(list[1]?.id).toBe(ag2.id);

    await a.close();
  });
});
