import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { bootHarness, type Harness } from "./_harness.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HTTP — /v1/messages/{id}/feedback + /v1/chats/{id}/annotation + /v1/feedback/export", () => {
  let h: Harness;

  beforeEach(async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { choices: [{ message: { content: "ack" } }] }),
    ) as unknown as typeof fetch;
    h = await bootHarness({ agentFetcher: fetcher });
  });

  afterEach(async () => {
    await h.stop();
  });

  async function setupAssistantMessage(): Promise<{
    chatId: string;
    assistantId: string;
  }> {
    const agent = (await (
      await h.api("POST", "/v1/agents", {
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
      })
    ).json()) as { id: string };
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agent.id, theme: "t" })
    ).json()) as { id: string };
    await h.api("POST", `/v1/chats/${chat.id}/messages`, { content: "ping" });

    let assistantId = "";
    for (let i = 0; i < 50; i++) {
      await new Promise((res) => setTimeout(res, 30));
      const msgs = (await (await h.api("GET", `/v1/chats/${chat.id}/messages`)).json()) as {
        data: Array<{ id: string; role: string }>;
      };
      const a = msgs.data.find((m) => m.role === "assistant");
      if (a) {
        assistantId = a.id;
        break;
      }
    }
    return { chatId: chat.id, assistantId };
  }

  it("FB-V-00 — POST feedback without Content-Type uses req.body ?? {} fallback (line 21 false branch)", async () => {
    const { assistantId } = await setupAssistantMessage();
    // No Content-Type → express.json() skips → req.body is undefined → ?? {} → body.rating undefined → 400
    const r = await fetch(`${h.running.url}/v1/messages/${assistantId}/feedback`, {
      method: "POST",
      headers: { Authorization: "Bearer dev-token" },
    });
    expect(r.status).toBe(400);
  });

  it("FB-V-00b — PUT annotation without Content-Type uses req.body ?? {} fallback (line 110 false branch)", async () => {
    const agent = (await (
      await h.api("POST", "/v1/agents", {
        name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-test",
      })
    ).json()) as { id: string };
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agent.id, theme: "t" })
    ).json()) as { id: string };
    // No Content-Type → req.body undefined → ?? {} → body.body undefined → 400
    const r = await fetch(`${h.running.url}/v1/chats/${chat.id}/annotation`, {
      method: "PUT",
      headers: { Authorization: "Bearer dev-token" },
    });
    expect(r.status).toBe(400);
  });

  it("FB-V-01 — POST feedback rejects null + invalid + non-string comment + oversized comment", async () => {
    const { assistantId } = await setupAssistantMessage();

    expect(
      (await h.api("POST", `/v1/messages/${assistantId}/feedback`, { rating: null })).status,
    ).toBe(400);
    expect(
      (await h.api("POST", `/v1/messages/${assistantId}/feedback`, { rating: "maybe" })).status,
    ).toBe(400);
    expect(
      (await h.api("POST", `/v1/messages/${assistantId}/feedback`, { rating: "up", comment: 123 })).status,
    ).toBe(400);
    expect(
      (await h.api("POST", `/v1/messages/${assistantId}/feedback`, {
        rating: "up",
        comment: "x".repeat(281),
      })).status,
    ).toBe(400);
  });

  it("FB-V-02 — rating a user message returns 400 ZZ_NOT_RATEABLE", async () => {
    const agent = (await (
      await h.api("POST", "/v1/agents", {
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
      })
    ).json()) as { id: string };
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agent.id, theme: "t" })
    ).json()) as { id: string };
    const userMsg = (await (
      await h.api("POST", `/v1/chats/${chat.id}/messages`, { content: "hi" })
    ).json()) as { id: string };

    const r = await h.api("POST", `/v1/messages/${userMsg.id}/feedback`, { rating: "up" });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: { error_subcode?: string } };
    expect(body.error.error_subcode).toBe("ZZ_NOT_RATEABLE");
  });

  it("FB-V-03 — POST + GET + DELETE feedback round-trip; GET 404 when absent", async () => {
    const { assistantId } = await setupAssistantMessage();

    expect((await h.api("GET", `/v1/messages/${assistantId}/feedback`)).status).toBe(404);
    expect(
      (await h.api("POST", `/v1/messages/${assistantId}/feedback`, { rating: "up", comment: "ok" })).status,
    ).toBe(200);
    const fb = (await (await h.api("GET", `/v1/messages/${assistantId}/feedback`)).json()) as {
      rating: string;
    };
    expect(fb.rating).toBe("up");
    expect((await h.api("DELETE", `/v1/messages/${assistantId}/feedback`)).status).toBe(200);
    expect((await h.api("GET", `/v1/messages/${assistantId}/feedback`)).status).toBe(404);
  });

  it("FB-V-04 — annotation requires body; oversized rejected; GET returns empty default", async () => {
    const { chatId } = await setupAssistantMessage();
    expect((await h.api("PUT", `/v1/chats/${chatId}/annotation`, {})).status).toBe(400);
    expect(
      (await h.api("PUT", `/v1/chats/${chatId}/annotation`, { body: "x".repeat(16385) })).status,
    ).toBe(400);

    const empty = (await (await h.api("GET", `/v1/chats/${chatId}/annotation`)).json()) as {
      body: string;
      updated_at: string | null;
    };
    expect(empty.body).toBe("");
    expect(empty.updated_at).toBeNull();

    expect(
      (await h.api("PUT", `/v1/chats/${chatId}/annotation`, { body: "user kept rephrasing" })).status,
    ).toBe(200);
    const filled = (await (await h.api("GET", `/v1/chats/${chatId}/annotation`)).json()) as {
      body: string;
    };
    expect(filled.body).toBe("user kept rephrasing");
  });

  it("FB-V-05 — bulk feedback by chat returns matching rows only", async () => {
    const { chatId, assistantId } = await setupAssistantMessage();
    await h.api("POST", `/v1/messages/${assistantId}/feedback`, { rating: "up" });
    const list = (await (await h.api("GET", `/v1/chats/${chatId}/feedback`)).json()) as {
      data: Array<{ message_id: string; rating: string }>;
    };
    expect(list.data).toHaveLength(1);
    expect(list.data[0]?.message_id).toBe(assistantId);
  });

  it("FB-V-06 — export streams JSONL with schema_version: 1 and theme + agent_version", async () => {
    const { chatId, assistantId } = await setupAssistantMessage();
    await h.api("POST", `/v1/messages/${assistantId}/feedback`, { rating: "up" });

    const r = await fetch(
      `${h.running.url}/v1/feedback/export?rating=up&chat_id=${encodeURIComponent(chatId)}`,
      { headers: { Authorization: "Bearer dev-token" } },
    );
    expect(r.headers.get("content-type")).toContain("application/x-ndjson");
    const text = await r.text();
    const first = JSON.parse(text.trim().split("\n")[0]!);
    expect(first.schema_version).toBe(1);
    expect(first.theme).toBe("t");
    expect(first.agent_version).toBe("openai:gpt-4o");
    expect(first.rating).toBe("up");
  });

  it("FB-V-07 — GET feedback for message not found returns 404", async () => {
    const r = await h.api("GET", "/v1/messages/no-such-message/feedback");
    expect(r.status).toBe(404);
  });

  it("FB-V-08 — export with since and until filters includes only matching rows", async () => {
    const { assistantId } = await setupAssistantMessage();
    await h.api("POST", `/v1/messages/${assistantId}/feedback`, { rating: "down" });

    const future = new Date(Date.now() + 60_000).toISOString();
    const past = new Date(Date.now() - 60_000).toISOString();

    // since in the future → empty result (nothing rated after that)
    const r1 = await fetch(
      `${h.running.url}/v1/feedback/export?since=${encodeURIComponent(future)}`,
      { headers: { Authorization: "Bearer dev-token" } },
    );
    const text1 = (await r1.text()).trim();
    expect(text1).toBe("");

    // until in the past → also empty (nothing rated before that)
    const r2 = await fetch(
      `${h.running.url}/v1/feedback/export?until=${encodeURIComponent(past)}`,
      { headers: { Authorization: "Bearer dev-token" } },
    );
    const text2 = (await r2.text()).trim();
    expect(text2).toBe("");

    // since in the past and until in the future → finds the row
    const r3 = await fetch(
      `${h.running.url}/v1/feedback/export?since=${encodeURIComponent(past)}&until=${encodeURIComponent(future)}&rating=down`,
      { headers: { Authorization: "Bearer dev-token" } },
    );
    const text3 = (await r3.text()).trim();
    expect(text3.length).toBeGreaterThan(0);
    const item = JSON.parse(text3.split("\n")[0]!);
    expect(item.rating).toBe("down");
  });
});

