# Architecture

> Status: Implemented for v1.0.0-rc.1.

This document describes how chatlab is wired up. For deeper contracts see [`docs/specs/`](./specs/).

## Big picture

```mermaid
graph TB
  subgraph "single chatlab process"
    Registry[("WorkspaceRegistry<br/>~/.chatlab/workspaces.json")]
    Core[Core]
    Storage[("Active StorageAdapter<br/>memory | sqlite | duckdb")]
    Runner[AgentRunner]
    Express[Express HTTP server]
    WS[WebSocket gateway]

    Registry -->|loads on init| Core
    Core -->|owns| Storage
    Core -->|emits core-event| Runner
    Core -->|emits core-event| WS
    Runner -->|appends assistant msg| Storage
    Express -->|reads/writes| Storage
    Express -->|emits chat.user-message-appended| Core
  end

  Browser[Browser /ui]
  Browser -->|HTTP /v1/...| Express
  Browser -->|WS /ws| WS

  Provider1[OpenAI / DeepSeek / Maritaca / Gemini / Ollama]
  Provider2[Anthropic Messages API]
  Runner -->|fetch| Provider1
  Runner -->|fetch| Provider2
```

## Process startup

1. **`startChatlab()`** reads CLI flags + env (`CHATLAB_*`), constructs `WorkspaceRegistry`.
2. Registry `init()` either loads an existing `workspaces.json` or auto-creates a `default` sqlite workspace.
3. `Core.start()` opens the active workspace's `StorageAdapter` and binds it to `core.storage`.
4. `AgentRunner` subscribes to `chat.user-message-appended` events.
5. Express app + WS gateway mount; HTTP server starts listening.

## Sequence: user sends a message → assistant replies

The most-walked path through chatlab. The HTTP request returns the persisted user message synchronously; the assistant reply lands asynchronously, broadcast over WebSocket and persisted to the same chat.

```mermaid
sequenceDiagram
    autonumber
    participant UI as Web UI (React)
    participant HTTP as Express router<br/>chats.ts
    participant Core as Core<br/>(EventEmitter + Storage)
    participant Runner as AgentRunner
    participant Provider as LLM Provider<br/>(openai-compat / anthropic)
    participant WS as WS Gateway

    UI->>HTTP: POST /v1/chats/{id}/messages<br/>{ content, attachments? }
    HTTP->>Core: storage.messages.append({role: "user"})
    Core-->>HTTP: persisted Message
    Core-->>WS: emit "chat.user-message-appended"
    HTTP-->>UI: 201 Created (user message)
    WS-->>UI: chat.user-message-appended event
    Core-->>Runner: chat.user-message-appended event
    Runner->>Core: storage.chats.get(chat_id)
    Runner->>Core: storage.agents.get(agent_id)
    Runner->>Core: storage.messages.listByChat(chat_id) (history)
    Runner->>Provider: chat completion HTTP call
    Provider-->>Runner: assistant text
    Runner->>Core: storage.messages.append({role: "assistant"})
    Core-->>WS: emit "chat.assistant-replied"
    WS-->>UI: chat.assistant-replied event
    UI->>UI: append bubble to chat view
```

Failure paths: a provider 5xx or timeout produces a `chat.assistant-replied` with `status: "failed"` (visible in the bubble) and an `agent.failed` event for the DevDrawer. The runner's `inflight` counter is incremented on entry and decremented on completion regardless of outcome — used by `activateWorkspace` to drain before swapping the adapter.

## Workspace activation (hot-swap)

`POST /v1/workspaces/{id}/activate` triggers:

1. Wait up to 2 s for the runner's `inflight` counter to drain. If not, return `409 ZZ_WORKSPACE_BUSY`.
2. `await currentStorage.close()`.
3. Build a new adapter from the target workspace; `await new.init()`.
4. Atomically rewrite the registry's `active_id`.
5. Emit `workspace.activated`. Connected UIs re-fetch chats / agents.

## Routers

