# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] — 2026-05-06

### Added

- **SSE streaming** — `POST /v1/chats/{id}/messages` now supports `Accept: text/event-stream`. When the browser sends that header the server streams the assistant reply incrementally as `user_message → delta* → done` SSE events, filling the chat bubble in real-time. Non-streaming clients (JSON path + AgentRunner) are unchanged.
- **WS auth via `?token=` query param** — The WebSocket gateway (`/ws`) now accepts the bearer token from the `?token=<value>` query parameter as a fallback to the `Authorization: Bearer` header. Browsers cannot set custom headers on WebSocket handshakes; the UI already builds the URL with `?token=${TOKEN}`. New test WS-06 validates the browser path end-to-end.

### Fixed

- **Test isolation** — `CHATLAB_REQUIRE_TOKEN` is now explicitly pinned in every test harness start call, preventing ambient env vars from leaking into test servers and causing token-mismatch failures.

### Tests

- 114 Vitest tests across 21 files (up from 113). New: CH-H-06 (SSE streaming round-trip), WS-06 (browser token via `?token=`), WS-05 wrong-token assertion.

## [0.1.0] — 2026-05-06

Initial public release of chatlab — a local development platform for chat agents.

### Capabilities

- **Workspaces** (`0001`) — UUID + nickname + per-workspace storage (`memory | sqlite | duckdb`). Registry persists at `$CHATLAB_HOME/workspaces.json` with atomic writes. Hot-swap via `POST /v1/workspaces/{id}/activate`.
- **Agents** (`0002`) — agent CRUD scoped to active workspace; seven providers (`openai`, `anthropic`, `deepseek`, `gemini`, `maritaca`, `ollama`, `custom`); masked API keys; per-agent `temperature`; `agent_version` snapshot on messages; `/probe` for one-shot connectivity test.
- **Chats and Messages** (`0003`) — chat creation with `agent_id` + `theme`; messages with `role: user | assistant`; theme injected into agent's system prompt for context segregation.
- **Feedback and Export** (`0004`) — 👍/👎 ratings + per-chat annotations + JSONL export (`schema_version: 1`, with `theme` + `agent_version: <provider>:<model>`). Automatic daily retention sweep.
- **Media** (`0005`) — multipart upload + download + delete on `/v1/media/...`.
- **Web UI** (`0006`) — React + Tailwind + Vite SPA served at `/ui`. Workspace picker, Chats / Admin tabs, light/dark theme + three densities, Markdown rendering in bubbles, bilingual en-US / pt-BR (locale toggle, `react-i18next`).

### Runtime architecture

- **`Core`** — process-global state owner with a swappable `StorageAdapter`.
- **HTTP routers**: `workspaces`, `chats`, `agents`, `feedback`, `media`, `healthz`. Auth via `Authorization: Bearer <token>` (permissive by default; strict when `CHATLAB_REQUIRE_TOKEN` is set).
- **WS gateway** — broadcasts `workspace.activated`, `chat.created`, `chat.deleted`, `chat.user-message-appended`, `chat.assistant-replied`, `agent.failed`. Token accepted via `?token=` query parameter (browsers cannot set `Authorization` headers on WebSocket connections).
- **Inflight drain on shutdown** — `stop()` polls `core.inflightCount() === 0` for up to 65 s before closing, preventing half-written messages at SIGTERM.

### Security

- **Provider API keys encrypted at rest** (AES-256-GCM). Master key from `CHATLAB_MASTER_KEY` env or `$CHATLAB_HOME/master.key` (mode 0600).
- **SSRF mitigation** — `validateBaseUrl` blocks loopback, cloud IMDS addresses, RFC-1918 private ranges, and IPv6 ULA / link-local.
- **Stored XSS via MIME spoofing** — explicit allowlist excludes `text/html` / `text/javascript`; media downloads use `Content-Disposition: attachment`; `X-Content-Type-Options: nosniff` set globally.
- **WebSocket auth** — `verifyClient` enforces `CHATLAB_REQUIRE_TOKEN` on the HTTP `Upgrade` path (not just Express middleware). UI injects token from server-side `window.__CHATLAB_TOKEN__` injection.

### Docs site

- GitHub Pages site (`docs-site/`) powered by Docusaurus 3 + Mermaid + Redoc. OpenAPI reference at `/api/` with inline explorer embedded in the API contract page.
- Bilingual public docs (12 pages translated to pt-BR): `quickstart`, `recipes`, `troubleshooting`, `project-overview`, `user-guide/*`, `distribution/*`.

### Tests

- 113 Vitest tests across 21 files. Coverage gate: 80% lines / statements / functions, 65% branches.
- E2E Playwright skeleton under `test/e2e/` (opt-in via `CHATLAB_TEST_E2E=1`).

[Unreleased]: https://github.com/jvrmaia/chatlab/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/jvrmaia/chatlab/releases/tag/v0.2.0
[0.1.0]: https://github.com/jvrmaia/chatlab/releases/tag/v0.1.0
