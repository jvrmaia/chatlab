import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../../src/agents/anthropic.js";

const provider = new AnthropicProvider();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("agent provider — anthropic", () => {
  it("AGT-05 — splits system out of messages, uses x-api-key + anthropic-version, parses content[0].text", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), ...(init !== undefined ? { init } : {}) });
      return jsonResponse(200, {
        content: [{ type: "text", text: "Olá da Anthropic." }],
      });
    }) as unknown as typeof fetch;

    const out = await provider.chat({
      messages: [
        { role: "system", content: "You are kind." },
        { role: "user", content: "Hi" },
      ],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      fetcher,
    });
    expect(out.content).toBe("Olá da Anthropic.");
    const init = calls[0]!.init!;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    const body = JSON.parse(String(init.body));
    expect(body.system).toBe("You are kind.");
    expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
    expect(body.model).toBe("claude-sonnet-4-6");
  });

  it("AGT-06 — missing api key fails fast (no fetch)", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(
      provider.chat({
        messages: [{ role: "user", content: "x" }],
        model: "claude-sonnet-4-6",
        baseUrl: "https://api.anthropic.com",
        fetcher,
      }),
    ).rejects.toThrow(/apiKey/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("AGT-06b — missing baseUrl fails fast", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(
      provider.chat({
        messages: [{ role: "user", content: "x" }],
        model: "claude-sonnet-4-6",
        apiKey: "sk-ant-test",
        fetcher,
      }),
    ).rejects.toThrow(/baseUrl/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("AGT-06c — non-2xx surfaces ZZ_AGENT_PROVIDER_ERROR with status", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(529, { error: { type: "overloaded" } }),
    ) as unknown as typeof fetch;
    await expect(
      provider.chat({
        messages: [{ role: "user", content: "x" }],
        model: "claude-sonnet-4-6",
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        fetcher,
      }),
    ).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR", status: 529 });
  });

  it("AGT-06d — empty content array surfaces a clean error", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { content: [] }),
    ) as unknown as typeof fetch;
    await expect(
      provider.chat({
        messages: [{ role: "user", content: "x" }],
        model: "claude-sonnet-4-6",
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        fetcher,
      }),
    ).rejects.toThrow(/content\[0\]\.text/);
  });

  it("AGT-ANT-03 — chatStream() with valid SSE stub yields text tokens", async () => {
    const sseBody =
      `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}\n\n` +
      `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}\n\n` +
      `data: {"type":"message_stop"}\n\n`;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sseBody));
        controller.close();
      },
    });
    const fetcher = vi.fn(
      async () => new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    ) as unknown as typeof fetch;

    const chunks: string[] = [];
    for await (const chunk of provider.chatStream({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      fetcher,
    })) {
      chunks.push(chunk);
    }
    expect(chunks.join("")).toBe("hello world");
  });

  it("AGT-ANT-04 — chatStream() with 4xx response propagates LlmError", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(401, { error: { type: "authentication_error" } }),
    ) as unknown as typeof fetch;

    await expect(async () => {
      for await (const _ of provider.chatStream({
        messages: [{ role: "user", content: "x" }],
        model: "claude-sonnet-4-6",
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        fetcher,
      })) { /* drain */ }
    }).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR", status: 401 });
  });

  it("AGT-ANT-05 — chat() returns usage with mapped field names", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, {
        content: [{ type: "text", text: "reply" }],
        usage: { input_tokens: 20, output_tokens: 8 },
      }),
    ) as unknown as typeof fetch;

    const out = await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      fetcher,
    });
    expect(out.usage).toEqual({ prompt_tokens: 20, completion_tokens: 8 });
  });

  it("AGT-ANT-06 — chat() usage undefined when provider omits it", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { content: [{ type: "text", text: "reply" }] }),
    ) as unknown as typeof fetch;

    const out = await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      fetcher,
    });
    expect(out.usage).toBeUndefined();
  });

  it("AGT-ANT-07 — chatStream() calls onUsage after message_stop with accumulated tokens", async () => {
    const sse = [
      `data: {"type":"message_start","message":{"usage":{"input_tokens":15}}}\n\n`,
      `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hello"}}\n\n`,
      `data: {"type":"message_delta","usage":{"output_tokens":6}}\n\n`,
      `data: {"type":"message_stop"}\n\n`,
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
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      fetcher,
      onUsage: (u) => { capturedUsage = u; },
    })) {
      tokens.push(t);
    }
    expect(tokens).toEqual(["hello"]);
    expect(capturedUsage).toEqual({ prompt_tokens: 15, completion_tokens: 6 });
  });

  it("AGT-ANT-10 — non-JSON error body is handled gracefully (parsed = null path)", async () => {
    const fetcher = vi.fn(
      async () => new Response("Bad Gateway", { status: 502, headers: { "Content-Type": "text/plain" } }),
    ) as unknown as typeof fetch;

    await expect(
      provider.chat({
        messages: [{ role: "user", content: "x" }],
        model: "claude-sonnet-4-6",
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        fetcher,
      }),
    ).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR", status: 502 });
  });

  it("AGT-ANT-08 — chatStream() missing apiKey throws LlmError", async () => {
    await expect(async () => {
      for await (const _ of provider.chatStream({
        messages: [{ role: "user", content: "x" }],
        model: "claude-sonnet-4-6",
        baseUrl: "https://api.anthropic.com",
      })) { /* drain */ }
    }).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR" });
  });

  it("AGT-ANT-09 — chatStream() missing baseUrl throws LlmError", async () => {
    await expect(async () => {
      for await (const _ of provider.chatStream({
        messages: [{ role: "user", content: "x" }],
        model: "claude-sonnet-4-6",
        apiKey: "sk-ant-test",
      })) { /* drain */ }
    }).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR" });
  });

  it("AGT-ANT-11 — chat() with temperature includes it in request body (line 30 true branch)", async () => {
    let sentBody: Record<string, unknown> = {};
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse(200, { content: [{ type: "text", text: "ok" }] });
    }) as unknown as typeof fetch;

    await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      temperature: 0.7,
      fetcher,
    });
    expect(sentBody.temperature).toBe(0.7);
  });

  it("AGT-ANT-12 — chat() passes AbortSignal to fetch (line 34 true branch)", async () => {
    const controller = new AbortController();
    const captured: RequestInit[] = [];
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init) captured.push(init);
      return jsonResponse(200, { content: [{ type: "text", text: "ok" }] });
    }) as unknown as typeof fetch;

    await provider.chat({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      signal: controller.signal,
      fetcher,
    });
    expect(captured[0]?.signal).toBe(controller.signal);
  });

  it("AGT-ANT-13 — chatStream() with temperature includes it in request body (line 93 true branch)", async () => {
    let sentBody: Record<string, unknown> = {};
    const sseBody = `data: {"type":"message_stop"}\n\n`;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close(); } }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as unknown as typeof fetch;

    for await (const _ of provider.chatStream({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      temperature: 0.3,
      fetcher,
    })) { /* drain */ }
    expect(sentBody.temperature).toBe(0.3);
  });

  it("AGT-ANT-14 — chatStream() passes AbortSignal to fetch (line 98 true branch)", async () => {
    const controller = new AbortController();
    const captured: RequestInit[] = [];
    const sseBody = `data: {"type":"message_stop"}\n\n`;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init) captured.push(init);
      return new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close(); } }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as unknown as typeof fetch;

    for await (const _ of provider.chatStream({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      signal: controller.signal,
      fetcher,
    })) { /* drain */ }
    expect(captured[0]?.signal).toBe(controller.signal);
  });

  it("AGT-ANT-15 — chatStream() with null body throws (line 106 true branch)", async () => {
    const fetcher = vi.fn(async () => {
      // Create a response with body explicitly set to null
      const r = new Response(null, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      return r;
    }) as unknown as typeof fetch;

    await expect(async () => {
      for await (const _ of provider.chatStream({
        messages: [{ role: "user", content: "x" }],
        model: "claude-sonnet-4-6",
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        fetcher,
      })) { /* drain */ }
    }).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR" });
  });

  it("AGT-ANT-16 — chatStream() skips empty text chunks (line 128 false branch)", async () => {
    const sseBody = [
      `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":""}}\n\n`,
      `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"real"}}\n\n`,
      `data: {"type":"message_stop"}\n\n`,
    ].join("");
    const fetcher = vi.fn(async () =>
      new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close(); } }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    ) as unknown as typeof fetch;

    const chunks: string[] = [];
    for await (const t of provider.chatStream({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      fetcher,
    })) { chunks.push(t); }
    expect(chunks).toEqual(["real"]);
  });

  it("AGT-ANT-17 — chatStream() message_stop with zero tokens does not call onUsage (line 123 false branch)", async () => {
    const sseBody = `data: {"type":"message_stop"}\n\n`;
    const fetcher = vi.fn(async () =>
      new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close(); } }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    ) as unknown as typeof fetch;

    let usageCalled = false;
    for await (const _ of provider.chatStream({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      fetcher,
      onUsage: () => { usageCalled = true; },
    })) { /* drain */ }
    expect(usageCalled).toBe(false);
  });

  it("AGT-ANT-18 — chatStream() message_start with undefined input_tokens uses fallback 0 (line 119)", async () => {
    const sseBody = [
      `data: {"type":"message_start","message":{"usage":{}}}\n\n`,
      `data: {"type":"message_delta","usage":{"output_tokens":3}}\n\n`,
      `data: {"type":"message_stop"}\n\n`,
    ].join("");
    const fetcher = vi.fn(async () =>
      new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close(); } }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    ) as unknown as typeof fetch;

    let capturedUsage: { prompt_tokens: number; completion_tokens: number } | undefined;
    for await (const _ of provider.chatStream({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      fetcher,
      onUsage: (u) => { capturedUsage = u; },
    })) { /* drain */ }
    // inputTokens was 0, outputTokens was 3 → (0 > 0 || 3 > 0) → onUsage called
    expect(capturedUsage?.prompt_tokens).toBe(0);
    expect(capturedUsage?.completion_tokens).toBe(3);
  });

  it("AGT-ANT-19 — chat() with 200 but non-JSON body hits null-parsed path (line 41 + line 136)", async () => {
    const fetcher = vi.fn(
      async () => new Response("not-json", { status: 200, headers: { "Content-Type": "application/json" } }),
    ) as unknown as typeof fetch;

    await expect(
      provider.chat({
        messages: [{ role: "user", content: "x" }],
        model: "claude-sonnet-4-6",
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        fetcher,
      }),
    ).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR" });
  });

  it("AGT-ANT-20 — extractAnthropicContent with non-array content returns null (line 138)", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { content: "not-an-array" }),
    ) as unknown as typeof fetch;

    await expect(
      provider.chat({
        messages: [{ role: "user", content: "x" }],
        model: "claude-sonnet-4-6",
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        fetcher,
      }),
    ).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR" });
  });

  it("AGT-ANT-21 — extractAnthropicContent with null block in array is skipped (line 140 false branch)", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { content: [null, { type: "text", text: "found" }] }),
    ) as unknown as typeof fetch;

    const out = await provider.chat({
      messages: [{ role: "user", content: "x" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      fetcher,
    });
    expect(out.content).toBe("found");
  });

  it("AGT-ANT-22 — extractAnthropicContent with non-text block type falls through (line 142 false branch)", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse(200, { content: [{ type: "image", source: {} }] }),
    ) as unknown as typeof fetch;

    await expect(
      provider.chat({
        messages: [{ role: "user", content: "x" }],
        model: "claude-sonnet-4-6",
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
        fetcher,
      }),
    ).rejects.toMatchObject({ subcode: "ZZ_AGENT_PROVIDER_ERROR" });
  });

  it("AGT-ANT-23 — chatStream() includes system in body when system messages present (line 91 true branch)", async () => {
    let sentBody: Record<string, unknown> = {};
    const sseBody = `data: {"type":"message_stop"}\n\n`;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close(); } }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      );
    }) as unknown as typeof fetch;

    for await (const _ of provider.chatStream({
      messages: [
        { role: "system", content: "Be concise." },
        { role: "user", content: "hi" },
      ],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      fetcher,
    })) { /* drain */ }
    expect(sentBody.system).toBe("Be concise.");
  });

  it("AGT-ANT-24 — chatStream() message_delta with missing output_tokens uses ?? 0 (line 121 false branch)", async () => {
    const sseBody = [
      `data: {"type":"message_start","message":{"usage":{"input_tokens":5}}}\n\n`,
      `data: {"type":"message_delta","usage":{}}\n\n`,
      `data: {"type":"message_stop"}\n\n`,
    ].join("");
    const fetcher = vi.fn(async () =>
      new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close(); } }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    ) as unknown as typeof fetch;

    let capturedUsage: { prompt_tokens: number; completion_tokens: number } | undefined;
    for await (const _ of provider.chatStream({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      fetcher,
      onUsage: (u) => { capturedUsage = u; },
    })) { /* drain */ }
    expect(capturedUsage?.prompt_tokens).toBe(5);
    expect(capturedUsage?.completion_tokens).toBe(0);
  });

  it("AGT-ANT-25 — chatStream() skips content_block_delta with non-text_delta type (line 126 false branch)", async () => {
    const sseBody = [
      `data: {"type":"content_block_delta","delta":{"type":"input_json_delta","partial_json":"{}"}}\n\n`,
      `data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\n`,
      `data: {"type":"message_stop"}\n\n`,
    ].join("");
    const fetcher = vi.fn(async () =>
      new Response(
        new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sseBody)); c.close(); } }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    ) as unknown as typeof fetch;

    const chunks: string[] = [];
    for await (const t of provider.chatStream({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com",
      fetcher,
    })) { chunks.push(t); }
    expect(chunks).toEqual(["ok"]);
  });

  it("AGT-ANT-26 — chat() uses global fetch when no fetcher provided (line 24 ?? false branch)", async () => {
    const mockFetch = vi.fn(async () =>
      jsonResponse(200, { content: [{ type: "text", text: "from-global" }] }),
    ) as unknown as typeof fetch;
    vi.stubGlobal("fetch", mockFetch);
    try {
      const out = await provider.chat({
        messages: [{ role: "user", content: "hi" }],
        model: "claude-sonnet-4-6",
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
      });
      expect(out.content).toBe("from-global");
      expect(mockFetch).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("AGT-ANT-27 — chatStream() uses global fetch when no fetcher provided (line 87 ?? false branch)", async () => {
    const sseBody = `data: {"type":"message_stop"}\n\n`;
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
        model: "claude-sonnet-4-6",
        apiKey: "sk-ant-test",
        baseUrl: "https://api.anthropic.com",
      })) { /* drain */ }
      expect(mockFetch).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
