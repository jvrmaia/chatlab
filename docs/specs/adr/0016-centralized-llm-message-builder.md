# 0016 — Centralized LLM message builder

- **Status:** Accepted
- **Date:** 2026-05-12
- **Deciders:** @jvrmaia

## Context

Before this ADR's decision was implemented, the logic that builds the message array sent to an LLM provider existed in two separate places:

1. **`src/agents/runner.ts`** — `private buildMessages(agent, chat, history)` — fetched the *entire* chat history via `listByChat(chatId)` (no limit), then sliced `history.slice(-limit)` client-side. Used by the `AgentRunner` (non-streaming path).
2. **`src/http/routers/chats.ts`** — local `buildMessages(agent, chat, messages)` — same logic, separate copy. Used by the SSE streaming path (`POST /v1/chats/{id}/messages` with `Accept: text/event-stream`).

The duplication created three concrete problems:

- **Divergence risk.** A fix to context-window filtering (e.g. filtering `status=failed` messages) had to be applied in two places. There was no mechanism to prevent the two copies from drifting apart.
- **Inefficient windowing.** Both copies fetched all messages from the database and sliced in application code. For a chat with 1 000 messages and `context_window=5`, that is 995 rows fetched and discarded on every request.
- **Coupling sprawl.** `runner.ts` received the full `LlmMessage[]` type from `provider.ts` just to use it in a private helper; `chats.ts` imported the same type for the same reason.

## Decision

We extract the message-building logic into a single pure function, `buildLlmMessages`, in a new module `src/agents/executor.ts`.

```typescript
export interface MessageStore {
  listByChat(chat_id: string, opts?: { limit?: number }): Promise<Message[]>;
}

export async function buildLlmMessages(
  store: MessageStore,
  agent: Agent,
  theme: string,
  chatId: string,
): Promise<LlmMessage[]>
```

### Design decisions within the implementation

**1. Pure function, not a class method**

`buildLlmMessages` has no mutable state between calls. A free function is simpler to test and import than a class instance. There is no `MessageBuilder` class.

**2. Interface segregation (`MessageStore`)**

The function declares a minimal `MessageStore` interface — just `listByChat` — rather than importing the full `StorageAdapter`. This means:

- Tests pass a plain `vi.fn()` mock without constructing a full adapter.
- The function compiles independently of any adapter implementation.
- Future callers (e.g. the eval runner) can satisfy `MessageStore` with any object that has `listByChat`.

**3. Database-level windowing**

The function passes `{ limit }` to `store.listByChat`, so the database does the windowing:

```typescript
const limit = Math.max(1, agent.context_window || 20);
const recent = await store.listByChat(chatId, { limit });
```

This replaces the pattern of fetching all rows and slicing in application code. For large histories, this reduces both network bytes (between the process and the DB file) and GC pressure.

**4. Failed-message filtering**

The function skips any message whose `status !== "ok"`. This guarantees that `status=failed` assistant messages (from earlier errors) are not sent to the provider — they are UI-only artifacts.

**5. System prompt construction**

The function assembles the `system` message from `agent.system_prompt` and the chat's `theme` in one place. The format is: `{system_prompt}\n\n{theme_line}` when both are present; whichever is non-empty when only one is.

### Callers

Both existing callers were updated to remove their local copies:

- `src/agents/runner.ts` — removed `private buildMessages()`, calls `buildLlmMessages(this.core.storage.messages, agent, chat.theme, chatId)`.
- `src/http/routers/chats.ts` (SSE path) — removed local `buildMessages()`, calls the same import.

## Consequences

- **Positive:** one implementation. A change to filtering logic (e.g. adding support for a new `status` value) is made in one file and takes effect in both paths simultaneously.
- **Positive:** database-level windowing replaces client-side slice. For a chat with N messages and `context_window=K`, the storage layer returns K rows instead of N.
- **Positive:** `MessageStore` interface makes `executor.ts` independently testable with a plain mock — no adapter setup required. Test suite covers it with 8 scenarios (`test/agents/executor.test.ts`).
- **Positive:** `buildLlmMessages` is the canonical location for any future message-assembly logic (tool messages, image parts, etc.) — there is one place to update.
- **Negative:** adding multimodal content (v0.4.0) will require modifying `buildLlmMessages` — the function is not extensible without modification for new content types. This is a known OCP trade-off: the function is a single chokepoint, which is also its strength. The alternative (separate builders per content type) would add premature complexity before the multimodal shape is settled.
- **Neutral:** `executor.ts` depends on `provider.ts` (for `LlmMessage`) and `types/domain.ts` (for `Message`). Both are pure type imports with no runtime cost.

## Alternatives considered

- **Keep two separate functions, add a shared util.** Rejected. Two call sites with different signatures is still two places to maintain. Extraction to a true shared function is cleaner.
- **Move logic into `StorageAdapter` as a named query.** Rejected. The adapter interface is the persistence contract; message-building is a business concern that belongs in the agent layer, not the storage layer.
- **Class `MessageBuilder` with injectable strategy for content types.** Rejected as premature abstraction. The multimodal shape is not yet settled; designing an extension point for it now would likely produce the wrong interface. A plain function is the simplest thing that works and is easy to replace.
- **Client-side slice with a higher limit fetch.** Rejected. Fetching 1 000 rows to use 5 is wasteful on both sides of the boundary. All three adapters already implement `{ limit }` on `listByChat`.
