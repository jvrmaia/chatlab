# chatlab

> A local development platform for chat agents — pick a provider, talk to it, segregate scenarios via workspaces, capture feedback for fine-tuning. Runs on your laptop, no cloud, no setup theatre.

`chatlab` is what you reach for when you're building a chat agent and want a tight inner loop: configure a provider once, open a chat with a chosen agent + theme, type messages, see replies, rate them, write notes, export a JSONL corpus when you're ready to fine-tune.

> Status: **v1.0.0** (released 2026-04-30) — capabilities `0001`–`0006` `Implemented` (workspaces, agents, chats-and-messages, feedback-and-export, media, web-ui); capability `0007-eval-harness` drafted for v1.1. 90 tests passing under the gate of 80% lines / 80% statements / 80% functions / 65% branches (`vitest.config.ts`).

![Chatlab Web UI showing the workspace picker, chat list, and chat view.](./docs/_assets/screenshots/01-empty-ui.png)

**New here?** Read the [User Guide](./docs/user-guide/README.md) for an end-to-end walkthrough with screenshots, or skip to the 5-minute [quickstart](./docs/quickstart.md) below.

---

## Documentation website

Browse the published docs (user guide, capabilities, ADRs, OpenAPI via Redoc) at **[https://jvrmaia.github.io/chatlab/](https://jvrmaia.github.io/chatlab/)** once GitHub Pages is enabled for this repository (**Settings → Pages → Build and deployment → GitHub Actions**).

Preview locally from the repo root:

```bash
npm install --prefix docs-site   # first time only
npm run docs:dev                  # http://localhost:3000/chatlab/
```

See [`docs-site/README.md`](./docs-site/README.md) for site-specific commands.

---

## Why

Chat-agent development needs a few things that are annoying to set up:

- A place to **try multiple LLM providers** side-by-side without re-coding integrations.
- A way to **keep scenarios segregated** — your "support-bot demo" workspace shouldn't bleed into your "experimental hot-take agent" workspace.
- A way to **iterate on prompts** that doesn't require shipping a new agent service every time.
- A way to **capture feedback** while testing — every 👍/👎 + comment + chat-level annotation feeds the corpus you'll use for fine-tuning.

Seven providers ship out of the box. Six are LLM clients (OpenAI, Anthropic, DeepSeek, Gemini, Maritaca, Ollama). The seventh is **`custom`** — you point it at the agent **you are building**. That is the headline use case: chatlab is the workbench you keep open while iterating on your agent's prompt and provider, with the same UI you'd use to compare it against `gpt-4o`. State persists across runs (sqlite or duckdb backends). You can run as many parallel workspaces as you want and switch between them from the UI.

## Why chatlab and not …

| Pick chatlab when… | Pick **LangSmith** when… | Pick **Promptfoo** when… | Pick **OpenAI Playground** when… |
| --- | --- | --- | --- |
| You're **building a chat agent** and want to test it in a workbench that can also speak to `gpt-4o`, `claude-sonnet-4-6`, or `llama3` for comparison. The `custom` provider points chatlab at your dev server (any OpenAI-compat endpoint); the other six clients ride alongside. Local-first, JSONL-export-ready, no SaaS account. | You're shipping a LangChain app to production and you need cloud-hosted observability + tracing across LLM calls, retrievers, and tools. chatlab does not trace internal chains — it's a workbench for the conversation surface, not for the LangChain runtime. | You only need a **regression-eval** loop (golden set → assertions → score). Promptfoo is great at that one job. chatlab v1.0 doesn't ship an eval harness ([0007 is on the v1.1 roadmap](./docs/specs/capabilities/0007-eval-harness.md)); use Promptfoo until it does. | You want to compare a single OpenAI prompt across `gpt-4o` and `o1` interactively. The Playground is fast and free for that. chatlab's wedge is multi-provider + multi-workspace + persistent corpus + your-own-agent — overkill if you live inside one provider. |

The wedge: **multi-provider, multi-workspace, fully local, JSONL-export-ready**. If those four don't all matter for your loop, one of the alternatives above is probably the better pick.

## Run it locally

**Prerequisites:** Node.js 22.

```bash
git clone https://github.com/jvrmaia/chatlab.git
cd chatlab
npm install
npm run build
npm start
```

You'll see:

```
chatlab listening on http://127.0.0.1:4480
  workspace: default (sqlite)
  data dir : /Users/you/.chatlab/data
  auth     : permissive (any non-empty bearer)
  retention: 90 days
  ui       : http://127.0.0.1:4480/ui
```

Open [http://127.0.0.1:4480/ui](http://127.0.0.1:4480/ui) in any modern browser. Configure an agent in **Admin → Agents**, then start a **+ New chat** with a theme. Type a message — within a couple of seconds the agent replies.

If you have a local Ollama running, you can do all of this fully offline (no API key required for the `ollama` provider).

## Run the tests

```bash
npm test
```

90 Vitest tests cover capabilities 0001–0006: workspace registry CRUD + activation, all 3 storage adapters (memory/sqlite/duckdb), agent provider adapters (OpenAI-compat + Anthropic), per-chat agent runner (including workspace-swap-during-inflight), at-rest API key encryption, retention sweep, every HTTP router, WS gateway broadcasts. Coverage thresholds: 80% lines/statements/functions, 65% branches.

## What it does

| Capability | Status | Reference |
| --- | --- | --- |
| Workspaces (UUID + nickname + per-workspace storage) | Implemented | [`0001`](./docs/specs/capabilities/0001-workspaces.md) |
| Agents (7 providers incl. `custom`, masked keys, encrypted at rest, probe endpoint) | Implemented | [`0002`](./docs/specs/capabilities/0002-agents.md) |
| Chats + messages (per-chat agent + theme) | Implemented | [`0003`](./docs/specs/capabilities/0003-chats-and-messages.md) |
| Feedback ratings + annotations + JSONL export | Implemented | [`0004`](./docs/specs/capabilities/0004-feedback-and-export.md) |
| Media (image / audio / video / document / sticker) | Implemented | [`0005`](./docs/specs/capabilities/0005-media.md) |
| Web UI (workspace picker, Chats / Admin tabs) | Implemented | [`0006`](./docs/specs/capabilities/0006-web-ui.md) |

The full HTTP contract — every endpoint, request shape, response shape, error code — is in [`docs/specs/api/openapi.yaml`](./docs/specs/api/openapi.yaml).

## Project layout

```
src/
  agents/              LLM provider adapters (openai-compat, anthropic) + factory + runner
  core/                Core class — process-global state owner with swappable storage
  http/                Express server + routers (workspaces, chats, agents, feedback, media)
  lib/                 id, time helpers
  storage/             StorageAdapter interface + memory / sqlite / duckdb implementations
  types/               domain, agent, feedback, media types
  ui/                  React + Tailwind + Vite browser UI
  workspaces/          WorkspaceRegistry — JSON-file persistent registry
  ws/                  WebSocket gateway
test/                  Vitest suites

docs/
  user-guide/          End-to-end narrative walkthrough with screenshots
  recipes.md           Curl recipes for every endpoint
  testing.md           Test guide
  ARCHITECTURE.md      Component diagram + perf targets
  ROADMAP.md           v1.x phased plan
  specs/
    capabilities/      6 active capability specs (v1.0)
    api/openapi.yaml   Source-of-truth HTTP contract
    adr/               ADRs

docs-site/             Docusaurus site (GitHub Pages) — reads ../docs
.claude/               Project-local Claude Code skills + subagents
.github/               Workflows (lint-docs, docs-deploy, release, scans)
```

## Contributing

Contributions welcome — see [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

[MIT](./LICENSE)
