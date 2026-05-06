# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] — 2026-05-06

### Fixed

- **UI redirect loop on `/ui/`** — Express non-strict routing caused `app.get("/ui", ...)` to also match `GET /ui/`, so the redirect from `/ui` → `/ui/` looped forever. The redirect is removed; `/ui`, `/ui/`, and `/ui/index.html` are now handled by a single route that serves the injected HTML directly. Regression tests SRV-04/05/06 added.
- **WebSocket auth in strict mode** — `WsGateway.verifyClient` only checked the `Authorization` header, but browsers cannot set custom headers on WebSocket connections. The gateway now also accepts the token via `?token=` query parameter; `openWs()` in `api.ts` appends the token automatically. Regression test WS-06 added.
- **Stale chat ID on container restart** — if the chat stored in `localStorage` no longer exists (e.g., fresh container), the UI now clears the selection immediately instead of logging a 404 to the console.

## [1.2.1] — 2026-05-05

### Fixed

- **UI bearer token — route ordering** — `express.static` was intercepting `GET /ui/` and serving the raw `index.html` from disk, bypassing the server-side `window.__CHATLAB_TOKEN__` injection added in v1.2.0. Routes for `/ui/` and `/ui/index.html` are now registered before `express.static` (with `index: false`), so the injected token is served for all UI entry points.

### Docs

- **pt-BR troubleshooting anchor** — `## Probe do agente dá timeout ou 5xx` now carries the explicit Docusaurus id `{#agent-probe-times-out-or-5xxs}`, resolving a broken-anchor warning in the pt-BR cookbook (which falls back to the EN version and links to that anchor).

## [1.2.0] — 2026-05-05

### Security

- **WebSocket auth bypass fixed** — `WsGateway` now uses `verifyClient` with `timingSafeEqual` to enforce `CHATLAB_REQUIRE_TOKEN` on WebSocket upgrade handshakes. Previously, the token check ran only in Express middleware, which is bypassed by the HTTP `Upgrade` path.
- **Stored XSS via MIME spoofing fixed** — `ALLOWED_MIME_BY_TYPE` now uses an explicit allowlist regex that excludes `text/html`, `text/javascript`, and other executable types; media downloads use `Content-Disposition: attachment`; `X-Content-Type-Options: nosniff` is set globally.
- **SSRF exfiltration via `agent base_url` fixed** — `validateBaseUrl` now blocks loopback, cloud IMDS addresses (`169.254.169.254`, `100.100.100.200`, `metadata.google.internal`, `metadata.goog`), RFC-1918 private ranges (`10.x`, `172.16-31.x`, `192.168.x`), and IPv6 ULA / link-local (`fc00::/7`, `fe80::/10`). The `/probe` endpoint no longer echoes upstream error bodies.

### Dependencies (Dependabot sprint — 2026-05-03)

Major-version bumps merged from 9 Dependabot branches:

- **Express 4 → 5** (`express ^5.2.1`, `@types/express ^5.0.6`) — updated named wildcards (`/ui/*path`), no regex routes.
- **multer 1 → 2** (`multer ^2.1.1`, `@types/multer ^2.1.0`).
- **better-sqlite3 11 → 12** (`better-sqlite3 ^12.9.0`).
- **Tailwind 3 → 4** (`tailwindcss ^4.2.4`, `@tailwindcss/postcss ^4.2.4`) — migrated to `@import "tailwindcss"` + `@source` + `@config` in CSS.
- **Vitest 2 → 4** (`vitest ^4.1.5`, `@vitest/coverage-v8 ^4.1.5`) — removed deprecated `pool`/`poolOptions`; Vitest now uses oxc for JSX transforms.
- **Vite 5 → 6** (`vite ^6.4.2`, `@vitejs/plugin-react ^5.2.0`) — addresses GHSA-67mh-4wv8-2f99.
- **TypeScript 5 → 6** (`typescript ^6.0.0`).
- **GitHub Actions**: `actions/checkout@v4 → v6`, `actions/deploy-pages@v4 → v5`, `docker/login-action@v3 → v4`, `docker/setup-qemu-action@v3 → v4`.
- **OSV scanner fixes**: Docusaurus bumped to `^3.10.1`; `serialize-javascript` and `uuid` forced via `docs-site/package.json` `overrides` (GHSA-5c6j-r48x-rmvq, GHSA-w5hq-g745-h8pq).

