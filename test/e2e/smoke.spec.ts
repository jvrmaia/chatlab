import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startChatlab, type RunningChatlab } from "../../src/index.js";

/**
 * E2E smoke test — exercises the happy path end-to-end:
 *   1. boot chatlab in-process on an ephemeral port
 *   2. configure an Ollama agent (`ollama pull llama3` must have run)
 *   3. open a chat, send "Olá", await assistant reply
 *   4. rate the reply 👍
 *   5. export feedback as JSONL, assert schema_version: 1
 *
 * Per ADR 0010, this suite is **default-skipped**. Set `CHATLAB_TEST_E2E=1`
 * to enable. Requires Ollama running on `localhost:11434` with `llama3`
 * pulled. Failure modes documented in `docs/troubleshooting.md`.
 */

const enabled = process.env["CHATLAB_TEST_E2E"] === "1";
const TOKEN = "dev-token";

test.describe.configure({ mode: "serial" });

test.skip(!enabled, "E2E suite is opt-in via CHATLAB_TEST_E2E=1");

let running: RunningChatlab;
let home: string;

test.beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "chatlab-e2e-"));
  running = await startChatlab({
    env: { ...process.env, CHATLAB_LOG_LEVEL: "silent" },
    home,
    host: "127.0.0.1",
    port: 0,
  });
});

test.afterAll(async () => {
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

test("E2E-01 — happy path: configure, chat, rate, export", async () => {
  const agent = (await (
    await api("POST", "/v1/agents", {
      name: "Local llama3",
      provider: "ollama",
      model: "llama3",
      system_prompt: "Respond in one sentence.",
    })
  ).json()) as { id: string };

  const chat = (await (
    await api("POST", "/v1/chats", { agent_id: agent.id, theme: "smoke" })
  ).json()) as { id: string };

  await api("POST", `/v1/chats/${chat.id}/messages`, { content: "Olá" });

  // Wait up to 30 s for the assistant reply.
  let reply: { id: string; role: string; content: string } | undefined;
  const start = Date.now();
  while (Date.now() - start < 30_000) {
    const msgs = (await (await api("GET", `/v1/chats/${chat.id}/messages`)).json()) as {
      data: Array<{ id: string; role: string; content: string }>;
    };
    reply = msgs.data.find((m) => m.role === "assistant");
    if (reply) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  expect(reply, "assistant reply did not arrive within 30 s").toBeTruthy();
  expect(reply!.content.length).toBeGreaterThan(0);

  const rated = await api("PUT", `/v1/messages/${reply!.id}/feedback`, { rating: "up" });
  expect(rated.status).toBe(200);

  const exportResp = await api("GET", "/v1/feedback/export");
  const text = await exportResp.text();
  const firstLine = text.trim().split("\n")[0]!;
  const row = JSON.parse(firstLine) as { schema_version: number };
  expect(row.schema_version).toBe(1);
});
