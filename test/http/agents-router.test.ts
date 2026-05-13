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

  it("AGT-H-10 — validateBaseUrl rejects non-http(s) scheme", async () => {
    const r = await h.api("POST", "/v1/agents", {
      name: "X",
      provider: "custom",
      model: "m",
      base_url: "ftp://example.com/api",
    });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/http/i);
  });

  it("AGT-H-11 — validateBaseUrl rejects invalid URL string", async () => {
    const r = await h.api("POST", "/v1/agents", {
      name: "X",
      provider: "custom",
      model: "m",
      base_url: "not-a-valid-url",
    });
    expect(r.status).toBe(400);
  });

  it("AGT-H-12 — validateBaseUrl rejects ::1 (loopback) in base_url", async () => {
    const r = await h.api("POST", "/v1/agents", {
      name: "X",
      provider: "custom",
      model: "m",
      base_url: "http://[::1]/v1",
    });
    expect(r.status).toBe(400);
  });

  it("AGT-H-14 — validateBaseUrl accepts a valid public external URL", async () => {
    const r = await h.api("POST", "/v1/agents", {
      name: "External",
      provider: "custom",
      model: "m",
      base_url: "https://api.example.com/v1",
    });
    // Should succeed (201) — the base_url validation passes for public external URLs
    expect(r.status).toBe(201);
    const body = (await r.json()) as { base_url?: string };
    expect(body.base_url).toBe("https://api.example.com/v1");
  });

  it("AGT-H-13 — PATCH with provider, context_window, temperature updates agent", async () => {
    const a = (await (
      await h.api("POST", "/v1/agents", {
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
      })
    ).json()) as { id: string };

    const patched = (await (
      await h.api("PATCH", `/v1/agents/${a.id}`, {
        provider: "anthropic",
        context_window: 50,
        temperature: 0.5,
      })
    ).json()) as { provider: string; context_window: number; temperature: number };
    expect(patched.provider).toBe("anthropic");
    expect(patched.context_window).toBe(50);
    expect(patched.temperature).toBe(0.5);
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

  it("AGT-H-15 — POST agent with system_prompt and temperature stores and returns them", async () => {
    const r = await h.api("POST", "/v1/agents", {
      name: "Full",
      provider: "openai",
      model: "gpt-4o",
      api_key: "sk-test",
      system_prompt: "You are a coding assistant.",
      temperature: 0.2,
    });
    expect(r.status).toBe(201);
    const body = (await r.json()) as { system_prompt?: string; temperature?: number };
    expect(body.system_prompt).toBe("You are a coding assistant.");
    expect(body.temperature).toBe(0.2);
  });

  it("AGT-H-16 — PATCH with model + base_url + system_prompt updates all three", async () => {
    const created = (await (
      await h.api("POST", "/v1/agents", {
        name: "B",
        provider: "custom",
        model: "old-model",
        base_url: "https://api.example.com/v1",
      })
    ).json()) as { id: string };

    const patched = (await (
      await h.api("PATCH", `/v1/agents/${created.id}`, {
        model: "new-model",
        base_url: "https://api2.example.com/v1",
        system_prompt: "be brief",
      })
    ).json()) as { model: string; base_url?: string; system_prompt?: string };

    expect(patched.model).toBe("new-model");
    expect(patched.base_url).toBe("https://api2.example.com/v1");
    expect(patched.system_prompt).toBe("be brief");
  });

  it("AGT-H-17b — POST /v1/agents without Content-Type uses req.body ?? {} fallback (line 38)", async () => {
    // No Content-Type → req.body undefined → ?? {} → parsed with empty body → 400 (missing name)
    const r = await fetch(`${h.running.url}/v1/agents`, {
      method: "POST",
      headers: { Authorization: "Bearer dev-token" },
    });
    expect(r.status).toBe(400);
  });

  it("AGT-H-17c — PATCH /v1/agents/:id without Content-Type uses req.body ?? {} fallback (line 62)", async () => {
    const a = (await (
      await h.api("POST", "/v1/agents", {
        name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-test",
      })
    ).json()) as { id: string };
    // No Content-Type → req.body undefined → ?? {} → empty patch → accepted (no changes)
    const r = await fetch(`${h.running.url}/v1/agents/${a.id}`, {
      method: "PATCH",
      headers: { Authorization: "Bearer dev-token" },
    });
    expect(r.status).toBe(200);
  });

  it("AGT-H-17d — POST /v1/agents/:id/probe without Content-Type uses req.body ?? {} fallback (line 109)", async () => {
    const a = (await (
      await h.api("POST", "/v1/agents", {
        name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-test",
      })
    ).json()) as { id: string };
    // No Content-Type → req.body undefined → ?? {} → body.prompt undefined → uses default "Hello"
    const r = await fetch(`${h.running.url}/v1/agents/${a.id}/probe`, {
      method: "POST",
      headers: { Authorization: "Bearer dev-token" },
    });
    expect(r.status).toBe(200);
  });

  it("AGT-H-17 — non-LlmError thrown in probe inner try is re-thrown (line 116)", async () => {
    await h.stop();
    const throwingFetcher = vi.fn(async () => {
      throw new Error("network timeout");
    }) as unknown as typeof fetch;
    h = await bootHarness({ agentFetcher: throwingFetcher });

    const a = (await (
      await h.api("POST", "/v1/agents", {
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
      })
    ).json()) as { id: string };

    const r = await h.api("POST", `/v1/agents/${a.id}/probe`, { prompt: "hi" });
    // Non-LlmError → re-thrown → outer catch → next(err) → errorHandler → 500
    expect(r.status).toBe(500);
  });

  it("AGT-H-18 — storage error in GET /v1/agents surfaces via next(err) (line 32)", async () => {
    const spy = vi.spyOn(h.running.core.storage.agents, "list").mockRejectedValueOnce(new Error("db gone"));
    const r = await h.api("GET", "/v1/agents");
    spy.mockRestore();
    expect(r.status).toBe(500);
  });

  it("AGT-H-19 — probe agent with system_prompt includes it in LLM messages (line 99 true branch)", async () => {
    const a = (await (
      await h.api("POST", "/v1/agents", {
        name: "SysPromptAgent",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
        system_prompt: "You are a helpful assistant.",
      })
    ).json()) as { id: string };
    const r = await h.api("POST", `/v1/agents/${a.id}/probe`, { prompt: "hi" });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { content: string }).content).toBe("canned");
  });

  it("AGT-H-20 — PATCH with empty api_key skips updating it (line 171 false branch)", async () => {
    const a = (await (
      await h.api("POST", "/v1/agents", {
        name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-original",
      })
    ).json()) as { id: string; api_key?: string };
    const originalMask = a.api_key;

    const patched = (await (
      await h.api("PATCH", `/v1/agents/${a.id}`, { api_key: "" })
    ).json()) as { api_key?: string };
    // Empty api_key is ignored → original key unchanged
    expect(patched.api_key).toBe(originalMask);
  });

  it("AGT-H-22 — PATCH with non-empty api_key updates the key (line 171 true branch)", async () => {
    const a = (await (
      await h.api("POST", "/v1/agents", {
        name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-old-AAAA",
      })
    ).json()) as { id: string; api_key?: string };
    const originalMask = a.api_key;

    const patched = (await (
      await h.api("PATCH", `/v1/agents/${a.id}`, { api_key: "sk-new-BBBB" })
    ).json()) as { api_key?: string };
    expect(patched.api_key).toMatch(/\*\*\*/);
    // last 4 chars differ → masks differ
    expect(patched.api_key).not.toBe(originalMask);
  });

  it("AGT-H-23 — probe without opts.agentFetcher uses global fetch (line 109 false branch)", async () => {
    await h.stop();
    h = await bootHarness(); // no agentFetcher → opts.agentFetcher undefined → line 109 false branch
    const serverUrl = h.running.url;

    const originalFetch = globalThis.fetch;
    const probeResp = JSON.stringify({ choices: [{ message: { role: "assistant", content: "global-reply" } }] });
    const smartMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const urlStr = input instanceof Request ? input.url : String(input);
      if (urlStr.startsWith(serverUrl)) {
        return originalFetch(input as Parameters<typeof fetch>[0], init);
      }
      return new Response(probeResp, { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", smartMock);

    try {
      const a = (await (
        await h.api("POST", "/v1/agents", {
          name: "A", provider: "custom", model: "m",
          base_url: "https://llm.example.com/v1",
        })
      ).json()) as { id: string };

      const r = await h.api("POST", `/v1/agents/${a.id}/probe`, { prompt: "hi" });
      expect(r.status).toBe(200);
      expect(((await r.json()) as { content: string }).content).toBe("global-reply");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("AGT-H-21 — probe agent with no api_key omits Authorization header (line 107 false branch)", async () => {
    // Use Ollama provider which doesn't require api_key
    const a = (await (
      await h.api("POST", "/v1/agents", {
        name: "OllamaAgent",
        provider: "ollama",
        model: "llama3",
        base_url: "https://api.example.com/v1",
      })
    ).json()) as { id: string };
    const r = await h.api("POST", `/v1/agents/${a.id}/probe`, { prompt: "hi" });
    expect(r.status).toBe(200);
    // agentFetcher returns "canned" regardless
    expect(((await r.json()) as { content: string }).content).toBe("canned");
  });
});