### Added

- **`temperature` field on Agent** — agents now persist a per-agent `temperature` (0–2, default 0.7 at call time). Pass `temperature` in `POST /v1/agents` or `PATCH /v1/agents/:id`.
- **`agent_version` snapshot on Message** — assistant messages now carry `agent_version: "<provider>/<model>"` set at creation time, so feedback export always reflects the model that produced the reply rather than the current agent configuration.
- **Inflight drain on shutdown** — `stop()` now polls `core.inflightCount() === 0` for up to 65 s before closing the HTTP server, preventing half-written messages when a long LLM call is in flight at SIGTERM.
- **SHA-pinned Docker actions in `release.yml`** — `docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/login-action`, and `docker/build-push-action` now reference immutable commit SHAs.

### Fixed

- **UI bearer token in strict auth mode** — `src/http/server.ts` now injects `window.__CHATLAB_TOKEN__` into the served `index.html` at startup; `src/ui/api.ts` reads it instead of the previous hardcoded `"ui-dev-token"`. The UI now works correctly when `CHATLAB_REQUIRE_TOKEN` is set (Docker / strict mode) without any manual user action.

### Docs

- **Docker quickstart** — `docs/quickstart.md` (and pt-BR mirror) now has a full Docker path (step 1-D): token generation, `docker run`, `docker compose`, SQLite bind-mount, DuckDB workspace bootstrap, `CHATLAB_MASTER_KEY` persistence note.
- **User guide review** — fixed P1 (Docker row missing `CHATLAB_REQUIRE_TOKEN`), stale version tags ("v1.0" → "v1.1"), hardcoded `dev-token` in export examples, stale "not yet published" status for Docker Hub and docs site.
- **Prerequisites tables** — quickstart prerequisites split into npm-path and Docker-path tables; `jq` added for Docker path.

### Reviews

- **TRB post-security-sprint review (2026-05-03)** — full 14-persona snapshot of v1.1.0 after Dependabot major-bump sprint and three HIGH-severity security fixes. Maturity 7.9/10. Full register (21 items): [`docs/reviews/2026-05-03-post-security-sprint.md`](docs/reviews/2026-05-03-post-security-sprint.md).

## [1.1.0] — 2026-05-01

Bilingual release. The Web UI and the public-facing docs subset are now bilingual en-US / pt-BR; English remains canonical for everything else (specs, ADRs, CHANGELOG, SECURITY, reviews, HTTP/CLI/OpenAPI strings).

### UI

- **`react-i18next` + `i18next-browser-languagedetector`** wired in `src/ui/i18n/`. JSON resources for `en-US` + `pt-BR` (~150 strings), declaration-merge for type-safe keys, `useLocaleFormat()` hook so `MessageBubble`, `AnnotationsPanel`, and `DevDrawer` timestamps follow the active locale (rather than browser default). All 15 `.tsx` components migrated to `t()`.
- **`<LocaleToggle>`** in the header — `EN` / `PT` toggle, persisted to `localStorage["i18nextLng"]`, falls back to navigator language on first load. `convertDetectedLanguage` maps any `pt*` to `pt-BR` and everything else to `en-US`.
- **Native dialogs localized** — `window.confirm`, `window.prompt`, `window.alert` calls in `AgentsList`, `WorkspacesPanel`, and `App` now route through `t()`.
- **Server stays English.** HTTP error messages, OpenAPI descriptions, and the CLI banner remain English; the UI surfaces server `Error.message` raw. Localization of server-emitted strings is deferred (low ROI: errors are dev-facing and carry structured `error_subcode`).

### Docs site

- **Docusaurus i18n configured** (`docs-site/docusaurus.config.ts`) — `defaultLocale: "en-US"`, `locales: ["en-US", "pt-BR"]`, locale dropdown in the navbar.
- **12 public-facing docs translated** to pt-BR: `quickstart`, `recipes`, `troubleshooting`, `project-overview`, all 7 `user-guide/*` pages, all 3 `distribution/*` pages. Each pt-BR page carries a "Tradução automática (AI) — sugestões via PR" banner.
- **`README.pt-BR.md`** at repo root, with cross-link in `README.md`. Added to `package.json#files`.
- **Sidebar/navbar/footer** translated (`docs-site/i18n/pt-BR/code.json`, `docusaurus-theme-classic/{navbar,footer}.json`, `docusaurus-plugin-content-docs/current.json`).
- **`onBrokenLinks: "throw"` → `"warn"`.** Pt-BR is a partial translation; the un-translated docs (specs, ADRs, cookbook) still link to peers via relative `.md` paths that don't resolve cleanly inside the pt-BR locale build. Re-tighten in v1.2 once specs/ADRs are translated.

