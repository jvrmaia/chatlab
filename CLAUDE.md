# CLAUDE.md

Guidance for Claude Code (and other AI coding assistants) working in this repository.

## What this project is

`chatlab` is an open-source local development platform for chat agents. It lets you configure six LLM clients (OpenAI, Anthropic, DeepSeek, Gemini, Maritaca, Ollama) plus a **`custom`** provider that points at the agent **the developer is building** (any OpenAI-compat endpoint), open chats with chosen agents and themes, exchange messages, rate replies, and export a JSONL feedback corpus. Six capabilities `Implemented` in v1.0 (`0007-eval-harness` drafted for v1.1); the project's current cut is **v1.1.0** (released 2026-05-01) — adds bilingual en-US / pt-BR for the Web UI and the public-facing docs subset.

> **Working directory.** The local clone path is `/Users/jvrmaia/Workspace/jvrmaia/zapzap-emulator/` even though the GitHub repo is `chatlab`. Don't try to rename the working directory.

Read the [README](./README.md) and [`docs/ROADMAP.md`](./docs/ROADMAP.md) before non-trivial changes.

## Where things live

| Path | What goes here |
| --- | --- |
| `src/` | Application source — TypeScript, NodeNext modules, strict mode. |
| `src/agents/` | LLM provider adapters (`openai-compat`, `anthropic`) + factory + `AgentRunner`. |
| `src/core/core.ts` | Process-global state owner — holds active workspace + storage adapter, emits events. |
| `src/storage/` | `StorageAdapter` interface + memory / sqlite / duckdb implementations. |
| `src/workspaces/registry.ts` | JSON-file-backed workspace registry (atomic writes). |
| `src/http/` | Express server + routers (workspaces, chats, agents, feedback, media, health). |
| `src/ws/` | WebSocket gateway — broadcasts `core-event`s to connected UIs. |
| `src/ui/` | React + Tailwind + Vite browser UI (served at `/ui`). |
| `test/` | Vitest suites. 80% coverage on lines/statements/functions, 65% on branches. |
| `docs/specs/api/openapi.yaml` | **Source of truth** for the HTTP contract — OpenAPI 3.1. |
| `docs/specs/capabilities/` | 6 active capability specs (v1.0) + 1 draft (`0007-eval-harness`, target v1.1). |
| `docs/specs/adr/` | 13 ADRs (MADR-lite). |
| `docs/reviews/` | TRB review snapshots (read-only after publication). Latest: [`2026-04-30-v1.0.0-rc.1.md`](./docs/reviews/2026-04-30-v1.0.0-rc.1.md). |
| `docs/_design/` | Design system: `tokens.css`, `components.css`, `icons.js`, `Design System.html`. |
| `docs/user-guide/` | Narrative walkthrough with screenshots. |
| `docs/_capture/` | Playwright screenshot capture pipeline (`npm run docs:capture`). |
| `docs/_assets/screenshots/` | PNGs embedded in user guide + capability specs. |
| `.claude/` | Project-local Claude Code skills + subagents. |
| `.github/` | Issue/PR templates + Actions (`lint-docs`, `docs-deploy`, `release`, `codeql`, `secret-scan`, `dependency-scan`). |
| `docs-site/` | Docusaurus 3 site for GitHub Pages — reads `../docs`; see [ADR 0009](./docs/specs/adr/0009-github-pages-documentation-site.md). |

## Conventions

- **Bilingual en-US + pt-BR.** English is canonical for everything in the repo (specs, ADRs, CHANGELOG, SECURITY, reviews, HTTP/CLI/OpenAPI strings, code comments). Only the **Web UI** (`src/ui/`) and the **public-facing docs subset** (`README`, `quickstart`, `recipes`, `troubleshooting`, `project-overview`, `user-guide/`, `distribution/`) carry pt-BR translations. UI strings live in `src/ui/i18n/locales/{en-US,pt-BR}.json` (consumed via `react-i18next`). Doc translations live in `docs-site/i18n/pt-BR/docusaurus-plugin-content-docs/current/` (mirrors the `docs/` tree). When editing an EN doc that has a pt-BR mirror, update the pt-BR equivalent or flag it `<!-- needs-translation-update -->` in the header.
- **Conversation with the user can be Portuguese; committed text follows the rule above.**
- **Stack** (each row links to the ADR that locked it in):
  - Runtime: Node.js 22 + TypeScript — [ADR 0002](./docs/specs/adr/0002-language-and-runtime.md)
  - HTTP: Express — [ADR 0004](./docs/specs/adr/0004-http-framework.md)
  - Web UI: React + Tailwind + Vite — [ADR 0005](./docs/specs/adr/0005-web-ui-framework.md)
  - Storage: pluggable adapter — memory / SQLite / DuckDB — [ADR 0006](./docs/specs/adr/0006-persistence-engines.md)
  - UI design system: tokens + primitives in `docs/_design/`, bridged into Tailwind — [ADR 0013](./docs/specs/adr/0013-adopt-claude-design-system.md)
- **Env vars** use the `CHATLAB_*` prefix.
- **Specs and ADRs are numbered** `NNNN-kebab-name.md`. Use the `_template.md` in each folder.
- **Conventional Commits**: `feat:`, `docs:`, `fix:`, `chore:`, etc.

## When you are asked to add a capability

1. Open the matching capability spec under `docs/specs/capabilities/`. Scaffold a new one if needed.
2. Read the linked ADRs and existing capability specs that touch the same domain.
3. Update the spec **before** writing code. The spec is the source of truth.
4. Update `docs/ROADMAP.md` if the capability shifts a milestone.

## When you are asked to record a decision

Add an ADR. ADRs are append-only — to change a past decision, write a new ADR that supersedes the old one and update the old ADR's `Status:` field.

## Verification

Standard checks before reporting a task done:

- `npm run typecheck` — clean (server + UI).
- `npm test` — currently 90 tests + 2 skipped (`duckdb` media + opt-in `storage-bench`), coverage 80%/80%/80%/65%.
- `npm run build` — server + UI emit.
- `npx redocly lint docs/specs/api/openapi.yaml` — valid.
- `npm run docs:build` — Docusaurus production build (`docs-site/`).
- `npm run docs:capture` after UI changes — refreshes embedded screenshots.

## Tone for docs

- Direct, terse, technically precise.
- Explain **why** before **what**.
- Tables for comparisons, bullet lists for enumerations, prose for rationale.
- No emojis in committed Markdown.
- Diagrams are **Mermaid** in fenced ` ```mermaid ` blocks (per [ADR 0008](./docs/specs/adr/0008-mermaid-for-diagrams.md)).
- The "no emojis" rule has one carved-out exception: **emojis used as literal UI-affordance glyphs** (👍 / 👎 for feedback ratings, 📎 for the composer's attach button, 📝 for the chat-notes panel). These render the same character the user sees in the browser; replacing them with prose ("thumbs-up icon") makes the docs harder to follow. Decorative emojis remain forbidden.
