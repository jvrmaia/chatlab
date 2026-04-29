# Distribution: From source

> **Status:** Available today (v1.0.0-rc.1). This is the recommended path until npm + Docker artifacts are published.

This is the path for **contributors** and for users who want to patch chatlab before running it. For first-time users wanting a guided 5-minute walkthrough, see [`docs/quickstart.md`](../quickstart.md).

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| Node.js | **22 LTS** (or whatever is in [`.nvmrc`](https://github.com/jvrmaia/chatlab/blob/main/.nvmrc)) | `nvm` and `fnm` pick it up automatically when you `cd` into the project. |
| `npm` | bundled with Node | — |
| `git` | any recent | — |
| Native build toolchain | — | macOS: `xcode-select --install`. Linux: `apt-get install -y python3 build-essential`. Windows: WSL2 strongly recommended. Required because `better-sqlite3` builds a native binding. |

## Clone & install

```bash
git clone https://github.com/jvrmaia/chatlab.git
cd chatlab
npm install
```

The install pulls ~363 packages (~80 MB), builds two native modules. Should complete in 30-60s on a recent laptop.

## Build

```bash
npm run build
```

This runs:
- `tsc -p tsconfig.json` → emits `dist/server/`
- `vite build` → emits `dist/ui/` (the React + Tailwind browser bundle)

Build output goes to `dist/` and is gitignored.

## Run

```bash
npm start
```

chatlab listens on `http://127.0.0.1:4480` by default and serves the UI at `/ui`. Override via the env vars in [`npm.md`](./npm.md) (which apply identically to from-source).

`Ctrl+C` exits cleanly (handles `SIGINT` + `SIGTERM`).

## Development workflow

| Script | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript-only check, server + UI (no emit) |
| `npm run build` | Full build: server + UI |
| `npm run build:server` | Just `tsc` for the server |
| `npm run build:ui` | Just `vite build` for the UI |
| `npm start` | Run the compiled server |
| `npm run dev` | Server in watch mode via `tsx` (no build needed) |
| `npm run dev:ui` | Vite dev server for the UI on port 5173, with proxy to the server on 4480 |
| `npm test` | Run the Vitest suite (90 tests, ~2s) |
| `npm run test:watch` | Vitest in watch mode |

## Hot-reload UI development

In two terminals:

```bash
# Terminal 1: emulator backend on 4480
npm run dev

# Terminal 2: Vite dev server for UI on 5173 (proxies API + WS to 4480)
npm run dev:ui
```

Open http://localhost:5173 — UI changes hot-reload, server changes restart via `tsx watch`. The Vite proxy rewrites `/v1`, `/healthz`, `/readyz`, and `/ws` to the backend.

## Repository layout

```
src/                           Application source (Node + TypeScript)
├── index.ts                   Programmatic API (`startChatlab`)
├── cli.ts                     CLI entrypoint
├── config.ts                  env + CLI parsing + bind-safety
├── lib/                       id + clock helpers
├── types/                     domain + agent + feedback types
├── storage/                   StorageAdapter + memory + sqlite + duckdb
├── workspaces/                WorkspaceRegistry (JSON-file persistence)
├── core/                      Core class — process-global state owner
├── agents/                    LLM provider adapters + factory + AgentRunner
├── http/                      Express server + auth + error envelope + routers
├── ws/                        WebSocket gateway
└── ui/                        React + Tailwind + Vite SPA

test/                          Vitest suites
├── http/_harness.ts           Test harness — boots chatlab on random port
├── http/                      Per-router tests
├── storage/                   Storage adapter battery
├── agents/                    Provider + runner tests
├── workspaces/                Registry tests
└── ws/                        WebSocket tests

docs/                          Documentation source
dist/                          Build output (gitignored)
node_modules/                  Dependencies (gitignored)
```

## Contributing

See [`CONTRIBUTING.md`](https://github.com/jvrmaia/chatlab/blob/main/CONTRIBUTING.md) for branching, commit style, and review expectations. The most useful contributions today (per [ROADMAP.md](../ROADMAP.md)):

- Add real Playwright E2E test scenarios beyond the screenshot-capture spec — `docs/_capture/` already wires Playwright; v1.1 expands it into the deferred E2E tier per [ADR 0010](../specs/adr/0010-test-strategy.md).
- Pick up any v1.1 item from [`ROADMAP.md`](../ROADMAP.md) — multimodal forwarding, streaming responses, tool calling, workspace duplicate, etc.