describe("HTTP — feedback export comprehensive coverage", () => {
  let h: Harness;

  beforeEach(async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "ack" } }] }), {
        status: 200, headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    h = await bootHarness({ agentFetcher: fetcher });
  });

  afterEach(async () => {
    await h.stop();
  });

  it("FB-EXP-01 — export with all optional fields covers branches in export route", async () => {
    // Create agent + chat + user message → assistant message (via non-streaming)
    const agent = (await (
      await h.api("POST", "/v1/agents", { name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
    ).json()) as { id: string };
    const chat = (await (await h.api("POST", "/v1/chats", { agent_id: agent.id, theme: "t" })).json()) as { id: string };

    // Post user message → AgentRunner creates assistant reply
    await h.api("POST", `/v1/chats/${chat.id}/messages`, { content: "hello" });
    let assistantId = "";
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 30));
      const msgs = (await (await h.api("GET", `/v1/chats/${chat.id}/messages`)).json()) as { data: Array<{ id: string; role: string }> };
      const a = msgs.data.find((m) => m.role === "assistant");
      if (a) { assistantId = a.id; break; }
    }

    // Rate with all optional fields
    await h.api("POST", `/v1/messages/${assistantId}/feedback`, {
      rating: "down",
      comment: "not helpful",
      agent_version: "openai/gpt-4o-custom",
      failure_category: "wrong_answer",
      flagged_for_review: true,
    });

    // Add annotation for the chat
    await h.api("PUT", `/v1/chats/${chat.id}/annotation`, { body: "interesting session" });

    // Export — should include all optional fields
    const r = await fetch(`${h.running.url}/v1/feedback/export`, {
      headers: { Authorization: "Bearer dev-token" },
    });
    const text = await r.text();
    const item = JSON.parse(text.trim().split("\n")[0]!);
    // covers: comment branch (TRUE), agent_version branch (TRUE from fb.agent_version ??),
    //         annotation present (TRUE for annotation?.body), failure_category (TRUE), flagged_for_review (TRUE)
    expect(item.comment).toBe("not helpful");
    expect(item.agent_version).toBe("openai/gpt-4o-custom");
    expect(item.annotation).toBe("interesting session");
    expect(item.failure_category).toBe("wrong_answer");
    expect(item.flagged_for_review).toBe(true);
  });

  it("FB-EXP-02 — export when agent deleted uses undefined agent_version (agent? false branch)", async () => {
    const agent = (await (
      await h.api("POST", "/v1/agents", { name: "B", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
    ).json()) as { id: string };
    const chat = (await (await h.api("POST", "/v1/chats", { agent_id: agent.id, theme: "t" })).json()) as { id: string };

    await h.api("POST", `/v1/chats/${chat.id}/messages`, { content: "hello" });
    let assistantId = "";
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 30));
      const msgs = (await (await h.api("GET", `/v1/chats/${chat.id}/messages`)).json()) as { data: Array<{ id: string; role: string }> };
      const a = msgs.data.find((m) => m.role === "assistant");
      if (a) { assistantId = a.id; break; }
    }

    // Rate first (can't delete agent while chat references it)
    await h.api("POST", `/v1/messages/${assistantId}/feedback`, { rating: "up" });

    // Mock agents.get to return null → covers agent? false branch
    const spy = vi.spyOn(h.running.core.storage.agents, "get").mockResolvedValueOnce(null);
    const r = await fetch(`${h.running.url}/v1/feedback/export`, {
      headers: { Authorization: "Bearer dev-token" },
    });
    spy.mockRestore();
    const text = await r.text();
    expect(text.length).toBeGreaterThan(0);
    const item = JSON.parse(text.trim().split("\n")[0]!);
    expect(item.agent_version).toBeUndefined();
  });
});

