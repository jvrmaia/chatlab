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
});
