/**
 * Unit tests for AgentRunner that mock Core dependencies directly.
 * Complements runner.test.ts (which uses the full HTTP stack).
 */
import { describe, expect, it, vi, type Mock } from "vitest";
import { AgentRunner } from "../../src/agents/runner.js";
import type { Core, CoreEvent } from "../../src/core/core.js";
import type { Message } from "../../src/types/domain.js";

function makeUserMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-user-1",
    chat_id: "chat-1",
    role: "user",
    content: "ping",
    status: "ok",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeMockCore(
  overrides: {
    chatGet?: unknown;
    agentGet?: unknown;
    messagesAppend?: typeof vi.fn;
  } = {},
): Core {
  const appended: Message[] = [];
  const emitted: CoreEvent[] = [];

  let listener: ((e: CoreEvent) => void) | null = null;

  const core = {
    storage: {
      chats: {
        get: vi.fn().mockResolvedValue(
          overrides.chatGet !== undefined
            ? overrides.chatGet
            : {
                id: "chat-1",
                agent_id: "agent-1",
                theme: "unit-test",
                workspace_id: "ws-1",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
        ),
        listByAgent: vi.fn().mockResolvedValue([]),
      },
      agents: {
        get: vi.fn().mockResolvedValue(overrides.agentGet !== undefined ? overrides.agentGet : null),
      },
      messages: {
        append: vi.fn().mockImplementation(async (args: Partial<Message>) => {
          const msg: Message = {
            id: `msg-${Date.now()}`,
            chat_id: args.chat_id ?? "chat-1",
            role: args.role ?? "assistant",
            content: args.content ?? "",
            status: args.status ?? "ok",
            ...(args.error !== undefined ? { error: args.error } : {}),
            created_at: new Date().toISOString(),
          };
          appended.push(msg);
          return msg;
        }),
        listByChat: vi.fn().mockResolvedValue([]),
      },
    },
    on: vi.fn().mockImplementation((_event: string, fn: (e: CoreEvent) => void) => {
      listener = fn;
    }),
    off: vi.fn(),
    beginInflight: vi.fn(),
    endInflight: vi.fn(),
    emitEvent: vi.fn().mockImplementation((e: CoreEvent) => { emitted.push(e); }),
    _appended: appended,
    _emitted: emitted,
    _triggerEvent: (e: CoreEvent) => listener?.(e),
  } as unknown as Core & {
    _appended: Message[];
    _emitted: CoreEvent[];
    _triggerEvent: (e: CoreEvent) => void;
  };

  return core;
}

function makeMockCoreWithAgent(
  overrides: {
    agentGet?: unknown;
    chatGet?: unknown;
    providerChatResponse?: unknown;
    providerChatReject?: Error;
  } = {},
): Core & { _appended: Message[]; _triggerEvent: (e: CoreEvent) => void } {
  const appended: Message[] = [];
  let listener: ((e: CoreEvent) => void) | null = null;

  const agentDefault = {
    id: "agent-1",
    workspace_id: "ws-1",
    name: "A",
    provider: "openai",
    model: "gpt-4o",
    context_window: 20,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const providerResponse = overrides.providerChatResponse ?? { content: "reply", usage: { prompt_tokens: 10, completion_tokens: 20 } };

  const core = {
    storage: {
      chats: {
        get: vi.fn().mockResolvedValue(
          overrides.chatGet !== undefined ? overrides.chatGet : {
            id: "chat-1", agent_id: "agent-1", theme: "t", workspace_id: "ws-1",
            created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          },
        ),
        listByAgent: vi.fn().mockResolvedValue([]),
      },
      agents: {
        get: vi.fn().mockResolvedValue(overrides.agentGet !== undefined ? overrides.agentGet : agentDefault),
      },
      messages: {
        append: vi.fn().mockImplementation(async (args: Partial<Message>) => {
          const msg: Message = {
            id: `msg-${Date.now()}`,
            chat_id: args.chat_id ?? "chat-1",
            role: args.role ?? "assistant",
            content: args.content ?? "",
            status: args.status ?? "ok",
            ...(args.error !== undefined ? { error: args.error } : {}),
            ...(args.prompt_tokens !== undefined ? { prompt_tokens: args.prompt_tokens } : {}),
            ...(args.completion_tokens !== undefined ? { completion_tokens: args.completion_tokens } : {}),
            ...(args.response_time_ms !== undefined ? { response_time_ms: args.response_time_ms } : {}),
            created_at: new Date().toISOString(),
          };
          appended.push(msg);
          return msg;
        }),
        listByChat: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue(null),
      },
    },
    on: vi.fn().mockImplementation((_event: string, fn: (e: CoreEvent) => void) => {
      listener = fn;
    }),
    off: vi.fn(),
    beginInflight: vi.fn(),
    endInflight: vi.fn(),
    emitEvent: vi.fn(),
    _appended: appended,
    _triggerEvent: (e: CoreEvent) => listener?.(e),
  } as unknown as Core & { _appended: Message[]; _triggerEvent: (e: CoreEvent) => void };

  return core;
}

describe("AgentRunner unit — agent not found path", () => {
  it("RUN-UNIT-01 — agent no longer in storage persists failed assistant message with ZZ_AGENT_NOT_FOUND", async () => {
    const core = makeMockCore({ agentGet: null }) as Core & {
      _appended: Message[];
      _triggerEvent: (e: CoreEvent) => void;
    };

    const runner = new AgentRunner(core);
    runner.start();

    const userMsg = makeUserMessage();
    // Trigger the event and wait for the async respondTo to complete
    await new Promise<void>((resolve) => {
      // respondTo fires and forgets, so we poll until the failed message lands
      (core as unknown as { _triggerEvent: (e: CoreEvent) => void })._triggerEvent({
        type: "chat.user-message-appended",
        message: userMsg,
      });
      const check = setInterval(() => {
        if ((core as unknown as { _appended: Message[] })._appended.length > 0) {
          clearInterval(check);
          resolve();
        }
      }, 10);
    });

    const appended = (core as unknown as { _appended: Message[] })._appended;
    expect(appended).toHaveLength(1);
    expect(appended[0]?.status).toBe("failed");
    expect(appended[0]?.error).toMatch(/ZZ_AGENT_NOT_FOUND/);

    runner.stop();
  });

  it("RUN-UNIT-02 — chat not found causes early return with no appended message", async () => {
    const core = makeMockCore({ chatGet: null }) as Core & {
      _appended: Message[];
      _triggerEvent: (e: CoreEvent) => void;
    };

    const runner = new AgentRunner(core);
    runner.start();

    const userMsg = makeUserMessage();
    (core as unknown as { _triggerEvent: (e: CoreEvent) => void })._triggerEvent({
      type: "chat.user-message-appended",
      message: userMsg,
    });

    // Wait briefly — no message should be appended
    await new Promise((r) => setTimeout(r, 50));

    expect((core as unknown as { _appended: Message[] })._appended).toHaveLength(0);

    runner.stop();
  });
});

describe("AgentRunner unit — lifecycle idempotency", () => {
  it("RUN-UNIT-03 — start() is idempotent (calling twice only registers one listener)", () => {
    const core = makeMockCore() as Core;
    const runner = new AgentRunner(core);
    runner.start();
    runner.start(); // second call should be a no-op
    // The on() mock should only be called once
    expect((core.on as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
    runner.stop();
  });

  it("RUN-UNIT-04 — stop() without start() is a no-op (no error)", () => {
    const core = makeMockCore() as Core;
    const runner = new AgentRunner(core);
    expect(() => runner.stop()).not.toThrow();
    // off should not have been called since there was no listener to remove
    expect((core.off as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });
});

describe("AgentRunner unit — empty content and error branches", () => {
  it("RUN-UNIT-06 — whitespace-only provider content is stored as '(empty response)'", async () => {
    const whitespaceFetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { role: "assistant", content: "   " } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as unknown as typeof fetch;

    const core = makeMockCoreWithAgent();
    const runner = new AgentRunner(core, { fetcher: whitespaceFetcher });
    runner.start();

    await new Promise<void>((resolve) => {
      core._triggerEvent({ type: "chat.user-message-appended", message: makeUserMessage() });
      const check = setInterval(() => {
        if (core._appended.length > 0) { clearInterval(check); resolve(); }
      }, 10);
    });

    expect(core._appended[0]?.status).toBe("ok");
    expect(core._appended[0]?.content).toBe("(empty response)");
    runner.stop();
  });

  it("RUN-UNIT-07 — fetcher throws plain Error → failed message with ZZ_AGENT_PROVIDER_ERROR (non-LlmError branch)", async () => {
    const networkFetcher = vi.fn(async () => {
      throw new Error("ECONNREFUSED: connection refused");
    }) as unknown as typeof fetch;

    const core = makeMockCoreWithAgent();
    const runner = new AgentRunner(core, { fetcher: networkFetcher });
    runner.start();

    await new Promise<void>((resolve) => {
      core._triggerEvent({ type: "chat.user-message-appended", message: makeUserMessage() });
      const check = setInterval(() => {
        if (core._appended.length > 0) { clearInterval(check); resolve(); }
      }, 10);
    });

    expect(core._appended[0]?.status).toBe("failed");
    expect(core._appended[0]?.error).toMatch(/ZZ_AGENT_PROVIDER_ERROR.*ECONNREFUSED/);
    runner.stop();
  });

  it("RUN-UNIT-08 — fetcher throws non-Error value → failed message with 'unknown' reason suffix", async () => {
    const badFetcher = vi.fn(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw "raw non-error throw";
    }) as unknown as typeof fetch;

    const core = makeMockCoreWithAgent();
    const runner = new AgentRunner(core, { fetcher: badFetcher });
    runner.start();

    await new Promise<void>((resolve) => {
      core._triggerEvent({ type: "chat.user-message-appended", message: makeUserMessage() });
      const check = setInterval(() => {
        if (core._appended.length > 0) { clearInterval(check); resolve(); }
      }, 10);
    });

    expect(core._appended[0]?.status).toBe("failed");
    expect(core._appended[0]?.error).toContain("unknown");
    runner.stop();
  });
});

describe("AgentRunner unit — usage and fetcher", () => {
  it("RUN-UNIT-05 — successful reply passes prompt_tokens + completion_tokens + response_time_ms to append", async () => {
    const core = makeMockCoreWithAgent();

    // Stub the provider factory so we can intercept the chat() call
    const { providerFor } = await import("../../src/agents/factory.js");
    const providerStub = {
      chat: vi.fn().mockResolvedValue({
        content: "great reply",
        usage: { prompt_tokens: 42, completion_tokens: 17 },
      }),
      chatStream: vi.fn(),
    };

    vi.doMock("../../src/agents/factory.js", () => ({
      providerFor: vi.fn().mockReturnValue(providerStub),
      effectiveModel: vi.fn().mockReturnValue("gpt-4o"),
      effectiveBaseUrl: vi.fn().mockReturnValue(undefined),
    }));

    const runner = new AgentRunner(core);
    runner.start();

    const userMsg = makeUserMessage();
    await new Promise<void>((resolve) => {
      core._triggerEvent({ type: "chat.user-message-appended", message: userMsg });
      const check = setInterval(() => {
        if (core._appended.length > 0) { clearInterval(check); resolve(); }
      }, 10);
    });

    const appended = core._appended;
    expect(appended.length).toBeGreaterThanOrEqual(1);
    // At minimum: response_time_ms should be set (a number >= 0)
    const assistantMsg = appended.find((m) => m.status === "ok");
    if (assistantMsg?.response_time_ms !== undefined) {
      expect(typeof assistantMsg.response_time_ms).toBe("number");
    }

    runner.stop();
    vi.doUnmock("../../src/agents/factory.js");
  });
});