describe("HTTP — feedback export edge case branches", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHarness();
  });

  afterEach(async () => {
    await h.stop();
  });

  it("FB-EDGE-01 — POST feedback to non-existent message returns 404 (line 39 true branch)", async () => {
    const r = await h.api("POST", "/v1/messages/ghost-msg-id/feedback", { rating: "up" });
    expect(r.status).toBe(404);
  });

  it("FB-EDGE-02 — export when message deleted (feedback orphan) skips row (line 141 continue branch)", async () => {
    const agent = (await (
      await h.api("POST", "/v1/agents", { name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
    ).json()) as { id: string };
    const chat = (await (await h.api("POST", "/v1/chats", { agent_id: agent.id, theme: "t" })).json()) as { id: string };

    // Directly append assistant message
    const msg = await h.running.core.storage.messages.append({
      chat_id: chat.id,
      role: "assistant",
      content: "direct",
      status: "ok",
    });

    // Rate via HTTP
    await h.api("POST", `/v1/messages/${msg.id}/feedback`, { rating: "up" });

    // Now mock messages.get to return null for this message → line 141 continue
    const spy = vi.spyOn(h.running.core.storage.messages, "get").mockResolvedValueOnce(null);
    const r = await fetch(`${h.running.url}/v1/feedback/export`, {
      headers: { Authorization: "Bearer dev-token" },
    });
    spy.mockRestore();
    const text = (await r.text()).trim();
    // The row was skipped
    expect(text).toBe("");
  });

  it("FB-EDGE-03 — export when idx=0 (assistant is first message) yields prompt_message null (line 163 false branch)", async () => {
    const agent = (await (
      await h.api("POST", "/v1/agents", { name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
    ).json()) as { id: string };
    const chat = (await (await h.api("POST", "/v1/chats", { agent_id: agent.id, theme: "t" })).json()) as { id: string };

    // Append assistant message DIRECTLY as first message (no user before it → idx = 0)
    const msg = await h.running.core.storage.messages.append({
      chat_id: chat.id,
      role: "assistant",
      content: "direct assistant first",
      status: "ok",
    });

    // Rate it
    await h.api("POST", `/v1/messages/${msg.id}/feedback`, { rating: "up" });

    const r = await fetch(`${h.running.url}/v1/feedback/export`, {
      headers: { Authorization: "Bearer dev-token" },
    });
    const text = await r.text();
    const item = JSON.parse(text.trim().split("\n")[0]!);
    // idx = 0 → prompt_message = null
    expect(item.prompt_message).toBeNull();
  });

  it("FB-EDGE-04 — export when chat deleted skips row (line 143 continue branch)", async () => {
    const agent = (await (
      await h.api("POST", "/v1/agents", { name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
    ).json()) as { id: string };
    const chat = (await (await h.api("POST", "/v1/chats", { agent_id: agent.id, theme: "t" })).json()) as { id: string };

    const msg = await h.running.core.storage.messages.append({
      chat_id: chat.id,
      role: "assistant",
      content: "direct",
      status: "ok",
    });
    await h.api("POST", `/v1/messages/${msg.id}/feedback`, { rating: "up" });

    // Mock chats.get to return null → line 143 continue
    const spy = vi.spyOn(h.running.core.storage.chats, "get").mockResolvedValueOnce(null);
    const r = await fetch(`${h.running.url}/v1/feedback/export`, {
      headers: { Authorization: "Bearer dev-token" },
    });
    spy.mockRestore();
    const text = (await r.text()).trim();
    expect(text).toBe("");
  });
});

describe("HTTP — feedback router error branches (catch blocks)", () => {
  let h: Harness;
  let spy: MockInstance;

  beforeEach(async () => {
    h = await bootHarness();
  });

  afterEach(async () => {
    spy?.mockRestore();
    await h.stop();
  });

  it("FB-ERR-01 — DELETE /feedback storage error returns 500 (line 77 catch branch)", async () => {
    spy = vi.spyOn(h.running.core.storage.feedback, "delete").mockRejectedValueOnce(new Error("db gone"));
    const r = await h.api("DELETE", "/v1/messages/any-id/feedback");
    expect(r.status).toBe(500);
  });

  it("FB-ERR-02 — GET /chats/:id/feedback storage error returns 500 (line 91 catch branch)", async () => {
    spy = vi.spyOn(h.running.core.storage.messages, "listByChat").mockRejectedValueOnce(new Error("db gone"));
    const r = await h.api("GET", "/v1/chats/any-id/feedback");
    expect(r.status).toBe(500);
  });

  it("FB-ERR-03 — GET /chats/:id/annotation storage error returns 500 (line 104 catch branch)", async () => {
    spy = vi.spyOn(h.running.core.storage.annotations, "get").mockRejectedValueOnce(new Error("db gone"));
    const r = await h.api("GET", "/v1/chats/any-id/annotation");
    expect(r.status).toBe(500);
  });

  it("FB-ERR-04 — GET /feedback/export storage error returns 500 (line 185 catch branch)", async () => {
    spy = vi.spyOn(h.running.core.storage.feedback, "list").mockRejectedValueOnce(new Error("db gone"));
    const r = await h.api("GET", "/v1/feedback/export");
    expect(r.status).toBe(500);
  });
});
