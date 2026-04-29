# 0007 — Eval harness

- **Status:** Draft (target v1.1)
- **Authors:** @jvrmaia
- **Related ADRs:** _none yet_
- **Depends on:** [`0002-agents`](./0002-agents.md), [`0003-chats-and-messages`](./0003-chats-and-messages.md)

## Summary

A regression-style eval loop. The developer authors a small **golden set** of prompts in YAML; chatlab runs each prompt through one or more agents, captures the response, and prints a Markdown diff against the previous baseline. The dev sees at a glance which prompts changed when they swapped a model or edited a system prompt.

This is *not* a full evaluation framework (no LLM-as-judge, no rubric scoring, no CI gating in v1.1) — it is a "did anything change?" loop that fits into the same workbench the dev already uses for chats.

## Motivation

[ADR 0010 §5](../adr/0010-test-strategy.md) deliberately defers a full eval harness. The TRB review of 2026-04-30 (item 11 of the action register) flagged the absence as the highest-leverage v1.1 ML deliverable: without it, every prompt change is "the dev reads the response by hand and squints". Promptfoo and Inspect AI cover this space well, but bringing them into chatlab requires either (a) a vendored runner or (b) a thin adapter layer that emits / consumes their format. v1.1 ships the local runner; future versions can export to those formats.

## User stories

- As a **chat-agent developer**, I want to author 10 representative prompts in a YAML file, run `chatlab eval --agent <id>`, and see a side-by-side comparison against the baseline so I can decide whether a prompt edit is an improvement or a regression.
- As a **chat-agent developer**, I want to compare the same golden set against two agents (`--agent A --agent B`) so I can pick between providers / models on data, not vibes.
- As an **ML engineer (Diego persona)**, I want the eval output committed to git as a snapshot, so the team's prompt history is auditable.

## Behavior

- chatlab MUST accept `chatlab eval --agent <id> [--baseline <path>] [--out <path>]` as a CLI subcommand.
- chatlab MUST read the golden set from `<CHATLAB_HOME>/eval/golden.yaml` (or `--input <path>` override). Schema:
  ```yaml
  prompts:
    - id: refund-flow
      prompt: "Quero meu dinheiro de volta."
      tags: [support, br-pt]
    - id: technical-q
      prompt: "Como faço backup do meu workspace?"
  ```
- chatlab MUST run each prompt through the configured agent, with the agent's `system_prompt` and any `temperature: 0` override (deterministic reproduction is the goal).
- chatlab MUST write a Markdown report to `<CHATLAB_HOME>/eval/<agent>/<timestamp>.md` containing per-prompt: the prompt, the response, the agent_version, and (if `--baseline` is provided) a unified-diff against the baseline response.
- chatlab MUST exit non-zero if any provider call fails (the run is incomplete; the dev shouldn't compare partial against a clean baseline).
- chatlab SHOULD emit a one-line summary (`5/10 changed, 0 failed`) on stdout for terminal-friendly use.
- chatlab MAY accept `--format json` to emit machine-readable output instead of Markdown.

## Out of scope

- LLM-as-judge or rubric scoring. The eval loop reports diffs; *deciding* if the diff is good/bad is the dev's job (or a future capability).
- CI gating ("merge blocks if any golden-set response changed"). The output is informational; opt-in CI integration is a follow-up capability.
- Multi-turn evals. v1.1 covers single-turn prompts; multi-turn dialogs need a richer fixture format.
- Cost tracking. Token / cost approximation is part of v1.1 capability `0004` evolution, not this one.

## Open questions

1. Should the baseline live in git (committed YAML/JSON) or in `<CHATLAB_HOME>/eval/` (per-developer)? Trade-off: git makes team-wide regressions visible at PR time but commits responses that may contain quotes, names, dates that are noisy to review. Tentative: per-developer by default, with a `chatlab eval export-baseline` to commit when the dev says it's stable.
2. Should the golden set be **per agent** or **global**? A global set works for "compare two agents on the same prompts"; per-agent works for "this agent's specialty needs its own prompts". Tentative: a single global file, with an optional `agents:` filter per prompt.
3. Should we ship a pre-baked starter golden set (e.g. 10 prompts in PT-BR + EN covering common shapes)? Lowers friction at first run; risk of dev never updating the seed and getting useless evals.

## Verification

- [ ] Author a 3-prompt YAML, run `chatlab eval --agent <ollama-llama3>`. Confirm a Markdown report under `~/.chatlab/eval/` containing 3 sections (prompt + response per id).
- [ ] Run again with `--baseline` pointing at the previous report. Confirm the diff section appears for any changed responses; identical responses are flagged as `unchanged`.
- [ ] Run with two `--agent` flags. Confirm a side-by-side column for each agent in the report.
- [ ] Hit a 5xx from the provider. Confirm the CLI exits non-zero and the partial report is *not* written (avoid corrupted baselines).
- [ ] Run with `--format json`. Confirm a parseable JSON document with the same per-prompt entries.

## Acceptance

- **Vitest test ID(s):** _to be defined when the implementation lands in v1.1_ (`test/eval/...`).
- **OpenAPI operation(s):** none — eval is a CLI subcommand, not an HTTP surface in v1.1. (A `POST /v1/eval/runs` endpoint may follow if remote eval becomes a use case.)
- **User Guide section:** _to be added under `docs/user-guide/` once v1.1 ships._
