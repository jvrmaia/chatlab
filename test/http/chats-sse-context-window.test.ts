import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootHarness, type Harness } from "./_harness.js";

// SSE spy: captures the messages array on each provider call.
// Returns SSE format when body.stream=true (chatStream path), JSON otherwise (AgentRunner path).
// Note: the SSE path does NOT emit chat.user-message-appended, so AgentRunner is never
// triggered in parallel for SSE requests — only one spy call happens per SSE POST.
function makeSseSpy() {
  const capturedPayloads: Array<Array<{ role: string; content: string }>> = [];
  const agentFetcher = vi.fn(
    async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? "{}") as {
        messages?: Array<{ role: string; content: string }>;
        stream?: boolean;
      };
      capturedPayloads.push(body.messages ?? []);
      if (body.stream) {
        const sseBody =
          `data: {"choices":[{"delta":{"content":"ok"}}]}\n\n` +
          `data: [DONE]\n\n`;
        return new Response(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { role: "assistant", content: "ok" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  ) as unknown as typeof fetch;
  return { agentFetcher, capturedPayloads };
}

// Parses SSE event stream text into typed event objects.
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

describe("HTTP SSE — context_window e filtragem de mensagens failed", () => {
  let h: Harness;
  let capturedPayloads: Array<Array<{ role: string; content: string }>>;

  beforeEach(async () => {
    const spy = makeSseSpy();
    capturedPayloads = spy.capturedPayloads;
    h = await bootHarness({ agentFetcher: spy.agentFetcher });
  });

  afterEach(async () => {
    await h.stop();
  });

  async function makeAgent(contextWindow: number): Promise<string> {
    const r = (await (
      await h.api("POST", "/v1/agents", {
        name: "SSE-CW",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
        context_window: contextWindow,
      })
    ).json()) as { id: string };
    return r.id;
  }

  async function ssePost(chatId: string, content: string): Promise<string> {
    const res = await fetch(`${h.running.url}/v1/chats/${chatId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer dev-token",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ content }),
    });
    expect(res.status).toBe(200);
    return res.text();
  }

  it("SSE-CW-01 — context_window=2: provider recebe ≤2 mensagens de histórico", async () => {
    // Given — agent com context_window=2
    const agentId = await makeAgent(2);
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };

    // Given — 5 mensagens históricas via storage interno
    const { core } = h.running;
    for (let i = 0; i < 5; i++) {
      await core.storage.messages.append({
        chat_id: chat.id,
        role: "user",
        content: `hist-${i}`,
        status: "ok",
      });
      await new Promise((r) => setTimeout(r, 2));
    }

    // When — SSE request
    capturedPayloads.length = 0;
    const text = await ssePost(chat.id, "sse-trigger");

    // Then — SSE events corretos
    const events = parseSseEvents(text);
    expect(events.some((e) => e.type === "user_message")).toBe(true);
    expect(events.some((e) => e.type === "done")).toBe(true);

    // Then — payload capturado tem ≤2 msgs não-system (context_window=2)
    expect(capturedPayloads.length).toBeGreaterThanOrEqual(1);
    const payload = capturedPayloads.at(-1)!;
    const histMsgs = payload.filter((m) => m.role !== "system");
    expect(histMsgs.length).toBeLessThanOrEqual(2);

    // Mensagens antigas não aparecem
    const contents = histMsgs.map((m) => m.content);
    expect(contents).not.toContain("hist-0");
    expect(contents).not.toContain("hist-1");
    expect(contents).not.toContain("hist-2");
  });

  it("SSE-CW-02 — mensagens failed são excluídas do payload no path SSE", async () => {
    // Given
    const agentId = await makeAgent(20);
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };

    // Given — histórico com mensagem failed
    const { core } = h.running;
    await core.storage.messages.append({
      chat_id: chat.id,
      role: "user",
      content: "good-user",
      status: "ok",
    });
    await new Promise((r) => setTimeout(r, 2));
    await core.storage.messages.append({
      chat_id: chat.id,
      role: "assistant",
      content: "bad-assistant",
      status: "failed",
      error: "ZZ_AGENT_PROVIDER_ERROR: simulated timeout",
    });
    await new Promise((r) => setTimeout(r, 2));

    // When — SSE request após falha
    capturedPayloads.length = 0;
    const text = await ssePost(chat.id, "after-failure");

    // Then — SSE concluiu normalmente
    const events = parseSseEvents(text);
    expect(events.some((e) => e.type === "done")).toBe(true);

    // Then — mensagem failed excluída do payload
    expect(capturedPayloads.length).toBeGreaterThanOrEqual(1);
    const payload = capturedPayloads.at(-1)!;
    const contents = payload.map((m) => m.content);
    expect(contents).not.toContain("bad-assistant");
    expect(contents).toContain("good-user");
  });

  it("SSE-CW-03 — context_window=1: exatamente 1 mensagem (o trigger) chega ao provider", async () => {
    // Given
    const agentId = await makeAgent(1);
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: agentId, theme: "t" })
    ).json()) as { id: string };

    // Given — 5 mensagens históricas
    const { core } = h.running;
    for (let i = 0; i < 5; i++) {
      await core.storage.messages.append({
        chat_id: chat.id,
        role: "user",
        content: `old-${i}`,
        status: "ok",
      });
      await new Promise((r) => setTimeout(r, 2));
    }

    // When
    capturedPayloads.length = 0;
    const text = await ssePost(chat.id, "only-this");

    // Then — SSE ok
    const events = parseSseEvents(text);
    expect(events.some((e) => e.type === "done")).toBe(true);

    // Then — exatamente 1 mensagem não-system
    expect(capturedPayloads.length).toBeGreaterThanOrEqual(1);
    const payload = capturedPayloads.at(-1)!;
    const histMsgs = payload.filter((m) => m.role !== "system");
    expect(histMsgs).toHaveLength(1);
    expect(histMsgs[0]?.content).toBe("only-this");
  });
});
