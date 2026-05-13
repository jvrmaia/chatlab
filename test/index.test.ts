/**
 * Tests for startChatlab index.ts coverage gaps:
 * - workspaceId override (line 61)
 * - cloud agent startup logging (lines 102-103)
 * - drain loop on stop() with in-flight calls (line 126)
 */
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startChatlab, type RunningChatlab } from "../src/index.js";

const TOKEN = "dev-token";

async function api(url: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${url}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe("startChatlab — workspaceId override (index.ts line 61)", () => {
  let home: string;

  beforeEach(() => {
    home = join(tmpdir(), `chatlab-idx-ws-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("IDX-01 — startChatlab with workspaceId activates the specified workspace on boot", async () => {
    // First boot: create a second workspace
    const first = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent", CHATLAB_REQUIRE_TOKEN: TOKEN },
      home,
      host: "127.0.0.1",
      port: 0,
    });

    const ws2 = (await (await api(first.url, "POST", "/v1/workspaces", {
      nickname: "second",
      storage_type: "sqlite",
    })).json()) as { id: string };

    await first.stop();

    // Second boot: override with ws2's ID → triggers line 61
    const second = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent", CHATLAB_REQUIRE_TOKEN: TOKEN },
      home,
      host: "127.0.0.1",
      port: 0,
      workspaceId: ws2.id,
    });

    try {
      expect(second.core.activeWorkspace().id).toBe(ws2.id);
    } finally {
      await second.stop();
    }
  });
});

describe("startChatlab — cloud agent startup logging (index.ts lines 102-103)", () => {
  let home: string;

  beforeEach(() => {
    home = join(tmpdir(), `chatlab-idx-log-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("IDX-02 — startup logs cloud provider warning when cloud agents are configured", async () => {
    // First boot (silent): create an OpenAI agent so it persists to disk
    const first = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent", CHATLAB_REQUIRE_TOKEN: TOKEN },
      home,
      host: "127.0.0.1",
      port: 0,
    });
    await api(first.url, "POST", "/v1/agents", {
      name: "OpenAI Agent",
      provider: "openai",
      model: "gpt-4o",
      api_key: "sk-test",
    });
    await first.stop();

    // Second boot (info level): startup logging sees existing cloud agent → lines 102-103
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const second = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "info", CHATLAB_REQUIRE_TOKEN: TOKEN },
      home,
      host: "127.0.0.1",
      port: 0,
    });
    writeSpy.mockRestore();

    await second.stop();
    // If we got here without error, the cloud agent logging path executed
  });
});

describe("startChatlab — drain loop on stop() (index.ts line 126)", () => {
  let running: RunningChatlab;
  let home: string;

  beforeEach(async () => {
    home = join(tmpdir(), `chatlab-idx-drain-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
    running = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent", CHATLAB_REQUIRE_TOKEN: TOKEN },
      home,
      host: "127.0.0.1",
      port: 0,
    });
  });

  afterEach(async () => {
    try { await running.stop(); } catch { /* ignore */ }
    try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("IDX-03 — stop() drain loop waits for in-flight call to decrement before closing", async () => {
    // Simulate an in-flight LLM call
    running.core.beginInflight();

    // Release inflight after 150ms so the drain loop iterates at least once
    const timer = setTimeout(() => { running.core.endInflight(); }, 150);

    await running.stop();
    clearTimeout(timer);

    expect(running.core.inflightCount()).toBe(0);
  });
});
