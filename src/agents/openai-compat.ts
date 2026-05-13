import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from "./provider.js";
import { parseSseLines } from "../lib/sse.js";

export class OpenAiCompatProvider implements LlmProvider {
  async chat(req: LlmRequest): Promise<LlmResponse> {
    if (!req.baseUrl) {
      throw new LlmError("ZZ_AGENT_PROVIDER_ERROR", "baseUrl is required");
    }
    const url = `${req.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (req.apiKey) headers.Authorization = `Bearer ${req.apiKey}`;

    const fetcher = req.fetcher ?? fetch;
    const body = JSON.stringify({
      model: req.model,
      messages: req.messages,
      ...(typeof req.temperature === "number" ? { temperature: req.temperature } : {}),
      stream: false,
    });

    const fetchInit: RequestInit = { method: "POST", headers, body };
    if (req.signal) fetchInit.signal = req.signal;
    const res = await fetcher(url, fetchInit);

    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      throw new LlmError(
        "ZZ_AGENT_PROVIDER_ERROR",
        `Provider returned ${res.status}`,
        res.status,
        parsed,
      );
    }
    const content = extractContent(parsed);
    if (!content) {
      throw new LlmError(
        "ZZ_AGENT_PROVIDER_ERROR",
        "Provider response missing choices[0].message.content",
        res.status,
        parsed,
      );
    }
    return { content };
  }

  async *chatStream(req: LlmRequest): AsyncIterable<string> {
    if (!req.baseUrl) {
      throw new LlmError("ZZ_AGENT_PROVIDER_ERROR", "baseUrl is required");
    }
    const url = `${req.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (req.apiKey) headers.Authorization = `Bearer ${req.apiKey}`;

    const fetcher = req.fetcher ?? fetch;
    const body = JSON.stringify({
      model: req.model,
      messages: req.messages,
      ...(typeof req.temperature === "number" ? { temperature: req.temperature } : {}),
      stream: true,
    });

    const fetchInit: RequestInit = { method: "POST", headers, body };
    if (req.signal) fetchInit.signal = req.signal;
    const res = await fetcher(url, fetchInit);

    if (!res.ok) {
      let errBody: unknown;
      try { errBody = await res.json(); } catch { errBody = null; }
      throw new LlmError("ZZ_AGENT_PROVIDER_ERROR", `Provider returned ${res.status}`, res.status, errBody);
    }
    if (!res.body) throw new LlmError("ZZ_AGENT_PROVIDER_ERROR", "No response body for stream");

    for await (const json of parseSseLines(res.body)) {
      if (json === "[DONE]") return;
      try {
        const chunk = JSON.parse(json) as { choices?: Array<{ delta?: { content?: unknown } }> };
        const text = chunk?.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text) yield text;
      } catch { /* malformed chunk — skip */ }
    }
  }
}

function extractContent(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  return typeof content === "string" ? content : null;
}
