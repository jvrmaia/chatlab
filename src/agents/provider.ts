export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}

export interface LlmResponse {
  content: string;
}

export interface LlmProvider {
  chat(req: LlmRequest): Promise<LlmResponse>;
}

export class LlmError extends Error {
  constructor(
    public readonly subcode: "ZZ_AGENT_PROVIDER_ERROR" | "ZZ_AGENT_TIMEOUT" | "ZZ_AGENT_NO_DEFAULT",
    message: string,
    public readonly status?: number,
    public readonly providerBody?: unknown,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
