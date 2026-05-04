import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bootHarness, type Harness } from "./_harness.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HTTP — /v1/agents (CRUD + probe)", () => {
  let h: Harness;
  let agentFetcher: typeof fetch;

  beforeEach(async () => {
    agentFetcher = vi.fn(async () =>
      jsonResponse(200, {
        choices: [{ message: { role: "assistant", content: "canned" } }],
      }),
    ) as unknown as typeof fetch;
    h = await bootHarness({ agentFetcher });
  });

  afterEach(async () => {
    await h.stop();
  });

  it("AGT-H-01 — POST creates an agent with masked api_key in the response", async () => {
    const r = await h.api("POST", "/v1/agents", {
      name: "OpenAI",
      provider: "openai",
      model: "gpt-4o",
      api_key: "sk-test-1234567890ABCDwxyz",
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as { api_key?: string };
    expect(body.api_key).toMatch(/\*\*\*/);
    expect(body.api_key).not.toContain("sk-test");
  });

  it("AGT-H-02 — POST rejects invalid provider, empty name, empty model", async () => {
    expect(
      (await h.api("POST", "/v1/agents", { name: "X", provider: "fake", model: "x" })).status,
    ).toBe(400);
    expect(
      (await h.api("POST", "/v1/agents", { name: "", provider: "openai", model: "x" })).status,
    ).toBe(400);
    expect(
      (await h.api("POST", "/v1/agents", { name: "x", provider: "openai", model: "" })).status,
    ).toBe(400);
  });

  it("AGT-H-03 — context_window > 200 is clamped", async () => {
    const r = await h.api("POST", "/v1/agents", {
      name: "X",
      provider: "openai",
      model: "gpt-4o",
      context_window: 9999,
    });
    expect(((await r.json()) as { context_window: number }).context_window).toBe(200);
  });

  it("AGT-H-04 — GET list + GET by id (mask) + 404 for unknown", async () => {
    const created = (await (
      await h.api("POST", "/v1/agents", {
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-A-1234567890ABCDwxyz",
      })
    ).json()) as { id: string };
    expect((await h.api("GET", `/v1/agents/${created.id}`)).status).toBe(200);
    expect((await h.api("GET", "/v1/agents/no-such")).status).toBe(404);
    const list = (await (await h.api("GET", "/v1/agents")).json()) as {
      data: Array<{ api_key?: string }>;
    };
    expect(list.data[0]?.api_key).not.toContain("sk-A-1234");
  });

  it("AGT-H-05 — PATCH preserves api_key when omitted; rejects unknown provider", async () => {
    const a = (await (
      await h.api("POST", "/v1/agents", {
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-orig-1234567890ABCDwxyz",
      })
    ).json()) as { id: string };
    const updated = (await (
      await h.api("PATCH", `/v1/agents/${a.id}`, { name: "renamed" })
    ).json()) as { name: string; api_key?: string };
    expect(updated.name).toBe("renamed");
    expect(updated.api_key).toMatch(/\*\*\*/);

    expect((await h.api("PATCH", `/v1/agents/${a.id}`, { provider: "fake" })).status).toBe(400);
    expect((await h.api("PATCH", "/v1/agents/no-such", { name: "x" })).status).toBe(404);
  });

  it("AGT-H-06 — DELETE removes agent; refuses if any chat references it", async () => {
    const a = (await (
      await h.api("POST", "/v1/agents", {
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
      })
    ).json()) as { id: string };

    // create a chat referencing the agent — DELETE should now be 409
    const chat = (await (
      await h.api("POST", "/v1/chats", { agent_id: a.id, theme: "t" })
    ).json()) as { id: string };
    const blocked = await h.api("DELETE", `/v1/agents/${a.id}`);
    expect(blocked.status).toBe(409);

    // remove the chat, then DELETE works
    await h.api("DELETE", `/v1/chats/${chat.id}`);
    expect((await h.api("DELETE", `/v1/agents/${a.id}`)).status).toBe(200);
    expect((await h.api("DELETE", `/v1/agents/${a.id}`)).status).toBe(404);
  });

  it("AGT-H-07 — POST /probe routes through the injected agentFetcher", async () => {
    const a = (await (
      await h.api("POST", "/v1/agents", {
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
      })
    ).json()) as { id: string };
    const r = await h.api("POST", `/v1/agents/${a.id}/probe`, { prompt: "hi" });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { content: string }).content).toBe("canned");
    expect(agentFetcher).toHaveBeenCalled();

    expect((await h.api("POST", "/v1/agents/no-such/probe", { prompt: "x" })).status).toBe(404);
  });

  it("AGT-H-09 — POST with blocked base_url hosts returns 400", async () => {
    const blocked = [
      "http://10.0.0.1/v1",
      "http://172.16.0.1/v1",
      "http://192.168.1.1/v1",
      "http://169.254.169.254/v1",
      "http://127.0.0.1/v1",
      "http://localhost/v1",
    ];
    for (const base_url of blocked) {
      const r = await h.api("POST", "/v1/agents", {
        name: "X",
        provider: "custom",
        model: "m",
        base_url,
      });
      expect(r.status, `expected 400 for base_url=${base_url}`).toBe(400);
    }
  });

  it("AGT-H-08 — provider error in /probe surfaces as 502 with subcode", async () => {
    await h.stop();
    const errFetcher = vi.fn(async () =>
      jsonResponse(401, { error: { message: "bad" } }),
    ) as unknown as typeof fetch;
    h = await bootHarness({ agentFetcher: errFetcher });

    const a = (await (
      await h.api("POST", "/v1/agents", {
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-bad",
      })
    ).json()) as { id: string };

    const r = await h.api("POST", `/v1/agents/${a.id}/probe`, { prompt: "hi" });
    expect(r.status).toBe(502);
    expect(((await r.json()) as { error: { error_subcode?: string } }).error.error_subcode).toBe(
      "ZZ_AGENT_PROVIDER_ERROR",
    );
  });
});
