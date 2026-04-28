import { LlmError, type LlmProvider, type LlmRequest, type LlmResponse } from "./provider.js";

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
    return { content };
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
