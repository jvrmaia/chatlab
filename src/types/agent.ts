/**
 * Agent profile — workspace-scoped LLM provider configuration. Drops the
 * v1.x `is_default` and `auto_reply` flags; agent assignment is per-chat now.
 */

import type { AgentId, WorkspaceId } from "./domain.js";

export type AgentProvider =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "gemini"
  | "maritaca"
  | "ollama"
  | "custom";

export const AGENT_PROVIDERS: readonly AgentProvider[] = [
  "openai",
  "anthropic",
  "deepseek",
  "gemini",
  "maritaca",
  "ollama",
  "custom",
] as const;

export interface Agent {
  id: AgentId;
  workspace_id: WorkspaceId;
  name: string;
  provider: AgentProvider;
  model: string;
  api_key?: string;
  base_url?: string;
  system_prompt?: string;
  context_window: number;
  created_at: string;
  updated_at: string;
}

export type AgentCreate = Omit<Agent, "id" | "workspace_id" | "created_at" | "updated_at"> & {
  id?: string;
};

export type AgentPatch = Partial<Omit<Agent, "id" | "workspace_id" | "created_at" | "updated_at">>;

export function maskApiKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  if (key.length <= 4) return "***";
  return `***${key.slice(-4)}`;
}

export function publicAgent(a: Agent): Agent {
  const { api_key, ...rest } = a;
  const out: Agent = { ...rest };
  if (api_key !== undefined) {
    const masked = maskApiKey(api_key);
    if (masked !== undefined) out.api_key = masked;
  }
  return out;
}

export interface ProviderDefaults {
  base_url: string;
  model: string;
  requires_api_key: boolean;
}

export const PROVIDER_DEFAULTS: Record<AgentProvider, ProviderDefaults> = {
  openai: { base_url: "https://api.openai.com/v1", model: "gpt-4o", requires_api_key: true },
  anthropic: {
    base_url: "https://api.anthropic.com",
    model: "claude-sonnet-4-6",
    requires_api_key: true,
  },
  deepseek: { base_url: "https://api.deepseek.com", model: "deepseek-chat", requires_api_key: true },
  gemini: {
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    requires_api_key: true,
  },
  maritaca: { base_url: "https://chat.maritaca.ai/api", model: "sabia-3", requires_api_key: true },
  ollama: { base_url: "http://localhost:11434/v1", model: "llama3", requires_api_key: false },
  custom: { base_url: "http://localhost:8000/v1", model: "my-agent", requires_api_key: false },
};
