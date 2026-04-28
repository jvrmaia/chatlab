import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { startChatlab, type RunningChatlab } from "../../src/index.js";

function wsUrl(httpUrl: string): string {
  return httpUrl.replace(/^http/, "ws") + "/ws";
}

interface WsHarness {
  ws: WebSocket;
  next(matcher: (msg: { type?: string }) => boolean, timeoutMs?: number): Promise<{ type?: string; [k: string]: unknown }>;
  close(): void;
}

function harness(running: RunningChatlab): Promise<WsHarness> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(running.url));
    const queue: Array<{ type?: string; [k: string]: unknown }> = [];
    const waiters: Array<{
      matcher: (m: { type?: string }) => boolean;
      resolve: (msg: { type?: string; [k: string]: unknown }) => void;
    }> = [];

    ws.on("message", (raw) => {
      let msg: { type?: string; [k: string]: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const idx = waiters.findIndex((w) => w.matcher(msg));
      if (idx >= 0) {
        const w = waiters.splice(idx, 1)[0]!;
        w.resolve(msg);
      } else {
        queue.push(msg);
      }
    });

    ws.on("error", (e) => reject(e instanceof Error ? e : new Error(String(e))));
    ws.on("open", () =>
      resolve({
        ws,
        next(matcher, timeoutMs = 1500) {
          const idx = queue.findIndex((m) => matcher(m));
          if (idx >= 0) return Promise.resolve(queue.splice(idx, 1)[0]!);
          return new Promise((res, rej) => {
            const entry = { matcher, resolve: res };
            waiters.push(entry);
            setTimeout(() => {
              const i = waiters.indexOf(entry);
              if (i >= 0) {
                waiters.splice(i, 1);
                rej(new Error("ws message timeout"));
              }
            }, timeoutMs);
          });
        },
        close() {
          ws.close();
        },
      }),
    );
  });
}

const TOKEN = "dev-token";

function connectWs(url: string, token?: string): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const ws = new WebSocket(url, { headers });
    ws.on("open", () => resolve({ code: 0, reason: "open" }));
    ws.on("close", (code, reason) => resolve({ code, reason: reason.toString() }));
    ws.on("error", () => {});
  });
}

describe("WS gateway", () => {
  let home: string;
  let running: RunningChatlab;

  beforeEach(async () => {
    home = join(tmpdir(), `chatlab-ws-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "ack" } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    running = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent" },
      home,
      host: "127.0.0.1",
      port: 0,
      agentFetcher: fetcher,
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

  it("WS-01 — sends a hello frame on connect with active workspace", async () => {
    const h = await harness(running);
    const hello = await h.next((m) => m.type === "hello");
    expect(hello.type).toBe("hello");
    expect((hello as { active_workspace?: { nickname: string } }).active_workspace?.nickname).toBe(
      "default",
    );
    h.close();
  });

  it("WS-02 — ping/pong round-trip", async () => {
    const h = await harness(running);
    await h.next((m) => m.type === "hello");
    h.ws.send(JSON.stringify({ type: "ping" }));
    expect((await h.next((m) => m.type === "pong")).type).toBe("pong");
    h.close();
  });

  it("WS-03 — invalid JSON yields an error frame", async () => {
    const h = await harness(running);
    await h.next((m) => m.type === "hello");
    h.ws.send("{not json");
    const err = await h.next((m) => m.type === "error");
    expect(err.message).toMatch(/invalid json/);
    h.close();
  });

  it("WS-04 — chat events broadcast on user message + assistant reply", async () => {
    const h = await harness(running);
    await h.next((m) => m.type === "hello");

    const agent = (await (
      await fetch(`${running.url}/v1/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({
          name: "A",
          provider: "openai",
          model: "gpt-4o",
          api_key: "sk-test",
        }),
      })
    ).json()) as { id: string };
    const chat = (await (
      await fetch(`${running.url}/v1/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ agent_id: agent.id, theme: "t" }),
      })
    ).json()) as { id: string };

    await fetch(`${running.url}/v1/chats/${chat.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ content: "ping" }),
    });

    const userEv = await h.next(
      (m) => m.type === "chat.user-message-appended",
    );
    expect(userEv.type).toBe("chat.user-message-appended");

    const assistantEv = await h.next(
      (m) => m.type === "chat.assistant-replied",
      3000,
    );
    expect(assistantEv.type).toBe("chat.assistant-replied");

    h.close();
  });

  it("WS-05 — unauthenticated upgrade is rejected with 401 when requireToken is set", async () => {
    await running.stop();
    const secureHome = join(tmpdir(), `chatlab-ws-sec-${Date.now()}`);
    mkdirSync(secureHome, { recursive: true });
    // Reassign running so afterEach stops this instance instead of the already-stopped one.
    running = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent", CHATLAB_REQUIRE_TOKEN: "secret123" },
      home: secureHome,
      host: "127.0.0.1",
      port: 0,
    });

    const wsUrlSecure = wsUrl(running.url);

    // No token → rejected
    const noToken = await connectWs(wsUrlSecure);
    expect(noToken.code).toBe(1006);  // abnormal closure (401 from server)

    // Wrong token → rejected
    const wrongToken = await connectWs(wsUrlSecure, "wrong");
    expect(wrongToken.code).toBe(1006);

    // Correct token via Authorization header → accepted
    const goodResult = await connectWs(wsUrlSecure, "secret123");
    expect(goodResult.code).toBe(0);  // "open"
  });

  it("WS-06 — browser clients can authenticate via ?token= query parameter", async () => {
    await running.stop();
    const secureHome = join(tmpdir(), `chatlab-ws-qp-${Date.now()}`);
    mkdirSync(secureHome, { recursive: true });
    running = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent", CHATLAB_REQUIRE_TOKEN: "browser-tok" },
      home: secureHome,
      host: "127.0.0.1",
      port: 0,
    });

    const base = wsUrl(running.url);

    // No token → rejected
    const noTok = await connectWs(base);
    expect(noTok.code).toBe(1006);

    // Token in query param → accepted (browser path)
    const result = await new Promise<{ code: number }>((resolve) => {
      const ws = new WebSocket(`${base}?token=browser-tok`);
      ws.on("open", () => resolve({ code: 0 }));
      ws.on("close", (code) => resolve({ code }));
      ws.on("error", () => {});
    });
    expect(result.code).toBe(0);
  });
});