### Capture pipeline

- **`docs/_capture/screenshots.spec.ts`** pins `localStorage["i18nextLng"] = "en-US"` via `addInitScript` so the canonical screenshots stay stable regardless of capture host.

### Tests + tooling

- **`vitest.ui.config.ts`** new project config — `jsdom` environment, runs `src/ui/**/*.test.tsx`. `npm test` now runs server suite + UI suite sequentially (`npm run test:server` and `npm run test:ui` available individually).
- **`@testing-library/react`, `jsdom`** added as dev deps.
- **`src/ui/components/LocaleToggle.test.tsx`** — 3 tests covering render, default selection, persistence after toggle.
- **3 new prod deps**: `i18next`, `react-i18next`, `i18next-browser-languagedetector`.

### Conventions

- **`CLAUDE.md`** convention updated — English is canonical for the repo; pt-BR translations are scoped to the public-facing docs subset and the UI. When editing a translated EN doc, update the pt-BR mirror or flag it `<!-- needs-translation-update -->`.

### Known limitations (deferred)

- Mermaid diagram labels stay English-only (Mermaid has no built-in i18n).
- Server-emitted strings (HTTP error `message`, OpenAPI `description`/`summary`, CLI banner) remain English.
- Specs, ADRs, CHANGELOG, SECURITY, reviews remain English-only.
- pt-BR translations are AI-generated initial drafts pending native-speaker review.

## [1.0.0] — 2026-04-30

First stable public release. Capabilities `0001`–`0006` are now `Status: Implemented`. Two TRB reviews on the same date frame the gate (the rc and the GA snapshot); a UAT panel of six downstream-role evaluators backlogged 21 user stories for v1.1+. Capability `0007-eval-harness` drafted for v1.1.

> **npm package name:** the unscoped `chatlab` was already taken on the npm registry by an unrelated package, so chatlab publishes as **`@jvrmaia/chatlab`**. The CLI binary stays `chatlab` — after `npm install -g @jvrmaia/chatlab`, the user types `chatlab` regardless. Docker image (`jvrmaia/chatlab`) and GitHub repo (`jvrmaia/chatlab`) are unaffected.

### Providers

