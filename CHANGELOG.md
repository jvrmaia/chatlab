# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] — 2026-04-30

First stable public release. Capabilities `0001`–`0006` are now `Status: Implemented`. Two TRB reviews on the same date frame the gate (the rc and the GA snapshot); a UAT panel of six downstream-role evaluators backlogged 21 user stories for v1.1+. Capability `0007-eval-harness` drafted for v1.1.

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

[Unreleased]: https://github.com/jvrmaia/chatlab/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jvrmaia/chatlab/releases/tag/v1.0.0
[1.0.0-rc.1]: https://github.com/jvrmaia/chatlab/releases/tag/v1.0.0-rc.1
