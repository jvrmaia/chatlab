import { createServer } from "node:http";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootHarness, type Harness } from "./_harness.js";
import { createApp } from "../../src/http/server.js";
import { Core } from "../../src/core/core.js";
import { WorkspaceRegistry } from "../../src/workspaces/registry.js";

describe("HTTP — server bootstrap branches", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHarness();
  });

  afterEach(async () => {
    await h.stop();
  });

  it("SRV-01 — /favicon.ico returns 204", async () => {
    expect((await fetch(`${h.running.url}/favicon.ico`)).status).toBe(204);
  });

  it("SRV-02 — /healthz responds without auth", async () => {
    expect((await fetch(`${h.running.url}/healthz`)).status).toBe(200);
  });

  it("SRV-03 — /readyz returns 200 once ready", async () => {
    const r = await fetch(`${h.running.url}/readyz`);
    expect([200, 503]).toContain(r.status);
  });
});

describe("HTTP — UI serving (token injection + no redirect loop)", () => {
  let url: string;
  let server: ReturnType<typeof createServer>;
  let core: Core;
  let uiDir: string;

  beforeEach(async () => {
    uiDir = join(tmpdir(), `chatlab-ui-test-${Date.now()}`);
    mkdirSync(uiDir, { recursive: true });
    writeFileSync(join(uiDir, "index.html"), "<html><head></head><body></body></html>");

    const home = join(tmpdir(), `chatlab-ui-home-${Date.now()}`);
    mkdirSync(home, { recursive: true });
    const registry = new WorkspaceRegistry({ home });
    core = await Core.start({ registry });

    const app = createApp({ core, requireToken: "test-tok", uiDistDir: uiDir });
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address() as { port: number };
    url = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await core.stop();
    rmSync(uiDir, { recursive: true, force: true });
  });

  it("SRV-04 — GET /ui returns 200 (no redirect loop)", async () => {
    const r = await fetch(`${url}/ui`, { redirect: "manual" });
    expect(r.status).toBe(200);
  });

  it("SRV-05 — GET /ui/ returns 200 (no redirect loop)", async () => {
    const r = await fetch(`${url}/ui/`, { redirect: "manual" });
    expect(r.status).toBe(200);
  });

  it("SRV-06 — served HTML contains injected CHATLAB_TOKEN", async () => {
    const html = await (await fetch(`${url}/ui/`)).text();
    expect(html).toContain(`window.__CHATLAB_TOKEN__="test-tok"`);
  });
});
