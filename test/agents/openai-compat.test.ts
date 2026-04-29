import { describe, expect, it, vi } from "vitest";
import { OpenAiCompatProvider } from "../../src/agents/openai-compat.js";
import { LlmError } from "../../src/agents/provider.js";

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
});
