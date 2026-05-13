import type { Agent } from "../types/agent.js";
import type { LlmMessage } from "./provider.js";
import type { Message } from "../types/domain.js";

/**
 * Minimal projection of StorageAdapter["messages"] needed by buildLlmMessages.
 * Allows callers to pass the storage namespace directly and tests to pass a lightweight mock.
 */
export interface MessageStore {
  listByChat(chat_id: string, opts?: { limit?: number }): Promise<Message[]>;
}

/**
 * Builds the LLM message array from the chat history.
 *
 * Passes { limit } to the store so the database does the windowing (avoids
 * fetching the entire history client-side). Falls back to 20 when
 * context_window is falsy/zero. Filters out failed messages.
 */
export async function buildLlmMessages(
  store: MessageStore,
  agent: Agent,
  theme: string,
  chatId: string,
): Promise<LlmMessage[]> {
  const limit = Math.max(1, agent.context_window || 20);
  const recent = await store.listByChat(chatId, { limit });

  const messages: LlmMessage[] = [];

  const themeLine = theme ? `Topic of this conversation: ${theme}` : "";
  const systemBody =
    agent.system_prompt && themeLine
      ? `${agent.system_prompt}\n\n${themeLine}`
      : agent.system_prompt ?? themeLine;

  if (systemBody) messages.push({ role: "system", content: systemBody });

  for (const m of recent) {
    if (m.status !== "ok") continue;
    messages.push({ role: m.role, content: m.content });
  }

  return messages;
}
