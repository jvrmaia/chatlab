# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-05-13

### Added

- **Eval harness** (`0007`) — `chatlab eval --agent <id>` CLI subcommand. Reads a golden-set YAML (`<home>/eval/golden.yaml`), runs each prompt through the configured agent, writes a Markdown report, and diffs against a `--baseline`. Exits non-zero on any provider failure without writing a partial report. Implemented in `src/eval/` (loader, runner, reporter, types). CLI architecture per [ADR 0015](./docs/specs/adr/0015-cli-subcommand-architecture.md).
- **Token usage and response time** — assistant message bubbles now display `↑{prompt} ↓{completion} · {time}` in the footer when the provider returns usage data. `prompt_tokens`, `completion_tokens`, and `response_time_ms` fields added to the `Message` domain type, all three storage adapters (SQLite, DuckDB, Memory), the OpenAPI schema, and the UI `UiMessage` type. Both the SSE streaming path and the non-streaming `AgentRunner` path capture and persist the data. OpenAI-compat requests include `stream_options: {include_usage: true}`; Anthropic accumulates input tokens from `message_start` and output tokens from `message_delta` events.
- **SSE extraction** — `src/lib/sse.ts` exports `parseSseLines`; both provider adapters (`openai-compat`, `anthropic`) now share the same SSE parsing logic instead of duplicated `ReadableStreamDefaultReader` loops.
- **CLI subcommand guard** — `detectUnknownSubcommand` in `src/cli.ts` exits 1 with a clear message for unrecognised first-positional arguments. Per [ADR 0015](./docs/specs/adr/0015-cli-subcommand-architecture.md).
- **ADR 0015** — CLI subcommand architecture: flag-based parsing, no external parser dependency, explicit allowlist guard.
- **ADR 0016** — Centralized LLM message builder (`buildLlmMessages` in `src/agents/message-builder.ts`).
- **ADR 0017** — LLM integration build-vs-SDK analysis. Adopts `@anthropic-ai/sdk` deferred to v0.4.0 pending migration scope.

### Fixed

- **SSRF RFC-1918 gap** — SSRF blocklist now covers the full RFC-1918 and link-local ranges (169.254.x.x, fc00::/7 ULA). Closed the open finding from the post-security-sprint TRB review (per [ADR 0014](./docs/specs/adr/0014-ssrf-and-mime-mitigation.md)).
- **LocaleToggle ARIA** — `aria-pressed` → `aria-selected`, `role="group"` → `role="tablist"`, `role="tab"` added to language buttons. Aligns with the tab pattern used in `App.tsx` and the `.tab[aria-selected="true"]` CSS selector in the design system.
- **CI lychee** — `conventionalcommits.org` added to the Markdown link-checker exclusion list; GitHub Actions IPs are blocked by this host, causing false-positive CI failures.

### Tests

- 414 Vitest tests across 39 files (up from ~290 in v0.2.2). Branch coverage 94.82%; statement coverage 96.9%.

### Reviews

- TRB post-v0.2.2 review (`docs/reviews/2026-05-12-post-v0.2.2.md`) — full 14-persona snapshot. Maturity 8.1/10 (+0.2 from post-security-sprint). Primary finding: `temperature: 0` not enforced in eval runs. 18 action-register items.

## [0.2.2] — 2026-05-11

### Fixed

- **CI**: lychee link checker now excludes `github.com/…/compare/` URLs — compare links in `CHANGELOG.md` are always broken before the tag is pushed and should not block CI.

### Dependencies

- Dependabot: `i18next` 26.0.10 → 26.1.0, `yaml` 2.8.4 → 2.9.0, `tailwindcss` + `@tailwindcss/postcss` 4.2.4 → 4.3.0, `vite` 8.0.11 → 8.0.12.

## [0.2.1] — 2026-05-11

### Changed

- **License**: migrated from MIT to Elastic License 2.0 (EL2). Source-available; free to use, study, modify, and redistribute. Providing chatlab as a hosted or managed service to third parties requires a commercial agreement. See [`LICENSE`](./LICENSE) and [`README.md`](./README.md#license).

### Added

- **`.github/workflows/security-sweep.yml`** — weekly security sweep (Sundays 02:00 UTC) running five parallel jobs: CodeQL `security-extended`, OSV-Scanner, Gitleaks (full git history), `npm audit --audit-level=high`, and license compliance via `license-checker-rseidelsohn`. Complements the per-PR gates; does not replace them.
- **`npm run dev:all`** — concurrent server + Vite UI dev with labeled/colored output via `concurrently`.

### Fixed

- **DuckDB migration**: `init()` now applies `ALTER TABLE ADD COLUMN` guards for `temperature` and `agent_version` columns, matching `sqlite.ts`. Fixes 500 errors on pre-existing `.duckdb` databases created before those columns were introduced.
- **Vite dev HMR**: HMR separated to port 5174; `openWs()` in the React app connects directly to `:4480` in dev mode, bypassing the Vite proxy. Eliminates ECONNRESET / EPIPE noise during hot-reload.
- **Screenshot capture**: corrected Playwright ARIA role selectors — tab elements use `role="tab"`, not `role="button"`.
- **ESLint**: flat config now loads `typescript-eslint` + `eslint-plugin-react-hooks` correctly; `react-hooks/set-state-in-effect` disabled for established reset-on-prop-change patterns.
- **`docs-site` security**: patched HIGH vulnerabilities in `@babel/plugin-transform-modules-systemjs`, `fast-uri`, and `fast-xml-builder` (arbitrary code / path traversal / XML injection).

### Dependencies

- `google/osv-scanner-action` bumped to v2.3.8.
- Docker Hub action version comments corrected (login-action v4.1.0, build-push-action v7.1.0).
- Dependabot: `@types/node` and 5-package minor-and-patch group updated.

### Tests

- 121 Vitest tests across 22 files (up from 114). New: Anthropic adapter, CLI eval smoke, chats-router expanded coverage.

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

[Unreleased]: https://github.com/jvrmaia/chatlab/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/jvrmaia/chatlab/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/jvrmaia/chatlab/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/jvrmaia/chatlab/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jvrmaia/chatlab/releases/tag/v0.2.0
[0.1.0]: https://github.com/jvrmaia/chatlab/releases/tag/v0.1.0
