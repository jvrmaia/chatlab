import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startChatlab, type RunningChatlab } from "../../src/index.js";

const TOKEN = "dev-token";

/**
 * Workspace-swap-during-inflight regression. Per TRB review item 6:
 * if the developer swaps the active workspace while an agent reply is
 * still flying back from the provider, the reply must NOT be silently
 * lost. Either it lands in the original chat, or `agent.failed` carries
 * a captured error.
 *
 * We delay the provider response with a 250 ms sleep, fire a workspace
 * swap mid-flight, then assert the reply is observable in the original
 * chat after switching back.
 */
describe("AgentRunner — workspace swap during in-flight reply", () => {
  let home: string;
  let running: RunningChatlab;

  beforeEach(async () => {
    home = join(tmpdir(), `chatlab-swap-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
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

  it("RUN-SWAP-01 — reply lands in the original chat (not silently dropped) after a swap attempt", async () => {
    const slowFetcher = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 250));
      return new Response(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content: "delayed reply" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    running = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent" },
      home,
      host: "127.0.0.1",
      port: 0,
      agentFetcher: slowFetcher,
    });

    // Setup: workspace A (the default) gets an agent + chat.
    const agent = (await (
      await api("POST", "/v1/agents", {
        name: "OpenAI",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
      })
    ).json()) as { id: string };
    const chat = (await (
      await api("POST", "/v1/chats", { agent_id: agent.id, theme: "swap test" })
    ).json()) as { id: string };

    // Create a second workspace B.
    const wsB = (await (
      await api("POST", "/v1/workspaces", { nickname: "wsB", storage_type: "memory" })
    ).json()) as { id: string };

    // Fire a user message — slowFetcher will hold the response 250 ms.
    await api("POST", `/v1/chats/${chat.id}/messages`, { content: "ping" });

    // Try to swap to wsB *during* in-flight. Core enforces a drain timeout;
    // either the swap succeeds quickly (drain finished) or it throws
    // ZZ_WORKSPACE_BUSY. Both branches are correct — the contract is that
    // the inflight reply doesn't silently disappear.
    await new Promise((r) => setTimeout(r, 30)); // mid-flight
    const swapResp = await api("POST", `/v1/workspaces/${wsB.id}/activate`);
    // Status 200 (drain succeeded) or 409 (busy) are both acceptable.
    expect([200, 409]).toContain(swapResp.status);

    // Wait for the slow reply to settle, then switch back to A and verify
    // the reply landed (in either chat namespace — A is what we care about).
    await new Promise((r) => setTimeout(r, 600));

    // Find workspace A (the default) and re-activate it.
    const wsList = (await (await api("GET", "/v1/workspaces")).json()) as {
      data: Array<{ id: string; nickname: string }>;
      active_id: string;
    };
    const wsA = wsList.data.find((w) => w.nickname === "default")!;
    if (wsList.active_id !== wsA.id) {
      await api("POST", `/v1/workspaces/${wsA.id}/activate`);
    }

    const msgs = (await (await api("GET", `/v1/chats/${chat.id}/messages`)).json()) as {
      data: Array<{ role: string; content: string; status: string }>;
    };
    const replies = msgs.data.filter((m) => m.role === "assistant");

    // Either: the reply landed (success) OR it was persisted as failed (with
    // an error string — never silently dropped).
    expect(replies.length).toBeGreaterThanOrEqual(1);
    const ok = replies.find((r) => r.content === "delayed reply" && r.status === "ok");
    const failed = replies.find((r) => r.status === "failed");
    expect(Boolean(ok) || Boolean(failed)).toBe(true);
  });
});