Every HTTP router takes a `Core` reference and uses `core.storage.<namespace>` so it always reads from the currently-active workspace's adapter:

- `workspaces.ts` — registry CRUD + activation
- `chats.ts` — chat CRUD + message append
- `agents.ts` — agent CRUD + probe
- `feedback.ts` — per-message feedback + per-chat annotation + JSONL export
- `media.ts` — media upload + download + delete
- `healthz.ts` — `/healthz`, `/readyz` (unauth)

## Performance characteristics

A skeleton benchmark lives at [`test/perf/storage-bench.test.ts`](https://github.com/jvrmaia/chatlab/blob/main/test/perf/storage-bench.test.ts), default-skipped. Run on demand:

```bash
CHATLAB_TEST_PERF=1 npm test -- test/perf/storage-bench.test.ts
```

It inserts 10 000 messages and reads them back per adapter. The first published numbers will land here when v1.1 closes — until then, the table is intentionally empty so it doesn't drift silently.

| Adapter | Insert total | Insert/row | Read total | Read/row |
| --- | ---: | ---: | ---: | ---: |
| memory | _tbd_ | _tbd_ | _tbd_ | _tbd_ |
| sqlite | _tbd_ | _tbd_ | _tbd_ | _tbd_ |
| duckdb | _tbd_ | _tbd_ | _tbd_ | _tbd_ |

## SLIs (perf targets)

These targets are aspirational for the in-process loop, not service-level guarantees.

| SLI | Target | Note |
| --- | --- | --- |
| `POST /v1/chats/{id}/messages` p99 latency | < 50 ms | persists user message; assistant reply is async |
| Assistant reply round-trip (mock provider) | < 200 ms | runner overhead — excludes provider HTTP time |
| WS event delivery from emit to client | < 50 ms | local network |
| Workspace activation (idle adapter) | < 500 ms | sqlite open + table creation |
| Concurrent chats per process | tested up to 200 | bounded by storage adapter |

## Storage adapters

```mermaid
graph LR
  Adapter[StorageAdapter interface]
  Memory[MemoryAdapter]
  SQLite["SqliteAdapter<br/>better-sqlite3"]
  DuckDB["DuckDbAdapter<br/>@duckdb/node-api"]

  Adapter --- Memory
  Adapter --- SQLite
  Adapter --- DuckDB

  Memory -->|"in-process Map<>"| Mem[(RAM)]
  SQLite -->|file-backed| SQLfile[("data/<uuid>.db")]
  DuckDB -->|file-backed| Duckfile[("data/<uuid>.duckdb")]
```

The interface is identical across all three; the test battery in `test/storage/_battery.ts` runs once per adapter to ensure parity. DuckDB skips the media-binary test due to an upstream `@duckdb/node-api` Buffer-binding limitation.

## Component boundaries

- **`src/types/`** — pure TypeScript types. No runtime code (excluded from coverage).
- **`src/lib/`** — leaf utilities (id generation, time, etc.).
- **`src/storage/`** — persistence interface + 3 implementations.
- **`src/workspaces/`** — registry; persistent metadata above the adapters.
- **`src/core/`** — `Core` class — owns active state, dispatches events.
- **`src/agents/`** — provider HTTP adapters + factory + runner.
- **`src/http/`** — Express routers + middleware.
- **`src/ws/`** — WebSocket gateway, broadcasts core events.
- **`src/ui/`** — React + Tailwind + Vite app served at `/ui`.

## Lifecycles

- **Process**: started by `startChatlab()`, shutdown by `running.stop()` (which closes WS, HTTP, runner, and storage in order).
- **Workspace adapter**: created on activation, closed on the next activation or on process stop.
- **WS connection**: opens on browser load, reconnects with exponential backoff (0.5s → 30s cap) on close.
- **Agent call**: bound to a `chat.user-message-appended` event, runs with a 60 s timeout, increments/decrements the runner's `inflight` counter.

## What's not in this diagram

- **Streaming**: deferred to v1.1.
- **Tool calling**: deferred.
