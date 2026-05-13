import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse, type LlmUsage } from "./provider.js";
import { parseSseLines } from "../lib/sse.js";

export class AnthropicProvider implements LlmProvider {
  async chat(req: LlmRequest): Promise<LlmResponse> {
    if (!req.baseUrl) {
      throw new LlmError("ZZ_AGENT_PROVIDER_ERROR", "baseUrl is required");
    }
    if (!req.apiKey) {
      throw new LlmError("ZZ_AGENT_PROVIDER_ERROR", "apiKey is required for Anthropic");
    }
    const url = `${req.baseUrl.replace(/\/$/, "")}/v1/messages`;

    const systemMessages = req.messages.filter((m) => m.role === "system");
    const turnMessages = req.messages.filter((m) => m.role !== "system");
    const system = systemMessages.map((m) => m.content).join("\n\n") || undefined;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": req.apiKey,
      "anthropic-version": "2023-06-01",
    };

    const fetcher = req.fetcher ?? fetch;
    const body = JSON.stringify({
      model: req.model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: turnMessages.map((m) => ({ role: m.role, content: m.content })),
      ...(typeof req.temperature === "number" ? { temperature: req.temperature } : {}),
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
        `Anthropic returned ${res.status}`,
        res.status,
        parsed,
      );
    }
    const content = extractAnthropicContent(parsed);
    if (!content) {
      throw new LlmError(
        "ZZ_AGENT_PROVIDER_ERROR",
        "Anthropic response missing content[0].text",
        res.status,
        parsed,
      );
    }
    const rawUsage = (parsed as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
    const usage: LlmUsage | undefined =
      rawUsage && typeof rawUsage.input_tokens === "number" && typeof rawUsage.output_tokens === "number"
        ? { prompt_tokens: rawUsage.input_tokens, completion_tokens: rawUsage.output_tokens }
        : undefined;
    return { content, ...(usage ? { usage } : {}) };
  }

  async *chatStream(req: LlmRequest): AsyncIterable<string> {
    if (!req.baseUrl) {
      throw new LlmError("ZZ_AGENT_PROVIDER_ERROR", "baseUrl is required");
    }
    if (!req.apiKey) {
      throw new LlmError("ZZ_AGENT_PROVIDER_ERROR", "apiKey is required for Anthropic");
    }
    const url = `${req.baseUrl.replace(/\/$/, "")}/v1/messages`;

    const systemMessages = req.messages.filter((m) => m.role === "system");
    const turnMessages = req.messages.filter((m) => m.role !== "system");
    const system = systemMessages.map((m) => m.content).join("\n\n") || undefined;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": req.apiKey,
      "anthropic-version": "2023-06-01",
    };

    const fetcher = req.fetcher ?? fetch;
    const body = JSON.stringify({
      model: req.model,
      max_tokens: 1024,
      ...(system ? { system } : {}),
      messages: turnMessages.map((m) => ({ role: m.role, content: m.content })),
      ...(typeof req.temperature === "number" ? { temperature: req.temperature } : {}),
      stream: true,
    });

    const fetchInit: RequestInit = { method: "POST", headers, body };
    if (req.signal) fetchInit.signal = req.signal;
    const res = await fetcher(url, fetchInit);

    if (!res.ok) {
      let errBody: unknown;
      try { errBody = await res.json(); } catch { errBody = null; }
      throw new LlmError("ZZ_AGENT_PROVIDER_ERROR", `Anthropic returned ${res.status}`, res.status, errBody);
    }
    if (!res.body) throw new LlmError("ZZ_AGENT_PROVIDER_ERROR", "No response body for stream");

    let inputTokens = 0;
    let outputTokens = 0;
    for await (const json of parseSseLines(res.body)) {
      try {
        const chunk = JSON.parse(json) as {
          type?: string;
          delta?: { type?: string; text?: unknown; usage?: { output_tokens?: number } };
          message?: { usage?: { input_tokens?: number } };
          usage?: { output_tokens?: number };
        };
        if (chunk?.type === "message_start" && chunk.message?.usage) {
          inputTokens = chunk.message.usage.input_tokens ?? 0;
        } else if (chunk?.type === "message_delta" && chunk.usage) {
          outputTokens = chunk.usage.output_tokens ?? 0;
        } else if (chunk?.type === "message_stop") {
          if (inputTokens > 0 || outputTokens > 0) {
            req.onUsage?.({ prompt_tokens: inputTokens, completion_tokens: outputTokens });
          }
        } else if (chunk?.type === "content_block_delta" && chunk.delta?.type === "text_delta") {
          const text = chunk.delta.text;
          if (typeof text === "string" && text) yield text;
        }
      } catch { /* malformed chunk — skip */ }
    }
  }
}

function extractAnthropicContent(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const content = (body as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (block && typeof block === "object") {
      const b = block as { type?: string; text?: unknown };
      if (b.type === "text" && typeof b.text === "string") return b.text;
    }
  }
  return null;
}
