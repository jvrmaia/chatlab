# Specifications

This directory is the source of truth for *what* `chatlab` does and *why*. It has four subfolders:

| Folder | Purpose |
| --- | --- |
| [`capabilities/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/capabilities) | One file per discrete capability. Spec **before** code. |
| [`api/`](./api/) | The HTTP + WebSocket contracts chatlab exposes. Source of truth: [`openapi.yaml`](./api/openapi.yaml). |
| [`adr/`](./adr/) | Architecture Decision Records — durable rationale for choices that shape the project. |
| [`tests/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/tests) | Test plan stubs — Vitest + Playwright capture per [ADR 0010](./adr/0010-test-strategy.md). The active tests live under `test/` in the repo root. |

## How to author a capability spec

1. Open an issue using the **Capability Proposal** template if you want feedback before writing.
2. Copy [`capabilities/_template.md`](https://github.com/jvrmaia/chatlab/blob/main/docs/specs/capabilities/_template.md) to a new file `capabilities/NNNN-kebab-name.md`. Pick the next free number.
3. Fill the template. Keep it tight: a capability spec is not a design doc — it answers "what should chatlab do, observable from the outside?".
4. Submit a PR. Specs require at least one maintainer approval to merge.

The [`new-capability-spec`](https://github.com/jvrmaia/chatlab/blob/main/.claude/skills/new-capability-spec/SKILL.md) Claude Code skill scaffolds steps 2-3 for you.

## How to author an ADR

1. Copy [`adr/_template.md`](https://github.com/jvrmaia/chatlab/blob/main/docs/specs/adr/_template.md) to a new file `adr/NNNN-kebab-name.md`. Pick the next free number.
2. State the **Context** (forces at play), the **Decision** (what you chose), and the **Consequences** (what becomes easier and harder).
3. Submit a PR.

ADRs are append-only. To revisit a decision, write a new ADR that supersedes the old one and update the old one's `Status:` to `Superseded by NNNN`.

The [`new-adr`](https://github.com/jvrmaia/chatlab/blob/main/.claude/skills/new-adr/SKILL.md) Claude Code skill scaffolds this.

## Spec lifecycle

Each spec has a `Status:` field with one of:

| Status | Meaning |
| --- | --- |
| `Draft` | Under discussion. Open Questions still unresolved. |
| `Accepted` | Approved by maintainers. Implementation may begin. |
| `Implemented` | Code shipped that satisfies the spec. The spec is the test bar. |
| `Superseded by NNNN` | Replaced by a newer spec. Kept for historical context. |

## Index

Capabilities (v1.0) — full list in [`capabilities/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/capabilities):

- `0001-workspaces` — UUID + nickname + per-workspace storage; activate/deactivate at runtime
- `0002-agents` — six LLM providers, masked keys, probe endpoint
- `0003-chats-and-messages` — chats with `agent_id` + `theme`; user/assistant messages
- `0004-feedback-and-export` — 👍/👎 ratings + per-chat annotations + JSONL export
- `0005-media` — multipart upload + download + delete
- `0006-web-ui` — browser-side companion (workspace picker + Chats / Admin tabs)

ADRs — full list in [`adr/`](./adr/). Highlights:

- `0001-record-architecture-decisions` — meta: we use ADRs
- `0002-language-and-runtime` — Node.js + TypeScript
- `0003-distribution-channels` — npm + Docker + source
- `0006-persistence-engines` — pluggable adapter (memory / sqlite / duckdb)
- `0010-test-strategy` — Vitest + Playwright capture; E2E tier deferred to a future ADR
- `0013-adopt-claude-design-system` — design tokens + primitives bridged into Tailwind
