# 0007 — Feedback corpus model and export contract

- **Status:** Accepted
- **Date:** 2026-04-30
- **Deciders:** @jvrmaia

## Context

Capability [`0004-feedback-and-export`](../capabilities/0004-feedback-and-export.md) introduces 👍/👎 ratings on agent replies, per-chat Markdown annotations, and a fine-tuning-ready export. Several semantic and structural choices in that capability are **load-bearing** — they shape the data ML pipelines downstream consume, and reversing them later means re-collecting or migrating data that may already have been captured.

We lock those choices in here so the data captured today stays interoperable with future runs. The capability spec describes the surface; this ADR records the durable rationale.

Forces at play:

- Minimize friction at capture time. Every extra click reduces the dataset.
- Produce ML-ready output without a per-team adapter step.
- Avoid silent overwrites of training signal.
- Keep flexibility for future schema evolution without breaking already-captured data.

## Decision

1. **Ratings apply only to `assistant` messages.** `user` messages are not rateable. Rationale: the corpus exists to label *agent outputs* — what we'd want the model to do more or less of. User messages are inputs; rating them confuses the dataset's intent.

2. **Three-state rating model:** `up` | `down` | *cleared*. There is no fourth state, no scale, no per-axis breakdown (helpfulness vs correctness vs tone). Pairwise preference is the format DPO and similar trainers expect, and a binary signal is the lowest-friction capture.

3. **Cleared ratings are deleted, not retained as `rating: null`.** Storage holds at most one row per `(message_id)`; clearing removes it. `GET` on a cleared rating returns `404`.

4. **Comment is optional, attached to the rating, ≤ 280 chars.** Cleared with the rating. Rationale for the cap: forcing a tweet-sized rationale keeps annotators honest and bounds export size.

5. **One Markdown annotation per chat; PUT semantics; last-write-wins.** Body ≤ 16 KB. The server records `updated_at` but does **not** retain edit history. Per-message annotations, structured tags, and multi-rater workflows are explicitly future capabilities, not v1.x.

6. **Export format is JSONL** (newline-delimited JSON), one `FeedbackExportItem` per line, streamed via `Content-Type: application/x-ndjson`. The server must not buffer the full corpus in memory. JSONL is the format ML pipelines consume (HuggingFace `datasets`, DPO trainers, eval harnesses) without conversion.

7. **Export references media by ID, not inlined.** A `FeedbackExportItem.agent_message.content` (and `prompt_message.content`) carrying media types includes a `media_id` field; consumers fetch the binary from `GET /v1/media/{id}/download` if they need it. Rationale: keeps exports text-only, capped in size, and lets pipelines decide whether they need the binary at all.

8. **`FeedbackExportItem` schema is part of the public contract.** Breaking changes (renames, removed fields, type changes) require a new ADR that supersedes this one. Adding optional fields is non-breaking. The schema definition lives in `openapi.yaml`; readers should derive against the YAML, not against handwritten copies.

9. **No event emission on feedback writes** in this ADR. Subscribe-able feedback events for live training are **deliberately deferred** — pinning event-bus semantics belongs to a separate ADR once the event-bus design itself stabilizes. Until then, training pipelines must poll `GET /v1/feedback/export`.

10. **Privacy and PII.** The server does not redact rating comments or annotations. They are free-text and may contain whatever the human typed. Consumers exporting the corpus are responsible for downstream redaction. The export endpoint's description documents this.

## Consequences

- **Positive:** ML pipelines can ingest exports directly. Pairwise preference data drops into DPO/IPO/KTO loops with no schema adapter.
- **Positive:** capture is one-click — the lowest viable friction. Data volume scales with usage instead of being gated on annotator effort.
- **Positive:** the schema is a public contract documented in OpenAPI; downstream tooling (`openapi-typescript`, codegen) gets typed clients for free.
- **Negative:** rating *history* is lost — only the latest rating survives. We accept this: the corpus is a snapshot of "current preference", not an audit log. If an audit log becomes a requirement, a future ADR can supersede.
- **Negative:** consumers who prefer Parquet, CSV, or Arrow IPC must convert. We accept this — `jq` / pandas / DuckDB convert JSONL trivially. (DuckDB is already a supported persistence backend per [ADR 0006](./0006-persistence-engines.md), so a "convert export to Parquet" recipe is one query.)
- **Negative:** PII responsibility shifts to consumers. Documented but not technically enforced.
- **Neutral:** decoupling export from a live event bus means a small polling delay between rating and pipeline ingestion. Acceptable for offline training; revisit with a follow-up ADR if real-time training emerges.

## Schema evolution log

The `FeedbackExportItem` schema has a required `schema_version` integer field. Bump it when a change is **breaking** (rename / remove / type change). Additive changes (new optional fields) keep the same version. Every change is recorded here, in chronological order.

| Version | Date | Change | Source |
| --- | --- | --- | --- |
| **1** | 2026-04-30 | Initial release of the export contract. Required fields: `schema_version`, `workspace_id`, `chat_id`, `theme`, `agent_message`, `prompt_message`, `rating`, `rated_at`, `annotation`. Optional: `comment`, `agent_version`, `failure_category`, `flagged_for_review`. | This ADR. |

When making a breaking change, write a new ADR that supersedes this one and add the row before merging the YAML change.

## Alternatives considered

- **Allow rating user messages** — rejected. Pollutes the corpus with signal about *which prompts the rater liked*, which isn't what fine-tuning needs.
- **5-point Likert / multi-axis ratings** — rejected for v1.x. Adds capture friction; binary preference is sufficient for DPO-style training and easy to upgrade later by adding optional fields without breaking the schema.
- **Retain rate history (audit log of every change)** — rejected. Storage cost grows unbounded for what is, in practice, a developer-facing tool. If audit becomes a requirement, supersede.
- **Per-message annotations** — rejected for v1.x. Chat-level notes capture the dominant pattern (cross-message context) without forcing annotators to choose between message-level and chat-level on every observation.
- **Structured annotation schema (categories, tags, severity)** — rejected for v1.x. We don't yet know what categories matter; free-text first, structure later if patterns emerge.
- **Parquet as the default export** — rejected. Parquet is the right format for analytics warehouses but a poor first impression for the "open this in a notebook today" use case. JSONL works in any tool; Parquet conversion is one query.
- **Inline media (base64) in exports** — rejected. Bloats exports by 33% for binary data that most fine-tuning runs don't ingest, and complicates streaming.
- **Push exports to S3 / GCS / a label-studio-shaped sink** — rejected for v1.x. chatlab stays self-contained; integrators write their own delivery loops on top of `GET /v1/feedback/export`.
- **Emit a webhook on feedback writes** — deferred. Pinning the event shape now risks committing to an event bus design we haven't decided.
