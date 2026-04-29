import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startChatlab, type RunningChatlab } from "../../src/index.js";

const TOKEN = "dev-token";

describe("AgentRunner — per-chat agent reply", () => {
  let home: string;
  let running: RunningChatlab;
  let agentFetcher: typeof fetch;

  beforeEach(async () => {
    home = join(tmpdir(), `chatlab-runner-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
    agentFetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: "assistant", content: "Auto reply from agent." } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as unknown as typeof fetch;

    running = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent" },
      home,
      host: "127.0.0.1",
      port: 0,
      agentFetcher,
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

  async function api(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${running.url}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  it("RUN-01 — user message in a chat triggers an assistant reply via the chat's agent", async () => {
    const agent = (await (
      await api("POST", "/v1/agents", {
        name: "OpenAI",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
      })
    ).json()) as { id: string };

    const chat = (await (
      await api("POST", "/v1/chats", { agent_id: agent.id, theme: "Aprendendo Python" })
    ).json()) as { id: string };

    await api("POST", `/v1/chats/${chat.id}/messages`, { content: "Olá" });

    let foundAssistant = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const msgs = (await (await api("GET", `/v1/chats/${chat.id}/messages`)).json()) as {
        data: Array<{ role: string; content: string }>;
      };
      const reply = msgs.data.find((m) => m.role === "assistant" && m.content.includes("Auto reply"));
      if (reply) {
        foundAssistant = true;
        break;
      }
    }
    expect(foundAssistant).toBe(true);
    expect(agentFetcher).toHaveBeenCalled();
  });

  it("RUN-02 — provider error persists a failed assistant message", async () => {
    const errorFetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "wrong key" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    await running.stop();
    home = join(tmpdir(), `chatlab-runner2-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
    running = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent" },
      home,
      host: "127.0.0.1",
      port: 0,
      agentFetcher: errorFetcher,
    });

    const agent = (await (
      await api("POST", "/v1/agents", {
        name: "OpenAI",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-bad",
      })
    ).json()) as { id: string };

    const chat = (await (
      await api("POST", "/v1/chats", { agent_id: agent.id, theme: "x" })
    ).json()) as { id: string };

    await api("POST", `/v1/chats/${chat.id}/messages`, { content: "ping" });

    let failedFound = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 50));
      const msgs = (await (await api("GET", `/v1/chats/${chat.id}/messages`)).json()) as {
        data: Array<{ role: string; status: string; error?: string }>;
      };
      const fail = msgs.data.find((m) => m.role === "assistant" && m.status === "failed");
      if (fail) {
        expect(fail.error).toMatch(/ZZ_AGENT_PROVIDER_ERROR/);
        failedFound = true;
        break;
      }
    }
    expect(failedFound).toBe(true);
  });
});
