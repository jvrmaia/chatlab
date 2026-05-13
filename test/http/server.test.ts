import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootHarness, type Harness } from "./_harness.js";
import { createApp } from "../../src/http/server.js";
import { startChatlab } from "../../src/index.js";
import { Core } from "../../src/core/core.js";
import { WorkspaceRegistry } from "../../src/workspaces/registry.js";
import { setReady } from "../../src/http/routers/healthz.js";
import express from "express";
import { errorHandler, requestIdMiddleware, ApiError } from "../../src/http/error-handler.js";

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
    uiDir = mkdtempSync(join(tmpdir(), "chatlab-ui-test-"));
    writeFileSync(join(uiDir, "index.html"), "<html><head></head><body></body></html>");

    const home = mkdtempSync(join(tmpdir(), "chatlab-ui-home-"));
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

  it("SRV-07 — GET /ui/deep-route falls through static and serves index.html (SPA catch-all)", async () => {
    const r = await fetch(`${url}/ui/deep-route/nested`, { redirect: "manual" });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("<html>");
  });
});

describe("HTTP — UI serving without dist (503 fallback)", () => {
  let url: string;
  let server: ReturnType<typeof createServer>;
  let core: Core;

  beforeEach(async () => {
    const home = mkdtempSync(join(tmpdir(), "chatlab-no-ui-home-"));
    const registry = new WorkspaceRegistry({ home });
    core = await Core.start({ registry });
    // No uiDistDir → else branch → 503 responses for /ui routes
    const app = createApp({ core });
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address() as { port: number };
    url = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await core.stop();
  });

  it("SRV-08 — GET /ui without a built dist returns 503 with informative message", async () => {
    const r = await fetch(`${url}/ui`);
    expect(r.status).toBe(503);
    const body = await r.text();
    expect(body).toContain("npm run build:ui");
  });

  it("SRV-09 — GET /ui/some-route without dist also returns 503", async () => {
    const r = await fetch(`${url}/ui/some-route`);
    expect(r.status).toBe(503);
  });
});

describe("HTTP — healthz readyz 503 when not ready", () => {
  let url: string;
  let server: ReturnType<typeof createServer>;
  let core: Core;

  beforeEach(async () => {
    const home = mkdtempSync(join(tmpdir(), "chatlab-readyz-home-"));
    const registry = new WorkspaceRegistry({ home });
    core = await Core.start({ registry });
    const app = createApp({ core });
    // setReady(true) was called inside createApp; now reset to false to test 503
    setReady(false);
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address() as { port: number };
    url = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    setReady(true);
    await new Promise<void>((r) => server.close(() => r()));
    await core.stop();
  });

  it("SRV-10 — GET /readyz returns 503 when not ready (line 18)", async () => {
    const r = await fetch(`${url}/readyz`);
    expect(r.status).toBe(503);
    const body = (await r.json()) as { status: string };
    expect(body.status).toBe("starting");
  });
});

