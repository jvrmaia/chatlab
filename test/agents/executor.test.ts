import { describe, it, expect, vi } from "vitest";
import type { Agent } from "../../src/types/agent.js";
import type { Message } from "../../src/types/domain.js";
import { buildLlmMessages, type MessageStore } from "../../src/agents/executor.js";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "ag-1",
    workspace_id: "ws-1",
    name: "Test",
    provider: "openai",
    model: "gpt-4o",
    context_window: 20,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeMsg(
  role: "user" | "assistant",
  content: string,
  status: "ok" | "failed" = "ok",
  ts?: string,
): Message {
  return {
    id: `m-${Math.random()}`,
    chat_id: "c-1",
    role,
    content,
    status,
    created_at: ts ?? new Date().toISOString(),
  };
}

function makeStore(msgs: Message[]): MessageStore {
  return {
    listByChat: vi.fn(async (_chatId, opts) => {
      const sorted = [...msgs].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return opts?.limit !== undefined ? sorted.slice(-opts.limit) : sorted;
    }),
  };
}

describe("buildLlmMessages", () => {
  it("EX-01 — system_prompt incluído quando agent.system_prompt está definido", async () => {
    const store = makeStore([makeMsg("user", "hi")]);
    const agent = makeAgent({ system_prompt: "You are helpful." });
    const msgs = await buildLlmMessages(store, agent, "", "c-1");
    expect(msgs[0]).toEqual({ role: "system", content: "You are helpful." });
  });

  it("EX-02 — theme concatenado ao system_prompt quando ambos presentes", async () => {
    const store = makeStore([makeMsg("user", "hi")]);
    const agent = makeAgent({ system_prompt: "Base prompt." });
    const msgs = await buildLlmMessages(store, agent, "Python", "c-1");
    expect(msgs[0]?.content).toBe("Base prompt.\n\nTopic of this conversation: Python");
  });

  it("EX-03 — theme como system message standalone quando sem system_prompt", async () => {
    const store = makeStore([makeMsg("user", "hi")]);
    const agent = makeAgent({ system_prompt: undefined });
    const msgs = await buildLlmMessages(store, agent, "Python", "c-1");
    expect(msgs[0]).toEqual({ role: "system", content: "Topic of this conversation: Python" });
  });

  it("EX-04 — sem system message quando nem system_prompt nem theme", async () => {
    const store = makeStore([makeMsg("user", "hi")]);
    const agent = makeAgent({ system_prompt: undefined });
    const msgs = await buildLlmMessages(store, agent, "", "c-1");
    expect(msgs.find((m) => m.role === "system")).toBeUndefined();
    expect(msgs[0]?.role).toBe("user");
  });

  it("EX-05 — mensagens failed são excluídas do payload LLM", async () => {
    const store = makeStore([
      makeMsg("user", "ok-user"),
      makeMsg("assistant", "failed-reply", "failed"),
      makeMsg("user", "follow-up"),
    ]);
    const agent = makeAgent();
    const msgs = await buildLlmMessages(store, agent, "", "c-1");
    expect(msgs.some((m) => m.content === "failed-reply")).toBe(false);
    expect(msgs.some((m) => m.content === "ok-user")).toBe(true);
  });

  it("EX-06 — passa { limit: context_window } ao store (sem slice client-side)", async () => {
    const store = makeStore([]);
    const listSpy = store.listByChat as ReturnType<typeof vi.fn>;
    const agent = makeAgent({ context_window: 5 });
    await buildLlmMessages(store, agent, "", "c-1");
    expect(listSpy).toHaveBeenCalledWith("c-1", { limit: 5 });
  });

  it("EX-07 — context_window 0/falsy clampeia para 20", async () => {
    const store = makeStore([]);
    const listSpy = store.listByChat as ReturnType<typeof vi.fn>;
    const agent = makeAgent({ context_window: 0 });
    await buildLlmMessages(store, agent, "", "c-1");
    expect(listSpy).toHaveBeenCalledWith("c-1", { limit: 20 });
  });

  it("EX-08 — ordem das mensagens é preservada (user, assistant, user)", async () => {
    const t = (offset: number) => new Date(1_700_000_000_000 + offset * 1000).toISOString();
    const msgs: Message[] = [
      makeMsg("user", "first", "ok", t(0)),
      makeMsg("assistant", "second", "ok", t(1)),
      makeMsg("user", "third", "ok", t(2)),
    ];
    const store = makeStore(msgs);
    const agent = makeAgent();
    const result = await buildLlmMessages(store, agent, "", "c-1");
    expect(result.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(result[0]?.content).toBe("first");
    expect(result[2]?.content).toBe("third");
  });
});
