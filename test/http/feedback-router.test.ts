import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
});
