import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startChatlab, type RunningChatlab } from "../../src/index.js";

describe("HTTP — auth", () => {
  let home: string;
  let running: RunningChatlab;

  beforeEach(async () => {
    home = join(tmpdir(), `chatlab-auth-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
    running = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent", CHATLAB_REQUIRE_TOKEN: "secret" },
      home,
      host: "127.0.0.1",
      port: 0,
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

  it("AUTH-01 — request without bearer returns 401", async () => {
    const r = await fetch(`${running.url}/v1/workspaces`);
    expect(r.status).toBe(401);
  });

  it("AUTH-02 — wrong token returns 401", async () => {
    const r = await fetch(`${running.url}/v1/workspaces`, {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(r.status).toBe(401);
  });

  it("AUTH-03 — correct token passes through", async () => {
    const r = await fetch(`${running.url}/v1/workspaces`, {
      headers: { Authorization: "Bearer secret" },
    });
    expect(r.status).toBe(200);
  });

  it("AUTH-04 — /healthz is unauth (no token needed)", async () => {
    const r = await fetch(`${running.url}/healthz`);
    expect(r.status).toBe(200);
  });
});