- **`custom` provider added** — point chatlab at the agent **you're building**. Uses chatlab's `openai-compat` adapter under the hood; defaults `base_url` to `http://localhost:8000/v1` and `model` to `my-agent`. The headline use case for the project, finally a first-class option in the UI dropdown. See [`docs/providers.md#custom`](docs/providers.md#custom-your-agent-under-development) and the cookbook recipe.

### UI

- **Markdown rendering in chat bubbles** (assistant + user). GFM enabled (tables, task lists, autolinks, strikethrough), raw HTML disabled, links open in new tab. Powered by `react-markdown` + `remark-gfm`.
- **Markdown preview toggle in chat notes (`AnnotationsPanel`)** — Edit / Preview tabs; switching to Preview auto-saves dirty drafts.

### Security + reliability (TRB review closeout)

- **Encrypt provider API keys at rest** (AES-256-GCM). New `src/lib/{crypto,master-key}.ts`; storage adapters encrypt-on-write / decrypt-on-read; legacy plaintext rows pass-through. Master key from `CHATLAB_MASTER_KEY` env or `$CHATLAB_HOME/master.key` (mode 0600). `test/storage/encryption.test.ts` covers the round-trip + legacy migration.
- **Automatic feedback retention sweep**. `Core.startRetentionSweep` installs a daily timer; `Core.runRetentionSweep` is exposed for tests. `test/core/retention.test.ts`.
- **Structured logger (pino)**. `src/lib/logger.ts` wires pino into `Core`; TTY → pretty, otherwise JSON. Level controlled by `CHATLAB_LOG_LEVEL`. CLI banner + bind-safety stay as plain CLI text by design.
- **Privacy banner**. CLI boot banner gains `[!] cloud provider configured` line when the active workspace has any non-Ollama agent. UI mounts a dismissable `<PrivacyBanner>` with the same warning. Documented in `docs/legal/data-handling.md`.
- **Workspace-swap-during-inflight regression test** (`test/agents/runner-swap.test.ts`).
- **ARIA fixes** in DevDrawer (`role="log"`, `aria-live`), AnnotationsPanel (`aria-controls`), ChatList (`role="list"` / `"listitem"` + `aria-current`).
- **Design-token contrast tightened to WCAG AA**. `--warn` (68% → 53% L), `--danger` (58% → 50% L), `--ink-3` (55% → 52% L) for light theme; dark-theme overrides added for `--warn` (78% L) and `--danger` (72% L). All six measured pairs (`--warn`/`--warn-bg`, `--danger`/`--danger-bg`, `--ink-3`/`--bg-sunken` in both themes) now pass AA body-text (4.5:1). Findings + math: [`docs/reviews/2026-04-30-axe-contrast-check.md`](docs/reviews/2026-04-30-axe-contrast-check.md).

### Tooling

- **`@redocly/cli@2.30.3` pinned** in `release.yml`, `ci.yml`, `lint-docs.yml`. Dependabot bumps it.

### Documentation

- **"Why chatlab and not …"** comparison table added to `README.md` and `docs/project-overview.md` (LangSmith / Promptfoo / OpenAI Playground).
- **Sequence diagram** of message-to-reply flow in `docs/ARCHITECTURE.md`.
- **Capability spec template** gains an Acceptance section (Vitest test IDs / OpenAPI ops / User Guide section); 6 active specs backfilled.
- **Capability `0007-eval-harness`** drafted (target v1.1).
- **`docs/distribution/compose.example.yml`** + `Caddyfile.example` for self-hosting with auto-TLS.
- **GitHub Pages site** — `docs-site/` (Docusaurus 3 + Mermaid + Redoc), `.github/workflows/docs-deploy.yml`, PR gate build in `lint-docs.yml`, [`docs/project-overview.md`](docs/project-overview.md). See [ADR 0009](docs/specs/adr/0009-github-pages-documentation-site.md).

### Tests + scaffolding

- **E2E Playwright skeleton** under `test/e2e/` (opt-in via `CHATLAB_TEST_E2E=1`).
- **Storage benchmarks scaffold** (`test/perf/storage-bench.test.ts`, opt-in via `CHATLAB_TEST_PERF=1`); placeholder table in `docs/ARCHITECTURE.md`.

### Reviews

- **TRB rc review (2026-04-30)** — first technical review board snapshot of `v1.0.0-rc.1`. Maturity 7.0/10. 14 recommendations; 5 GA blockers + 4 v1.0 soft items closed; item 7 (manual axe pass) Partial. Full register: [`docs/reviews/2026-04-30-v1.0.0-rc.1.md`](docs/reviews/2026-04-30-v1.0.0-rc.1.md).
- **TRB GA review (2026-04-30)** — follow-up snapshot before tagging `v1.0.0`. [`docs/reviews/2026-04-30-v1.0.0-ga.md`](docs/reviews/2026-04-30-v1.0.0-ga.md).
- **OKLCH contrast check (2026-04-30)** — partial item-7 evidence (color-pair ratios computed mathematically). [`docs/reviews/2026-04-30-axe-contrast-check.md`](docs/reviews/2026-04-30-axe-contrast-check.md).
- **UAT panel (2026-04-30)** — six downstream roles, 21 user stories backlogged. [`docs/reviews/2026-04-30-uat-panel.md`](docs/reviews/2026-04-30-uat-panel.md).

## [1.0.0-rc.1] — 2026-04-30

The first public release candidate of `chatlab`.

### Capabilities (six, all `Status: Draft`)

- **`0001-workspaces`** — UUID + nickname + per-workspace storage (`memory | sqlite | duckdb`). Registry persists at `$CHATLAB_HOME/workspaces.json` with atomic writes. Hot-swap via `POST /v1/workspaces/{id}/activate`.
- **`0002-agents`** — agent CRUD scoped to active workspace; six providers (`openai`, `anthropic`, `deepseek`, `gemini`, `maritaca`, `ollama`); masked API keys; `/probe` for one-shot connectivity test.
- **`0003-chats-and-messages`** — chat creation with `agent_id` + `theme`; messages with `role: user | assistant`; theme injected into agent's system prompt for context segregation.
- **`0004-feedback-and-export`** — 👍/👎 ratings + per-chat annotations + JSONL export (`schema_version: 1`, with `theme` + auto-populated `agent_version: <provider>:<model>`).
- **`0005-media`** — multipart upload + download + delete on `/v1/media/...`. Multimodal forwarding to LLMs deferred to v1.1.
- **`0006-web-ui`** — workspace picker in header, Chats / Admin tabs, light/dark theme + three densities, design system anchored in `docs/_design/` (per ADR 0013).

### Runtime architecture

- **`Core`** class — process-global state owner with a swappable `StorageAdapter`.
- **`WorkspaceRegistry`** — JSON-file-backed registry (atomic writes via temp file + rename).
- **HTTP routers**: `workspaces.ts`, `chats.ts`, `agents.ts`, `feedback.ts`, `media.ts`, `healthz.ts`. Auth via `Authorization: Bearer <token>` (permissive by default; strict when `CHATLAB_REQUIRE_TOKEN` is set).
- **WS gateway** broadcasts: `workspace.activated`, `chat.created`, `chat.deleted`, `chat.user-message-appended`, `chat.assistant-replied`, `agent.failed`.
- **AgentRunner** — listens for `chat.user-message-appended`, looks up `chat.agent_id`, builds messages with theme as system context, persists `assistant` reply.
- **Storage namespaces**: `chats`, `messages`, `agents`, `media`, `feedback`, `annotations`. Three adapter implementations (memory, sqlite, duckdb) share the same interface and are exercised by a parametrized test battery.

### Public library API

- `startChatlab()` boots registry + active workspace + adapter + http + ws.
- Exports: `Core`, `WorkspaceRegistry`, `Workspace`, `Chat`, `Message`, `Attachment`, `StorageType`, `MessageRole`, `MessageStatus`, `Agent`, `AgentCreate`, `AgentPatch`, `AgentProvider`, `Feedback`, `FeedbackRating`, `Annotation`, `FeedbackExportItem`.

### Web UI

- React + Tailwind + Vite SPA served at `/ui`.
- Top-level header with brand + workspace picker (dropdown) + Chats/Admin tabs + theme + density toggle.
- Chats tab: chat list sidebar + chat view (user/assistant bubbles + composer + collapsible chat-notes panel) + DevDrawer.
- Admin tab: Workspaces (list + create + activate + delete) and Agents (CRUD + probe) sub-tabs.
- Visual language driven by tokens + primitives in `docs/_design/`, bridged into Tailwind via CSS variables.

### Tests + coverage

- 82 Vitest tests across 15 files: storage battery (memory + sqlite + duckdb), workspace registry, agent providers, runner, all HTTP routers, WS gateway, auth.
- Coverage gate: 80% lines / 80% statements / 80% functions / 65% branches (`vitest.config.ts`).

### Documentation

- 6 capability specs (`0001-0006`).
- 13 ADRs (`0001-0013`).
- README, ARCHITECTURE, GLOSSARY, ROADMAP, quickstart, recipes, testing, distribution guides, six User Guide pages, OpenAPI YAML.
- Playwright capture pipeline (`docs/_capture/`) — 7 PNGs covering the active UI surface, regenerable via `npm run docs:capture`.

### Conventions

- Package + CLI binary: `chatlab`.
- Env vars: `CHATLAB_HOME`, `CHATLAB_PORT`, `CHATLAB_HOST`, `CHATLAB_REQUIRE_TOKEN`, `CHATLAB_LOG_LEVEL`, `CHATLAB_FEEDBACK_RETENTION_DAYS`, `CHATLAB_WORKSPACE_ID`.
- GitHub repo: `jvrmaia/chatlab`.

[Unreleased]: https://github.com/jvrmaia/chatlab/compare/v1.2.3...HEAD
[1.2.3]: https://github.com/jvrmaia/chatlab/releases/tag/v1.2.3
[1.2.1]: https://github.com/jvrmaia/chatlab/releases/tag/v1.2.1
[1.2.0]: https://github.com/jvrmaia/chatlab/releases/tag/v1.2.0
[1.1.0]: https://github.com/jvrmaia/chatlab/releases/tag/v1.1.0
[1.0.0]: https://github.com/jvrmaia/chatlab/releases/tag/v1.0.0
[1.0.0-rc.1]: https://github.com/jvrmaia/chatlab/releases/tag/v1.0.0-rc.1
