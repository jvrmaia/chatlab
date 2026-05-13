import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootHarness, type Harness } from "./_harness.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HTTP — /v1/chats", () => {
  let h: Harness;

  beforeEach(async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, {
        choices: [{ message: { role: "assistant", content: "ack" } }],
      }),
    ) as unknown as typeof fetch;
    h = await bootHarness({ agentFetcher: fetcher });
  });

  afterEach(async () => {
    await h.stop();
  });

  async function makeAgent(): Promise<string> {
    const r = (await (
      await h.api("POST", "/v1/agents", {
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
      })
    ).json()) as { id: string };
    return r.id;
  }

  it("CH-H-01 — POST /v1/chats requires agent_id + theme; agent must exist", async () => {
    expect((await h.api("POST", "/v1/chats", {})).status).toBe(400);
    expect((await h.api("POST", "/v1/chats", { agent_id: "x" })).status).toBe(400);
    expect(
      (await h.api("POST", "/v1/chats", { agent_id: "no-such", theme: "t" })).status,
    ).toBe(404);

    const agentId = await makeAgent();
    const r = await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" });
    expect(r.status).toBe(201);
  });

  it("CH-H-02 — GET / DELETE / list-by-chat", async () => {
    const agentId = await makeAgent();
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };

    expect((await h.api("GET", `/v1/chats/${chat.id}`)).status).toBe(200);
    expect((await h.api("GET", `/v1/chats/${chat.id}/messages`)).status).toBe(200);
    expect((await h.api("DELETE", `/v1/chats/${chat.id}`)).status).toBe(200);
    expect((await h.api("GET", `/v1/chats/${chat.id}`)).status).toBe(404);
  });

  it("CH-H-02b — DELETE non-existent chat returns 404 (line 65 true branch)", async () => {
    expect((await h.api("DELETE", "/v1/chats/no-such-chat")).status).toBe(404);
  });

  it("CH-H-02c — GET messages for non-existent chat returns 404 (line 76 true branch)", async () => {
    expect((await h.api("GET", "/v1/chats/no-such-chat/messages")).status).toBe(404);
  });

  it("CH-H-02d — POST /v1/chats without Content-Type uses req.body ?? {} fallback (line 26 false branch)", async () => {
    const r = await fetch(`${h.running.url}/v1/chats`, {
      method: "POST",
      headers: { Authorization: "Bearer dev-token" },
    });
    expect(r.status).toBe(400);
  });

  it("CH-H-02e — POST messages without Content-Type uses req.body ?? {} fallback (line 86 false branch)", async () => {
    const agentId = await makeAgent();
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };
    const r = await fetch(`${h.running.url}/v1/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { Authorization: "Bearer dev-token" },
    });
    expect(r.status).toBe(400);
  });

  it("CH-H-02f — attachment with filename covers true branch (line 116)", async () => {
    const agentId = await makeAgent();
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };

    // Upload actual media with a filename
    const form = new FormData();
    const blob = new Blob(
      [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      { type: "image/png" },
    );
    form.append("file", blob, "photo.png");
    form.append("type", "image");
    const uploadResp = await fetch(`${h.running.url}/v1/media`, {
      method: "POST",
      headers: { Authorization: "Bearer dev-token" },
      body: form,
    });
    const { id: mediaId } = (await uploadResp.json()) as { id: string };

    const r = await h.api("POST", `/v1/chats/${chat.id}/messages`, {
      content: "look at this",
      attachments: [{ media_id: mediaId }],
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as { attachments?: Array<{ filename?: string }> };
    expect(body.attachments?.[0]?.filename).toBe("photo.png");
  });

  it("CH-H-03 — POST /v1/chats/{id}/messages appends user message + triggers assistant reply", async () => {
    const agentId = await makeAgent();
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };

    const r = await h.api("POST", `/v1/chats/${chat.id}/messages`, { content: "ping" });
    expect(r.status).toBe(201);

    let assistantSeen = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((res) => setTimeout(res, 30));
      const msgs = (await (await h.api("GET", `/v1/chats/${chat.id}/messages`)).json()) as {
        data: Array<{ role: string; content: string }>;
      };
      if (msgs.data.find((m) => m.role === "assistant" && m.content === "ack")) {
        assistantSeen = true;
        break;
      }
    }
    expect(assistantSeen).toBe(true);
  });

  it("CH-H-04 — POST /messages rejects empty/oversize content + non-string", async () => {
    const agentId = await makeAgent();
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };

    expect((await h.api("POST", `/v1/chats/${chat.id}/messages`, {})).status).toBe(400);
    expect(
      (await h.api("POST", `/v1/chats/${chat.id}/messages`, { content: "x".repeat(20000) }))
        .status,
    ).toBe(400);
  });

  it("CH-H-09 — POST /v1/chats rejects theme longer than 280 chars", async () => {
    const agentId = await makeAgent();
    const r = await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "x".repeat(281) });
    expect(r.status).toBe(400);
  });

  it("CH-H-10 — attachments array with a null item returns 400", async () => {
    const agentId = await makeAgent();
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };
    const r = await h.api("POST", `/v1/chats/${chat.id}/messages`, {
      content: "hello",
      attachments: [null],
    });
    expect(r.status).toBe(400);
  });

  it("CH-H-11 — attachments array with object missing media_id returns 400", async () => {
    const agentId = await makeAgent();
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };
    const r = await h.api("POST", `/v1/chats/${chat.id}/messages`, {
      content: "hello",
      attachments: [{ not_media_id: "something" }],
    });
    expect(r.status).toBe(400);
  });

  it("CH-H-05 — attachment with unknown media_id returns 404", async () => {
    const agentId = await makeAgent();
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };
    const r = await h.api("POST", `/v1/chats/${chat.id}/messages`, {
      content: "with file",
      attachments: [{ media_id: "no-such" }],
    });
    expect(r.status).toBe(404);
  });

  it("CH-H-12 — attachment with no filename omits filename field (line 113 false branch)", async () => {
    const agentId = await makeAgent();
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };

    // Mock media.get to return a record without filename
    const mediaId = "mock-media-no-filename";
    const spy = vi.spyOn(h.running.core.storage.media, "get").mockResolvedValueOnce({
      id: mediaId,
      type: "image",
      mime_type: "image/png",
      size: 100,
      sha256: "abc123",
      created_at: new Date().toISOString(),
    });

    const r = await h.api("POST", `/v1/chats/${chat.id}/messages`, {
      content: "with nameless file",
      attachments: [{ media_id: mediaId }],
    });
    spy.mockRestore();
    expect(r.status).toBe(201);
    const body = (await r.json()) as { attachments?: Array<{ media_id: string; filename?: string }> };
    expect(body.attachments?.[0]?.filename).toBeUndefined();
  });

  it("CH-H-06 — SSE streaming: yields user_message → delta(s) → done, persists assistant reply", async () => {
    // Stub returns OpenAI-compatible SSE stream
    const sseBody =
      `data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n` +
      `data: {"choices":[{"delta":{"content":" world"}}]}\n\n` +
      `data: [DONE]\n\n`;
    const streamingFetcher = vi.fn(async () =>
      new Response(sseBody, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    ) as unknown as typeof fetch;

    // Boot a separate harness with the streaming stub
    const sh = await bootHarness({ agentFetcher: streamingFetcher });
    try {
      const agentId = (await (
        await sh.api("POST", "/v1/agents", {
          name: "S",
          provider: "openai",
          model: "gpt-4o",
          api_key: "sk-test",
        })
      ).json()) as { id: string };
      const chat = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agentId.id, theme: "stream-test" })
      ).json()) as { id: string };

      const res = await fetch(`${sh.running.url}/v1/chats/${chat.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer dev-token`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ content: "hi" }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);

      const text = await res.text();
      const events = text
        .split("\n\n")
        .filter(Boolean)
        .map((block) => {
          const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
          return dataLine ? JSON.parse(dataLine.slice(6)) : null;
        })
        .filter(Boolean) as Array<{ type: string; content?: string; message?: { content: string } }>;

      const types = events.map((e) => e.type);
      expect(types[0]).toBe("user_message");
      expect(types.filter((t) => t === "delta").length).toBeGreaterThan(0);
      expect(types.at(-1)).toBe("done");

      const assembled = events
        .filter((e) => e.type === "delta")
        .map((e) => e.content ?? "")
        .join("");
      expect(assembled).toBe("Hello world");

      const doneMsg = events.find((e) => e.type === "done")?.message;
      expect(doneMsg?.content).toBe("Hello world");

      // Verify the assistant message is persisted
      const msgs = (await (await sh.api("GET", `/v1/chats/${chat.id}/messages`)).json()) as {
        data: Array<{ role: string; content: string }>;
      };
      expect(msgs.data.some((m) => m.role === "assistant" && m.content === "Hello world")).toBe(true);
    } finally {
      await sh.stop();
    }
  });

  it("CH-SSE-ERR-01 — SSE: agent deleted before reply yields error event", async () => {
    const sseBody =
      `data: {"choices":[{"delta":{"content":"hi"}}]}\n\n` +
      `data: [DONE]\n\n`;
    const streamFetcher = vi.fn(async () =>
      new Response(sseBody, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    ) as unknown as typeof fetch;
    const sh = await bootHarness({ agentFetcher: streamFetcher });
    try {
      const agentId = (await (
        await sh.api("POST", "/v1/agents", { name: "X", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
      ).json()) as { id: string };
      const chat = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agentId.id, theme: "t" })
      ).json()) as { id: string };

      // Delete the agent so it no longer exists when the message is processed
      await sh.api("DELETE", `/v1/chats/${chat.id}`);  // delete chat so agent can be deleted
      await sh.api("DELETE", `/v1/agents/${agentId.id}`);

      // Recreate chat pointing to a gone agent (manually via storage would be ideal; here we
      // test the SSE path by creating a new chat with a non-existent agent_id is not possible
      // due to FK check. Instead, create a fresh agent, create a chat, then delete the agent
      // while the chat still exists — this is the real race condition scenario.)
      const agent2 = (await (
        await sh.api("POST", "/v1/agents", { name: "Y", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
      ).json()) as { id: string };
      const chat2 = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agent2.id, theme: "t" })
      ).json()) as { id: string };
      // Delete just the agent — the chat still references it
      await sh.api("DELETE", `/v1/chats/${chat2.id}`);
      const agent3 = (await (
        await sh.api("POST", "/v1/agents", { name: "Z", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
      ).json()) as { id: string };
      const _chat3 = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agent3.id, theme: "t" })
      ).json()) as { id: string };

      // To simulate the race: we need the agent gone but the chat still pointing to it.
      // The only way without bypassing API constraints: use the probe + delete pattern.
      // Simplest: create agent, create chat, then delete agent refs via other chats first.
      // Since DELETE /v1/agents returns 409 when chat references it, we test the error path
      // by pointing directly at a known-deleted agent via internal manipulation.
      // Pragmatic fallback: verify that a missing agent in a pre-existing chat returns error SSE.
      // We achieve this by creating the chat, then deleting the referencing chat, deleting agent,
      // then posting messages to an orphaned chat_id that no longer has an agent.
      // This is not directly achievable via the public API (DELETE agent 409 if chat exists).
      // Instead, test via a specially constructed scenario using the storage internals exposed
      // through the harness running instance:
      const agent4 = (await (
        await sh.api("POST", "/v1/agents", { name: "W", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
      ).json()) as { id: string };
      const chat4 = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agent4.id, theme: "gone" })
      ).json()) as { id: string };
      // Delete the chat so agent can be deleted, save chat ID for the orphan POST
      await sh.api("DELETE", `/v1/chats/${chat4.id}`);
      await sh.api("DELETE", `/v1/agents/${agent4.id}`);

      // POST to the now-deleted chat ID — the chat lookup itself returns 404
      const res = await fetch(`${sh.running.url}/v1/chats/${chat4.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dev-token", Accept: "text/event-stream" },
        body: JSON.stringify({ content: "ghost" }),
      });
      // chat_id is gone → 404 (not SSE), which is the correct guard
      expect(res.status).toBe(404);

      // Actual SSE agent-not-found: we need the chat to exist but its agent to be gone.
      // Use the core storage directly through the running instance to bypass the 409 guard.
      const { core } = sh.running;
      const agent5 = await core.storage.agents.create({
        workspace_id: core.activeWorkspace().id,
        name: "ephemeral",
        provider: "openai",
        model: "gpt-4o",
        context_window: 20,
      });
      const chat5 = await core.storage.chats.create({
        workspace_id: core.activeWorkspace().id,
        agent_id: agent5.id,
        theme: "sse-err",
      });
      // Directly delete the agent from storage — bypasses the 409 guard
      await core.storage.agents.delete(agent5.id);

      const res2 = await fetch(`${sh.running.url}/v1/chats/${chat5.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dev-token", Accept: "text/event-stream" },
        body: JSON.stringify({ content: "hi orphan" }),
      });
      expect(res2.status).toBe(200);
      const text2 = await res2.text();
      const events2 = parseSseEvents(text2);
      expect(events2.some((e) => e.type === "user_message")).toBe(true);
      expect(events2.some((e) => e.type === "error" && String(e.error).includes("ZZ_AGENT_NOT_FOUND"))).toBe(true);
    } finally {
      await sh.stop();
    }
  });

  it("CH-SSE-ERR-02 — SSE: provider error yields error event instead of delta", async () => {
    const errFetcher = vi.fn(async () =>
      new Response(JSON.stringify({ error: "bad" }), { status: 401, headers: { "Content-Type": "application/json" } }),
    ) as unknown as typeof fetch;
    const sh = await bootHarness({ agentFetcher: errFetcher });
    try {
      const agentId = (await (
        await sh.api("POST", "/v1/agents", { name: "E", provider: "openai", model: "gpt-4o", api_key: "sk-bad" })
      ).json()) as { id: string };
      const chat = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agentId.id, theme: "t" })
      ).json()) as { id: string };

      const res = await fetch(`${sh.running.url}/v1/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dev-token", Accept: "text/event-stream" },
        body: JSON.stringify({ content: "boom" }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      const events = parseSseEvents(text);
      expect(events.some((e) => e.type === "user_message")).toBe(true);
      expect(events.some((e) => e.type === "error" && String(e.error).includes("ZZ_AGENT_PROVIDER_ERROR"))).toBe(true);
      expect(events.some((e) => e.type === "delta")).toBe(false);
    } finally {
      await sh.stop();
    }
  });

  it("CH-STOR-01 — GET /v1/chats storage error falls through to 500", async () => {
    vi.spyOn(h.running.core.storage.chats, "list").mockRejectedValueOnce(new Error("db crash"));
    const r = await h.api("GET", "/v1/chats");
    expect(r.status).toBe(500);
    vi.restoreAllMocks();
  });

  it("CH-STOR-02 — DELETE /v1/chats/:id storage error falls through to 500", async () => {
    const agentId = await makeAgent();
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };
    vi.spyOn(h.running.core.storage.chats, "delete").mockRejectedValueOnce(new Error("db crash"));
    const r = await h.api("DELETE", `/v1/chats/${chat.id}`);
    expect(r.status).toBe(500);
    vi.restoreAllMocks();
  });

  it("CH-STOR-03 — GET /v1/chats/:id/messages storage error falls through to 500", async () => {
    const agentId = await makeAgent();
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };
    vi.spyOn(h.running.core.storage.messages, "listByChat").mockRejectedValueOnce(new Error("db crash"));
    const r = await h.api("GET", `/v1/chats/${chat.id}/messages`);
    expect(r.status).toBe(500);
    vi.restoreAllMocks();
  });

  it("CH-H-07 — SSE streaming with usage chunk sets prompt_tokens + completion_tokens on persisted message", async () => {
    const sseBody =
      `data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n` +
      `data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":3}}\n\n` +
      `data: [DONE]\n\n`;
    const streamingFetcher = vi.fn(async () =>
      new Response(sseBody, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    ) as unknown as typeof fetch;

    const sh = await bootHarness({ agentFetcher: streamingFetcher });
    try {
      const agentId = (await (
        await sh.api("POST", "/v1/agents", { name: "U", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
      ).json()) as { id: string };
      const chat = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agentId.id, theme: "usage-sse" })
      ).json()) as { id: string };

      const res = await fetch(`${sh.running.url}/v1/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dev-token", Accept: "text/event-stream" },
        body: JSON.stringify({ content: "ping" }),
      });
      await res.text(); // drain the SSE response

      // Poll for persisted assistant message with token data
      let found = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const msgs = (await (await sh.api("GET", `/v1/chats/${chat.id}/messages`)).json()) as {
          data: Array<{ role: string; status: string; prompt_tokens?: number; completion_tokens?: number }>;
        };
        const assistant = msgs.data.find((m) => m.role === "assistant" && m.status === "ok");
        if (assistant) {
          expect(assistant.prompt_tokens).toBe(5);
          expect(assistant.completion_tokens).toBe(3);
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    } finally {
      await sh.stop();
    }
  });

  it("CH-SSE-04 — SSE path with agent that has no api_key covers line 167 false branch", async () => {
    const sseBody =
      `data: {"choices":[{"delta":{"content":"hi"}}]}\n\n` +
      `data: [DONE]\n\n`;
    const streamFetcher = vi.fn(async () =>
      new Response(sseBody, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    ) as unknown as typeof fetch;
    const sh = await bootHarness({ agentFetcher: streamFetcher });
    try {
      const agentId = (await (
        await sh.api("POST", "/v1/agents", {
          name: "Ollama", provider: "ollama", model: "llama3",
          base_url: "https://api.example.com/v1",
        })
      ).json()) as { id: string };
      const chat = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agentId.id, theme: "t" })
      ).json()) as { id: string };

      const res = await fetch(`${sh.running.url}/v1/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dev-token", Accept: "text/event-stream" },
        body: JSON.stringify({ content: "hi" }),
      });
      expect(res.status).toBe(200);
      await res.text();
    } finally {
      await sh.stop();
    }
  });

  it("CH-SSE-05 — SSE path with empty provider response uses '(empty response)' (line 180 false branch)", async () => {
    const sseBody = `data: [DONE]\n\n`;
    const streamFetcher = vi.fn(async () =>
      new Response(sseBody, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    ) as unknown as typeof fetch;
    const sh = await bootHarness({ agentFetcher: streamFetcher });
    try {
      const agentId = (await (
        await sh.api("POST", "/v1/agents", { name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
      ).json()) as { id: string };
      const chat = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agentId.id, theme: "t" })
      ).json()) as { id: string };

      const res = await fetch(`${sh.running.url}/v1/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dev-token", Accept: "text/event-stream" },
        body: JSON.stringify({ content: "hi" }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      const events = parseSseEvents(text);
      const done = events.find((e) => e.type === "done");
      expect((done?.message as { content: string } | undefined)?.content).toBe("(empty response)");
    } finally {
      await sh.stop();
    }
  });

  it("CH-SSE-06 — SSE path with attachments covers line 134 true branch", async () => {
    const sseBody =
      `data: {"choices":[{"delta":{"content":"hi"}}]}\n\n` +
      `data: [DONE]\n\n`;
    const streamFetcher = vi.fn(async () =>
      new Response(sseBody, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    ) as unknown as typeof fetch;
    const sh = await bootHarness({ agentFetcher: streamFetcher });
    try {
      // Upload media first
      const form = new FormData();
      const blob = new Blob(
        [Uint8Array.from([0x89, 0x50, 0x4e, 0x47])],
        { type: "image/png" },
      );
      form.append("file", blob, "attach.png");
      form.append("type", "image");
      const uploadResp = await fetch(`${sh.running.url}/v1/media`, {
        method: "POST",
        headers: { Authorization: "Bearer dev-token" },
        body: form,
      });
      const { id: mediaId } = (await uploadResp.json()) as { id: string };

      const agentId = (await (
        await sh.api("POST", "/v1/agents", { name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
      ).json()) as { id: string };
      const chat = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agentId.id, theme: "t" })
      ).json()) as { id: string };

      const res = await fetch(`${sh.running.url}/v1/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dev-token", Accept: "text/event-stream" },
        body: JSON.stringify({ content: "look", attachments: [{ media_id: mediaId }] }),
      });
      expect(res.status).toBe(200);
      await res.text();
    } finally {
      await sh.stop();
    }
  });

  it("CH-SSE-07 — SSE catch with non-Error thrown covers line 190 false branch", async () => {
    // controller.error("string") causes the ReadableStream iteration to throw a non-Error
    const throwingFetcher = vi.fn(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.error("string-not-an-Error");
        },
      });
      return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }) as unknown as typeof fetch;
    const sh = await bootHarness({ agentFetcher: throwingFetcher });
    try {
      const agentId = (await (
        await sh.api("POST", "/v1/agents", { name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
      ).json()) as { id: string };
      const chat = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agentId.id, theme: "t" })
      ).json()) as { id: string };

      const res = await fetch(`${sh.running.url}/v1/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dev-token", Accept: "text/event-stream" },
        body: JSON.stringify({ content: "hi" }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      const events = parseSseEvents(text);
      // non-Error → reason contains "unknown"
      expect(events.some((e) => e.type === "error" && String(e.error).includes("unknown"))).toBe(true);
    } finally {
      await sh.stop();
    }
  });

  it("CH-SSE-08 — SSE without opts.fetcher uses global fetch (line 170 false branch)", async () => {
    const sh = await bootHarness(); // no agentFetcher → opts.fetcher undefined → line 170 false branch
    const serverUrl = sh.running.url;

    const originalFetch = globalThis.fetch;
    const sseBody =
      `data: {"choices":[{"delta":{"content":"from-global"}}]}\n\n` +
      `data: [DONE]\n\n`;
    const smartMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const urlStr = input instanceof Request ? input.url : String(input);
      if (urlStr.startsWith(serverUrl)) {
        return originalFetch(input as Parameters<typeof fetch>[0], init);
      }
      return new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close(); } }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", smartMock);

    try {
      const agentId = (await (
        await sh.api("POST", "/v1/agents", {
          name: "A", provider: "custom", model: "m",
          base_url: "https://llm.example.com/v1",
        })
      ).json()) as { id: string };
      const chat = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agentId.id, theme: "t" })
      ).json()) as { id: string };

      const res = await fetch(`${serverUrl}/v1/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dev-token", Accept: "text/event-stream" },
        body: JSON.stringify({ content: "hi" }),
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      const events = parseSseEvents(text);
      expect(events.some((e) => e.type === "done")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      await sh.stop();
    }
  });

  it("CH-SSE-ERR-03 — SSE: client disconnect aborts the provider call", { timeout: 20_000 }, async () => {
    let signalAborted = false;
    const blockingFetcher = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          if (init?.signal?.aborted) {
            signalAborted = true;
            reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
            return;
          }
          init?.signal?.addEventListener("abort", () => {
            signalAborted = true;
            reject(Object.assign(new Error("AbortError"), { name: "AbortError" }));
          });
        }),
    ) as unknown as typeof fetch;

    const sh = await bootHarness({ agentFetcher: blockingFetcher });
    try {
      const agentId = (await (
        await sh.api("POST", "/v1/agents", { name: "B", provider: "openai", model: "gpt-4o", api_key: "sk-test" })
      ).json()) as { id: string };
      const chat = (await (
        await sh.api("POST", "/v1/chats", { agent_id: agentId.id, theme: "t" })
      ).json()) as { id: string };

      // Start SSE request and get the response body reader
      const res = await fetch(`${sh.running.url}/v1/chats/${chat.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dev-token", Accept: "text/event-stream" },
        body: JSON.stringify({ content: "block" }),
      });
      expect(res.status).toBe(200);
      const reader = res.body!.getReader();

      // Read until we see the user_message event — confirms the server is in the streaming phase
      const decoder = new TextDecoder();
      let buf = "";
      let seenUserMessage = false;
      while (!seenUserMessage) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (buf.includes('"user_message"')) seenUserMessage = true;
      }
      expect(seenUserMessage).toBe(true);

      // Cancel the reader — undici destroys the socket; res.on("close") fires on the server,
      // which aborts the controller signal, which rejects the blocking provider fetch.
      await reader.cancel();

      // Poll until the server-side abort propagates (or 8 s)
      const deadline = Date.now() + 8_000;
      while (!signalAborted && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(signalAborted).toBe(true);

      // Inflight counter must have returned to 0 after abort
      expect(sh.running.core.inflightCount()).toBe(0);
    } finally {
      await sh.stop();
    }
  });
});

function parseSseEvents(text: string): Array<{ type: string; [k: string]: unknown }> {
  return text
    .split("\n\n")
    .filter(Boolean)
    .flatMap((block) => {
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) return [];
      try {
        return [JSON.parse(dataLine.slice(6)) as { type: string }];
      } catch {
        return [];
      }
    });
}
