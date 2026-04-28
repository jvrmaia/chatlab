# 0006 — Persistence engines

- **Status:** Accepted
- **Date:** 2026-04-30
- **Deciders:** @jvrmaia

## Context

chatlab must persist workspaces, agents, chats, messages, feedback, annotations, and media. Different developer audiences want very different things from the persistence layer:

- A developer iterating on agent logic wants **zero setup** — in-memory storage that just works and disappears at the end of the run.
- A developer running long demos wants **durable** storage that survives restarts.
- A developer doing data analysis on captured conversations wants **columnar query** capabilities.

No single storage engine wins on all three. Picking one engine and baking it in deeply would block adoption later. We also need to decide this **early** because storage shapes the domain model: row-oriented vs columnar are not trivially interchangeable downstream.

## Decision

chatlab defines a **`StorageAdapter` interface** (in `src/storage/adapter.ts`) as a stable contract, and ships **three first-class implementations** that the user picks **per workspace** at workspace creation time:

| Adapter | Backed by | Best for |
| --- | --- | --- |
| `memory` | In-process map | Zero-setup dev, ephemeral runs, tests. |
| `sqlite` | [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) (sync, embedded) | Durable single-file storage, familiar SQL, easy to inspect from outside the process. |
| `duckdb` | [`@duckdb/node-api`](https://duckdb.org/) | Columnar analytics over captured conversations — useful for evaluation pipelines. |

Each `Workspace` record carries its own `storage_type` (`memory | sqlite | duckdb`) and an adapter-derived `storage_path` (e.g. `$CHATLAB_HOME/data/<uuid>.db` for sqlite). Workspaces with different backends coexist in the same chatlab process; activating one swaps the active adapter at runtime.

### `StorageAdapter` namespaces

The interface exposes coarse-grained namespaces, **not** SQL. This keeps row- and columnar-oriented backends behind a uniform contract:

- `workspaces.*` — workspace-scoped metadata (when adapters need it; the canonical registry is the JSON file at `$CHATLAB_HOME/workspaces.json`).
- `agents.*` — agent CRUD scoped to the active workspace.
- `chats.*` / `messages.*` — chat creation, message append, range queries.
- `feedback.*` / `annotations.*` — ratings + chat notes.
- `media.*` — image / audio / video / document binary storage by ID.

Adapters MUST be safe under chatlab's expected concurrency (a small number of HTTP and WebSocket clients). They MUST be transactional at the level of a single capability operation (e.g. "append a user message" either persists fully or not at all).

### Adapter responsibilities & limits

- **`memory`**: ephemeral; restart loses everything. Used for tests and "kick the tires" sessions.
- **`sqlite`**: write-heavy workloads scale fine; the file is portable and inspectable with any SQLite tool.
- **`duckdb`**: optimized for read-heavy analytics; write throughput is fine for chatlab's scale but should not be assumed equivalent to SQLite. The DuckDB adapter intentionally narrows BLOB support — media uploads on a DuckDB workspace are a separate cross-cutting concern documented alongside the adapter and the storage battery test (`test/storage/duckdb.battery.test.ts`).

### Persistence directory

Adapters that touch disk (`sqlite`, `duckdb`) write under `$CHATLAB_HOME/data/`. Each workspace owns one file named `<workspace-uuid>.{db,duckdb}`. The directory layout is owned by the adapter; the user only configures the parent path via `$CHATLAB_HOME`.

## Consequences

- **Positive:** developers get to choose the trade-off that fits their workflow, per workspace, without restarting the process.
- **Positive:** the interface is the test bar — every adapter runs the same shared battery (`test/storage/_battery.ts`), so we catch divergence early.
- **Positive:** future adapters (Postgres, LMDB, …) can be added without changing the rest of the codebase.
- **Negative:** three adapters means three sets of dependencies, three code paths in CI, and three places a bug can live.
- **Negative:** the lowest-common-denominator interface forces us to forgo backend-specific tricks (e.g. SQLite's `JSON1` operators, DuckDB's window functions). This is the **explicit cost** of pluggability — we accept it.
- **Negative:** the adapter contract becomes a public surface; breaking it is a major-version event for chatlab.

## Alternatives considered

- **Single backend (SQLite)** — rejected. Wins on simplicity, loses on the analytics use case. Forces every consumer into the same shape regardless of fit.
- **Plug-in third-party storage via a generic "bring your own driver"** — rejected for v1. We support the three first-class adapters by default; anyone can fork and add an adapter, but we don't promise a public plug-in protocol yet.
- **Defer the choice and ship in-memory only for v1.0** — rejected. The interface design is the part we need to lock in early; deferring the disk-backed adapters would have meant rewriting domain code at the milestone where the first persistent workspace landed.
