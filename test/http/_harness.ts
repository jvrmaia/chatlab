import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startChatlab, type RunningChatlab } from "../../src/index.js";

export interface Harness {
  running: RunningChatlab;
  home: string;
  api(method: string, path: string, body?: unknown): Promise<Response>;
  stop(): Promise<void>;
}

const TOKEN = "dev-token";

export async function bootHarness(opts: { agentFetcher?: typeof fetch } = {}): Promise<Harness> {
  const home = join(tmpdir(), `chatlab-harness-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(home, { recursive: true });
  const running = await startChatlab({
    env: { ...process.env, CHATLAB_LOG_LEVEL: "silent" },
    home,
    host: "127.0.0.1",
    port: 0,
    ...(opts.agentFetcher ? { agentFetcher: opts.agentFetcher } : {}),
  });

  return {
    running,
    home,
    async api(method, path, body) {
      return fetch(`${running.url}${path}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    },
    async stop() {
      await running.stop();
      try {
        rmSync(home, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}
