import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startChatlab, type RunningChatlab } from "../../src/index.js";

const TOKEN = "dev-token";

// Spy that captures the messages array sent to the LLM provider on each call.
function makeCaptureSpy() {
  const capturedPayloads: Array<Array<{ role: string; content: string }>> = [];
  const agentFetcher = vi.fn(
    async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? "{}") as {
        messages?: Array<{ role: string; content: string }>;
      };
      capturedPayloads.push(body.messages ?? []);
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "captured-reply" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  ) as unknown as typeof fetch;
  return { agentFetcher, capturedPayloads };
}

describe("AgentRunner — context_window e filtragem de mensagens failed", () => {
  let home: string;
  let running: RunningChatlab;
  let capturedPayloads: Array<Array<{ role: string; content: string }>>;

  async function api(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${running.url}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  // Polls until an assistant reply appears in the chat messages (max 3 s).
  async function waitForAssistant(chatId: string): Promise<void> {
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 30));
      const res = (await (
        await api("GET", `/v1/chats/${chatId}/messages`)
      ).json()) as { data: Array<{ role: string }> };
      if (res.data.some((m) => m.role === "assistant")) return;
    }
    throw new Error("Timed out waiting for assistant reply");
  }

  beforeEach(async () => {
    home = join(tmpdir(), `chatlab-runcw-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
    const spy = makeCaptureSpy();
    capturedPayloads = spy.capturedPayloads;
    running = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent" },
      home,
      host: "127.0.0.1",
      port: 0,
      agentFetcher: spy.agentFetcher,
    });
  });

  afterEach(async () => {
    await running.stop();
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("RUN-03 — context_window=3: apenas as 3 mensagens mais recentes chegam ao LLM", async () => {
    // Given — agent com context_window=3
    const agent = (await (
      await api("POST", "/v1/agents", {
        name: "CW3",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
        context_window: 3,
      })
    ).json()) as { id: string };

    const chat = (await (
      await api("POST", "/v1/chats", { agent_id: agent.id, theme: "t" })
    ).json()) as { id: string };

    // Given — 10 mensagens históricas inseridas diretamente no storage
    // (não disparam chat.user-message-appended → runner não é acionado)
    const { core } = running;
    for (let i = 0; i < 5; i++) {
      await core.storage.messages.append({
        chat_id: chat.id,
        role: "user",
        content: `hist-u-${i}`,
        status: "ok",
      });
      await new Promise((r) => setTimeout(r, 2));
      await core.storage.messages.append({
        chat_id: chat.id,
        role: "assistant",
        content: `hist-a-${i}`,
        status: "ok",
      });
      await new Promise((r) => setTimeout(r, 2));
    }

    // When — envia mensagem via API (dispara runner via evento)
    capturedPayloads.length = 0;
    await api("POST", `/v1/chats/${chat.id}/messages`, { content: "trigger" });
    await waitForAssistant(chat.id);

    // Then — payload capturado existe
    expect(capturedPayloads.length).toBeGreaterThanOrEqual(1);
    const lastPayload = capturedPayloads.at(-1)!;
    const histMsgs = lastPayload.filter((m) => m.role !== "system");

    // context_window=3 → no máximo 3 mensagens não-system
    expect(histMsgs.length).toBeLessThanOrEqual(3);

    // Mensagens dos primeiros turnos (antigas) não devem aparecer
    const contents = histMsgs.map((m) => m.content);
    expect(contents).not.toContain("hist-u-0");
    expect(contents).not.toContain("hist-a-0");
    expect(contents).not.toContain("hist-u-1");
  });

  it("RUN-04 — mensagens com status=failed são excluídas do payload LLM", async () => {
    // Given
    const agent = (await (
      await api("POST", "/v1/agents", {
        name: "FilterFailed",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
        context_window: 20,
      })
    ).json()) as { id: string };

    const chat = (await (
      await api("POST", "/v1/chats", { agent_id: agent.id, theme: "t" })
    ).json()) as { id: string };

    // Given — histórico com uma mensagem failed no meio
    const { core } = running;
    await core.storage.messages.append({
      chat_id: chat.id,
      role: "user",
      content: "ok-user-1",
      status: "ok",
    });
    await new Promise((r) => setTimeout(r, 2));
    await core.storage.messages.append({
      chat_id: chat.id,
      role: "assistant",
      content: "failed-reply-content",
      status: "failed",
      error: "ZZ_AGENT_PROVIDER_ERROR: simulated",
    });
    await new Promise((r) => setTimeout(r, 2));
    await core.storage.messages.append({
      chat_id: chat.id,
      role: "user",
      content: "ok-user-2",
      status: "ok",
    });
    await new Promise((r) => setTimeout(r, 2));

    // When
    capturedPayloads.length = 0;
    await api("POST", `/v1/chats/${chat.id}/messages`, { content: "new-trigger" });
    await waitForAssistant(chat.id);

    // Then
    expect(capturedPayloads.length).toBeGreaterThanOrEqual(1);
    const lastPayload = capturedPayloads.at(-1)!;
    const contents = lastPayload.map((m) => m.content);

    // A mensagem failed não deve aparecer no payload
    expect(contents).not.toContain("failed-reply-content");
    // Mensagens ok devem estar presentes
    expect(contents).toContain("ok-user-1");
    expect(contents).toContain("ok-user-2");
  });

  it("RUN-05 — context_window=1: exatamente 1 mensagem (o trigger) chega ao LLM", async () => {
    // Given
    const agent = (await (
      await api("POST", "/v1/agents", {
        name: "CW1",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
        context_window: 1,
      })
    ).json()) as { id: string };

    const chat = (await (
      await api("POST", "/v1/chats", { agent_id: agent.id, theme: "t" })
    ).json()) as { id: string };

    // Given — 5 mensagens históricas
    const { core } = running;
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
    await api("POST", `/v1/chats/${chat.id}/messages`, { content: "the-trigger" });
    await waitForAssistant(chat.id);

    // Then — exatamente 1 mensagem não-system (context_window=1)
    expect(capturedPayloads.length).toBeGreaterThanOrEqual(1);
    const lastPayload = capturedPayloads.at(-1)!;
    const histMsgs = lastPayload.filter((m) => m.role !== "system");
    expect(histMsgs).toHaveLength(1);
    // A única mensagem deve ser o trigger (a mais recente no momento da chamada)
    expect(histMsgs[0]?.content).toBe("the-trigger");
  });
});