describe("HTTP — error handler unit tests", () => {
  let url: string;
  let server: ReturnType<typeof createServer>;

  function buildApp(routeHandler: express.RequestHandler) {
    const app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.get("/test", routeHandler);
    // Error-handler without requestIdMiddleware for testing the ?? fallback
    app.get("/test-no-id", ((_req, res, next) => {
      res.locals.requestId = undefined;
      next(new Error("plain error without id"));
    }) as express.RequestHandler);
    app.use(errorHandler);
    return app;
  }

  beforeEach(async () => {
    const app = buildApp((_req, _res, next) => {
      next(new ApiError(500, 1, "test", undefined, { detail: "extra" }));
    });
    server = createServer(app);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address() as { port: number };
    url = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("SRV-ERR-01 — ApiError with errorData includes error_data in response (line 44 true branch)", async () => {
    const r = await fetch(`${url}/test`);
    expect(r.status).toBe(500);
    const body = (await r.json()) as { error: { error_data?: unknown } };
    expect(body.error.error_data).toBeDefined();
  });

  it("SRV-ERR-02 — non-ApiError returns 500 with error message (lines 51-59)", async () => {
    // Build a separate app that throws a plain Error
    const app2 = express();
    app2.use(requestIdMiddleware);
    app2.get("/plain", (_req, _res, next) => {
      next(new Error("plain error thrown"));
    });
    app2.use(errorHandler);
    const srv2 = createServer(app2);
    await new Promise<void>((r) => srv2.listen(0, "127.0.0.1", r));
    const addr = srv2.address() as { port: number };
    const url2 = `http://127.0.0.1:${addr.port}`;

    const r = await fetch(`${url2}/plain`);
    expect(r.status).toBe(500);
    const body = (await r.json()) as { error: { message: string } };
    expect(body.error.message).toContain("plain error thrown");

    await new Promise<void>((res) => srv2.close(() => res()));
  });

  it("SRV-ERR-03 — non-ApiError in production mode returns 'Internal server error' (line 53 true branch)", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const app3 = express();
      app3.use(requestIdMiddleware);
      app3.get("/prod-err", (_req, _res, next) => {
        next(new Error("secret internal detail"));
      });
      app3.use(errorHandler);
      const srv3 = createServer(app3);
      await new Promise<void>((r) => srv3.listen(0, "127.0.0.1", r));
      const addr = srv3.address() as { port: number };
      const url3 = `http://127.0.0.1:${addr.port}`;

      const r = await fetch(`${url3}/prod-err`);
      expect(r.status).toBe(500);
      const body = (await r.json()) as { error: { message: string } };
      expect(body.error.message).toBe("Internal server error");

      await new Promise<void>((res) => srv3.close(() => res()));
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it("SRV-ERR-03b — non-Error (string) thrown uses ?? err fallback for message (line 53 ?? branch)", async () => {
    const app3b = express();
    app3b.use(requestIdMiddleware);
    app3b.get("/string-err", (_req, _res, next) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (next as (err: unknown) => void)("thrown string value");
    });
    app3b.use(errorHandler);
    const srv3b = createServer(app3b);
    await new Promise<void>((r) => srv3b.listen(0, "127.0.0.1", r));
    const addr = srv3b.address() as { port: number };

    const r = await fetch(`http://127.0.0.1:${addr.port}/string-err`);
    expect(r.status).toBe(500);
    const body = (await r.json()) as { error: { message: string } };
    expect(body.error.message).toContain("thrown string value");

    await new Promise<void>((res) => srv3b.close(() => res()));
  });

  it("SRV-ERR-04 — requestId is generated fresh when res.locals.requestId is missing (line 36 ?? branch)", async () => {
    const app4 = express();
    // No requestIdMiddleware → res.locals.requestId is undefined → fallback to newRequestId()
    app4.get("/no-id", (_req, _res, next) => {
      next(new ApiError(400, 1, "test error"));
    });
    app4.use(errorHandler);
    const srv4 = createServer(app4);
    await new Promise<void>((r) => srv4.listen(0, "127.0.0.1", r));
    const addr = srv4.address() as { port: number };
    const url4 = `http://127.0.0.1:${addr.port}`;

    const r = await fetch(`${url4}/no-id`);
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: { request_id: string } };
    expect(body.error.request_id).toBeTruthy();

    await new Promise<void>((res) => srv4.close(() => res()));
  });
});

describe("HTTP — startup logging branches (index.ts lines 98, 105)", () => {
  it("SRV-STARTUP-01 — retentionDays=0 logs 'DISABLED' and plural providers log 's' (lines 98/105 branches)", async () => {
    const home = mkdtempSync(join(tmpdir(), "chatlab-startup-log-"));
    const TOKEN = "startup-log-tok";
    try {
      // First pass: silent start; create a SQLite workspace and 2 cloud agents that persist
      const r1 = await startChatlab({
        env: { ...process.env, CHATLAB_LOG_LEVEL: "silent", CHATLAB_REQUIRE_TOKEN: TOKEN },
        home, host: "127.0.0.1", port: 0,
      });
      // Create a SQLite workspace and activate it so agents persist on disk
      const wsResp = await fetch(`${r1.url}/v1/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ nickname: "persist", storage_type: "sqlite" }),
      });
      const ws = (await wsResp.json()) as { id: string };
      await fetch(`${r1.url}/v1/workspaces/${ws.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      });
      await fetch(`${r1.url}/v1/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ name: "OAI", provider: "openai", model: "gpt-4o", api_key: "sk-1" }),
      });
      await fetch(`${r1.url}/v1/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ name: "ANT", provider: "anthropic", model: "claude-opus-4-7", api_key: "sk-2" }),
      });
      await r1.stop();

      // Second pass: logging enabled (info) + retentionDays=0 → covers lines 98 (true) and 105 ("s")
      const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      let logOutput = "";
      try {
        const r2 = await startChatlab({
          env: {
            ...process.env,
            CHATLAB_LOG_LEVEL: "info",
            CHATLAB_FEEDBACK_RETENTION_DAYS: "0",
            CHATLAB_REQUIRE_TOKEN: TOKEN,
          },
          home, host: "127.0.0.1", port: 0,
        });
        await r2.stop();
        // Capture before mockRestore() clears mock.calls
        logOutput = writeSpy.mock.calls.map((c) => String(c[0])).join("");
      } finally {
        writeSpy.mockRestore();
      }
      expect(logOutput).toContain("DISABLED");
      expect(logOutput).toContain("providers");
    } finally {
      try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
    }
  });
});
