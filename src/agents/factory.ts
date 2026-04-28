import { type Agent, type AgentProvider, PROVIDER_DEFAULTS } from "../types/agent.js";
import { AnthropicProvider } from "./anthropic.js";
import { OpenAiCompatProvider } from "./openai-compat.js";
import type { LlmProvider } from "./provider.js";

const openAiCompat = new OpenAiCompatProvider();
const anthropic = new AnthropicProvider();

export function providerFor(name: AgentProvider): LlmProvider {
  if (name === "anthropic") return anthropic;
  return openAiCompat;
}

export function effectiveBaseUrl(agent: Agent): string {
  return agent.base_url ?? PROVIDER_DEFAULTS[agent.provider].base_url;
}

export function effectiveModel(agent: Agent): string {
  return agent.model || PROVIDER_DEFAULTS[agent.provider].model;
}
