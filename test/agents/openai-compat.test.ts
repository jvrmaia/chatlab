import { describe, expect, it, vi } from "vitest";
import { OpenAiCompatProvider } from "../../src/agents/openai-compat.js";
import { LlmError } from "../../src/agents/provider.js";
import { providerFor, effectiveModel, effectiveBaseUrl } from "../../src/agents/factory.js";
import { AnthropicProvider } from "../../src/agents/anthropic.js";
import type { Agent } from "../../src/types/agent.js";

const provider = new OpenAiCompatProvider();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("agent provider — openai-compat", () => {
  it("AGT-01 — sends Bearer token + chat/completions body and parses choices[0].message.content", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), ...(init !== undefined ? { init } : {}) });
      return jsonResponse(200, {
        choices: [{ message: { role: "assistant", content: "Olá!" } }],
      });
    }) as unknown as typeof fetch;

    const out = await provider.chat({
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Hi" },
      ],
      model: "gpt-4o",
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1",
      temperature: 0.5,
      fetcher,
    });

    expect(out.content).toBe("Olá!");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = calls[0]!.init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-test");
    expect(headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(String(calls[0]!.init!.body));
    expect(body.model).toBe("gpt-4o");
    expect(body.temperature).toBe(0.5);
    expect(body.messages).toHaveLength(2);
    expect(body.stream).toBe(false);
  });

  it("AGT-02 — non-2xx surfaces ZZ_AGENT_PROVIDER_ERROR with status + body", async () => {
    const fetcher = vi.fn(
      async () =>
        jsonResponse(401, { error: { message: "Invalid api key" } }),
    ) as unknown as typeof fetch;

    await expect(
      provider.chat({
        messages: [{ role: "user", content: "x" }],
        model: "gpt-4o",
        apiKey: "wrong",
        baseUrl: "https://api.openai.com/v1",
        fetcher,
      }),
    ).rejects.toMatchObject({
      name: "LlmError",
      subcode: "ZZ_AGENT_PROVIDER_ERROR",
      status: 401,
    });
  });

  it("AGT-03 — empty/missing content surfaces a clean error", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { choices: [] })) as unknown as typeof fetch;
    await expect(
      provider.chat({
        messages: [{ role: "user", content: "x" }],
        model: "gpt-4o",
        apiKey: "k",
        baseUrl: "https://api.openai.com/v1",
        fetcher,
      }),
    ).rejects.toBeInstanceOf(LlmError);
  });

  it("AGT-04 — works for Ollama (no api key, local base URL)", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { choices: [{ message: { content: "from ollama" } }] }),
    ) as unknown as typeof fetch;

    const out = await provider.chat({
      messages: [{ role: "user", content: "ping" }],
      model: "llama3",
      baseUrl: "http://localhost:11434/v1",
      fetcher,
    });
    expect(out.content).toBe("from ollama");
  });

  it("AGT-OAI-05 — chat() missing baseUrl throws LlmError", async () => {
    await expect(
      provider.chat({ messages: [{ role: "user", content: "x" }], model: "gpt-4o" }),
    ).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR" });
  });

  it("AGT-OAI-06 — chat() returns usage when provider includes it", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, {
        choices: [{ message: { content: "ok" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    ) as unknown as typeof fetch;

    const out = await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
      fetcher,
    });
    expect(out.usage).toEqual({ prompt_tokens: 10, completion_tokens: 5 });
  });

  it("AGT-OAI-07 — chat() usage is undefined when provider omits it", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { choices: [{ message: { content: "ok" } }] }),
    ) as unknown as typeof fetch;

    const out = await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
      fetcher,
    });
    expect(out.usage).toBeUndefined();
  });

  it("AGT-OAI-08 — chatStream() sends stream_options.include_usage in request body", async () => {
    const chunks = [
      `data: {"choices":[{"delta":{"content":"hello"}}]}\n\n`,
      `data: [DONE]\n\n`,
    ].join("");
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.stream_options).toEqual({ include_usage: true });
      return new Response(
        new ReadableStream({
          start(c) { c.enqueue(new TextEncoder().encode(chunks)); c.close(); },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as unknown as typeof fetch;

    const tokens: string[] = [];
    for await (const t of provider.chatStream({
      messages: [{ role: "user", content: "hi" }],
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
      fetcher,
    })) {
      tokens.push(t);
    }
    expect(tokens).toEqual(["hello"]);
  });

  it("AGT-OAI-09 — chatStream() calls onUsage when usage chunk arrives", async () => {
    const sse = [
      `data: {"choices":[{"delta":{"content":"hi"}}]}\n\n`,
      `data: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\n`,
      `data: [DONE]\n\n`,
    ].join("");
    const fetcher = vi.fn(async () =>
      new Response(
        new ReadableStream({
          start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close(); },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    ) as unknown as typeof fetch;

    let capturedUsage: { prompt_tokens: number; completion_tokens: number } | undefined;
    const tokens: string[] = [];
    for await (const t of provider.chatStream({
      messages: [{ role: "user", content: "hi" }],
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
      fetcher,
      onUsage: (u) => { capturedUsage = u; },
    })) {
      tokens.push(t);
    }
    expect(tokens).toEqual(["hi"]);
    expect(capturedUsage).toEqual({ prompt_tokens: 7, completion_tokens: 3 });
  });

  it("AGT-OAI-10 — chatStream() missing baseUrl throws LlmError", async () => {
    await expect(async () => {
      for await (const _ of provider.chatStream({
        messages: [{ role: "user", content: "x" }],
        model: "gpt-4o",
      })) { /* drain */ }
    }).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR" });
  });

  it("AGT-OAI-11 — chat() with non-JSON 200 response body hits parsed=null path (line 29)", async () => {
    const fetcher = vi.fn(async () =>
      new Response("bad response", { status: 200, headers: { "Content-Type": "text/plain" } }),
    ) as unknown as typeof fetch;

    await expect(
      provider.chat({
        messages: [{ role: "user", content: "x" }],
        model: "gpt-4o",
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com/v1",
        fetcher,
      }),
    ).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR" });
  });

  it("AGT-OAI-12 — chatStream() uses global fetch when no fetcher provided (line 64 ?? false branch)", async () => {
    const sseBody = `data: [DONE]\n\n`;
    const mockFetch = vi.fn(async () =>
      new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close(); } }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    ) as unknown as typeof fetch;
    vi.stubGlobal("fetch", mockFetch);
    try {
      for await (const _ of provider.chatStream({
        messages: [{ role: "user", content: "hi" }],
        model: "gpt-4o",
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com/v1",
      })) { /* drain */ }
      expect(mockFetch).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("AGT-OAI-13 — chatStream() with null body throws LlmError (line 82 true branch)", async () => {
    const fetcher = vi.fn(async () =>
      new Response(null, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    ) as unknown as typeof fetch;

    await expect(async () => {
      for await (const _ of provider.chatStream({
        messages: [{ role: "user", content: "x" }],
        model: "gpt-4o",
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com/v1",
        fetcher,
      })) { /* drain */ }
    }).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR" });
  });

  it("AGT-OAI-14 — chat() with non-string content hits false branch of extractContent (line 111)", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { choices: [{ message: { content: 42 } }] }),
    ) as unknown as typeof fetch;

    await expect(
      provider.chat({
        messages: [{ role: "user", content: "x" }],
        model: "gpt-4o",
        apiKey: "sk-test",
        baseUrl: "https://api.openai.com/v1",
        fetcher,
      }),
    ).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR" });
  });
});

describe("agents/factory — providerFor + effectiveModel + effectiveBaseUrl", () => {
  const baseAgent: Agent = {
    id: "ag-1",
    workspace_id: "ws-1",
    name: "Test",
    provider: "openai",
    model: "gpt-4o",
    context_window: 20,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
  };

  it("FACT-AGT-01 — providerFor('anthropic') returns AnthropicProvider instance (line 10 true branch)", () => {
    expect(providerFor("anthropic")).toBeInstanceOf(AnthropicProvider);
  });

  it("FACT-AGT-02 — providerFor('openai') returns OpenAiCompatProvider (line 11 false branch)", () => {
    expect(providerFor("openai")).toBeInstanceOf(OpenAiCompatProvider);
  });

  it("FACT-AGT-03 — effectiveBaseUrl with base_url set uses it (true branch of ??)", () => {
    const agent: Agent = { ...baseAgent, base_url: "https://custom.api.example.com/v1" };
    expect(effectiveBaseUrl(agent)).toBe("https://custom.api.example.com/v1");
  });

  it("FACT-AGT-04 — effectiveBaseUrl without base_url falls back to PROVIDER_DEFAULTS (false branch)", () => {
    const url = effectiveBaseUrl(baseAgent);
    expect(url).toContain("api.openai.com");
  });

  it("FACT-AGT-05 — effectiveModel with model set uses it (|| true branch)", () => {
    expect(effectiveModel(baseAgent)).toBe("gpt-4o");
  });

  it("FACT-AGT-06 — effectiveModel with empty model falls back to PROVIDER_DEFAULTS (line 19 false branch)", () => {
    const agent: Agent = { ...baseAgent, model: "" };
    const defaultModel = effectiveModel(agent);
    expect(defaultModel).toBeTruthy();
  });
});
