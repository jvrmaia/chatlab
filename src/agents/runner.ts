import type { Core, CoreEvent } from "../core/core.js";
import type { Message } from "../types/domain.js";
import { effectiveBaseUrl, effectiveModel, providerFor } from "./factory.js";
import { LlmError } from "./provider.js";
import { buildLlmMessages } from "./executor.js";

/**
 * Subscribes to `chat.user-message-appended` events and produces an
 * assistant reply via the LLM provider attached to the chat's agent.
 *
 * @public
 */
export interface AgentRunnerConfig {
  /** Maximum time (ms) per provider call. Defaults to 60_000. */
  timeoutMs?: number;
  /** Optional injected fetcher — used by tests to stub provider HTTP. */
  fetcher?: typeof fetch;
}

export class AgentRunner {
  private listener: ((e: CoreEvent) => void) | null = null;
  private readonly timeoutMs: number;
  private readonly fetcher?: typeof fetch;

  constructor(private readonly core: Core, cfg: AgentRunnerConfig = {}) {
    this.timeoutMs = cfg.timeoutMs ?? 60_000;
    if (cfg.fetcher !== undefined) this.fetcher = cfg.fetcher;
  }

  start(): void {
    if (this.listener) return;
    this.listener = (event: CoreEvent) => {
      if (event.type !== "chat.user-message-appended") return;
      void this.respondTo(event.message);
    };
    this.core.on("core-event", this.listener);
  }

  stop(): void {
    if (!this.listener) return;
    this.core.off("core-event", this.listener);
    this.listener = null;
  }

  private async respondTo(userMessage: Message): Promise<void> {
    const chat = await this.core.storage.chats.get(userMessage.chat_id);
    if (!chat) return;
    const agent = await this.core.storage.agents.get(chat.agent_id);
    if (!agent) {
      await this.persistFailure(
        userMessage.chat_id,
        "ZZ_AGENT_NOT_FOUND: chat references an agent that no longer exists",
      );
      return;
    }

    this.core.beginInflight();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const messages = await buildLlmMessages(this.core.storage.messages, agent, chat.theme, userMessage.chat_id);
      const provider = providerFor(agent.provider);
      const res = await provider.chat({
        messages,
        model: effectiveModel(agent),
        baseUrl: effectiveBaseUrl(agent),
        ...(agent.api_key ? { apiKey: agent.api_key } : {}),
        temperature: agent.temperature ?? 0.7,
        signal: controller.signal,
        ...(this.fetcher ? { fetcher: this.fetcher } : {}),
      });
      const text = res.content.trim();
      const persisted = await this.core.storage.messages.append({
        chat_id: userMessage.chat_id,
        role: "assistant",
        content: text.length > 0 ? text : "(empty response)",
        status: "ok",
        agent_version: `${agent.provider}/${effectiveModel(agent)}`,
      });
      this.core.emitEvent({ type: "chat.assistant-replied", message: persisted });
    } catch (err) {
      const subcode = err instanceof LlmError ? err.subcode : "ZZ_AGENT_PROVIDER_ERROR";
      const reason =
        err instanceof Error ? `${subcode}: ${err.message}` : `${subcode}: unknown`;
      await this.persistFailure(userMessage.chat_id, reason);
    } finally {
      clearTimeout(timer);
      this.core.endInflight();
    }
  }

  private async persistFailure(chatId: string, reason: string): Promise<void> {
    try {
      const persisted = await this.core.storage.messages.append({
        chat_id: chatId,
        role: "assistant",
        content: "",
        status: "failed",
        error: reason,
      });
      this.core.emitEvent({ type: "chat.assistant-replied", message: persisted });
      this.core.emitEvent({ type: "agent.failed", chat_id: chatId, error: reason });
    } catch {
      // best-effort
    }
  }

}
