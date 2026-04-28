import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startChatlab, type RunningChatlab } from "../../src/index.js";
import { freezeClock, unfreezeClock } from "../../src/lib/time.js";

const FROZEN_AT = Date.UTC(2026, 3, 29, 12, 30, 0); // 2026-04-29T12:30:00Z

const TOKEN = "ui-dev-token";

export interface SeededChatlab {
  url: string;
  stop: () => Promise<void>;
}

/**
 * Boots chatlab with a frozen clock + canned agent fetcher, then seeds the
 * domain entities the screenshot specs need. `flavor` selects the seed set.
 */
export async function bootSeeded(
  flavor:
    | "empty"
    | "with-agent"
    | "with-chat"
    | "with-messages"
    | "with-feedback"
    | "with-multiple-workspaces",
): Promise<SeededChatlab> {
  freezeClock(FROZEN_AT);

  const home = join(tmpdir(), `chatlab-capture-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(home, { recursive: true });

  const agentFetcher = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content:
                "Olá! Sou um agente de demonstração. Vamos começar — sobre Python, recomendo aprender a sintaxe primeiro.",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as unknown as typeof fetch;

  const running: RunningChatlab = await startChatlab({
    env: { ...process.env, CHATLAB_LOG_LEVEL: "silent" },
    home,
    host: "127.0.0.1",
    port: 0,
    agentFetcher,
  });

  const url = running.url;

  async function api(method: string, path: string, body?: unknown): Promise<Response> {
    return fetch(`${url}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }

  if (flavor === "with-multiple-workspaces") {
    await api("POST", "/v1/workspaces", { nickname: "experiment-1", storage_type: "memory" });
    await api("POST", "/v1/workspaces", { nickname: "production-test", storage_type: "duckdb" });
  }

  if (
    flavor === "with-agent" ||
    flavor === "with-chat" ||
    flavor === "with-messages" ||
    flavor === "with-feedback"
  ) {
    await api("POST", "/v1/agents", {
      name: "OpenAI gpt-4o",
      provider: "openai",
      model: "gpt-4o",
      api_key: "sk-fake-1234567890ABCDwxyz",
      system_prompt: "Você é um atendente cordial em português.",
    });
    await api("POST", "/v1/agents", {
      name: "Local llama3",
      provider: "ollama",
      model: "llama3",
    });
  }

  if (flavor === "with-chat" || flavor === "with-messages" || flavor === "with-feedback") {
    const agents = (await (await api("GET", "/v1/agents")).json()) as {
      data: Array<{ id: string }>;
    };
    const agentId = agents.data[0]!.id;
    const chat = (await (
      await api("POST", "/v1/chats", { agent_id: agentId, theme: "Aprendendo Python" })
    ).json()) as { id: string };

    if (flavor === "with-messages" || flavor === "with-feedback") {
      await api("POST", `/v1/chats/${chat.id}/messages`, { content: "Como começo a aprender Python?" });
      // wait briefly for the assistant reply to land
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const msgs = (await (await api("GET", `/v1/chats/${chat.id}/messages`)).json()) as {
          data: Array<{ role: string }>;
        };
        if (msgs.data.find((m) => m.role === "assistant")) break;
      }
    }

    if (flavor === "with-feedback") {
      const msgs = (await (await api("GET", `/v1/chats/${chat.id}/messages`)).json()) as {
        data: Array<{ id: string; role: string }>;
      };
      const assistant = msgs.data.find((m) => m.role === "assistant");
      if (assistant) {
        await api("POST", `/v1/messages/${assistant.id}/feedback`, {
          rating: "up",
          comment: "Boa resposta inicial.",
        });
      }
    }
  }

  return {
    url,
    async stop() {
      try {
        await running.stop();
      } finally {
        unfreezeClock();
        try {
          rmSync(home, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    },
  };
}
