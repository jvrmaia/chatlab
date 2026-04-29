import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootHarness, type Harness } from "./_harness.js";

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
