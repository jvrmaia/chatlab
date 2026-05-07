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
});
