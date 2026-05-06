# 5. Feedback and export

The whole point of chatlab is making agent iteration fast. Iteration without feedback is just typing — you'd have no signal which replies worked and which didn't. v1.x gives you two affordances:

- **Per-message ratings** (👍 / 👎 + optional comment) on assistant bubbles.
- **Per-chat annotations** — a free-text Markdown note about the conversation as a whole.

Both are exportable as JSONL ready for an RLHF / DPO / SFT pipeline.

## Rating a reply

Every assistant bubble carries 👍 / 👎 buttons:

- Click 👍 to mark a good reply.
- Click 👎 to mark a bad one. Add an optional comment ≤ 280 chars.
- Click the same affordance twice to clear.
- Click the opposite to replace.

User messages have **no** rating affordances — they're inputs, not outputs.

## Per-chat annotation

Below the chat view there's a `📝 chat notes` strip. Click it to expand. The panel has two tabs:

- **Edit** — Markdown textarea ≤ 16 KB, auto-saves on blur.
- **Preview** — renders the same GFM that chat bubbles do (tables, fenced code, task lists, links). Switching to Preview while you have unsaved changes auto-saves first, so what you see is what's persisted.

Use it for context the rating can't carry: `"user kept rephrasing — agent ignored the order id"`, `"happy-path scenario"`, `"the agent should have asked for the CPF earlier"`. The annotation lands in the JSONL export alongside every rated message in this chat.

## Export

> Set `TOKEN=dev-token` (npm path — permissive auth) or `TOKEN="$CHATLAB_REQUIRE_TOKEN"` (Docker path) before running these examples.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:4480/v1/feedback/export > corpus.jsonl
```

Every line is one rated assistant message + the prompt that triggered it + the chat's theme + the annotation + an `agent_version: "<provider>:<model>"` field auto-populated from the chat's agent. `schema_version: 1`.

Filter by time, rating, or chat:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:4480/v1/feedback/export?rating=down&since=2026-04-01T00:00:00Z" > down.jsonl
```

## What's not in the export

- API keys (never).
- Cleared ratings (deleted, not retained as null).
- User messages that don't have an adjacent rated assistant reply.
- Token / cost data (out of scope for v1.0).

## What's next

[6. Going further](./06-going-further.md) — programmatic API, hidden corners, deferred features.
