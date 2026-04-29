# Data handling, LGPD/GDPR posture, and DPA template

> **Disclaimer:** this document is **operational guidance**, not legal advice. It describes how chatlab handles data so that adopters can map it onto their own LGPD/GDPR obligations. Each adopter is responsible for assessing their own compliance position with qualified legal counsel.

## Where data lives

| Category | Stored where | Default retention | Configurable via |
| --- | --- | --- | --- |
| Workspace registry | `$CHATLAB_HOME/workspaces.json` (default `~/.chatlab/workspaces.json`) | Until manual `DELETE /v1/workspaces/{id}?confirm=true` | `CHATLAB_HOME` for the registry path |
| Chats, messages, agents, feedback, annotations | Per-workspace `StorageAdapter` (memory / sqlite / duckdb per [ADR 0006](../specs/adr/0006-persistence-engines.md)). For sqlite/duckdb, on disk at `$CHATLAB_HOME/data/<workspace-uuid>.db` (or `.duckdb`) | Workspace lifetime | `CHATLAB_HOME` |
| Media binaries | Inside the per-workspace adapter file (sqlite BLOB / duckdb BLOB), or in-memory for `memory` workspaces | Workspace lifetime | `CHATLAB_HOME` |
| Feedback ratings + comments + annotations | Per-workspace `StorageAdapter` | **90 days** policy via `CHATLAB_FEEDBACK_RETENTION_DAYS`; `Core.startRetentionSweep` installs a daily timer (24 h) that deletes rows older than the cutoff from feedback + annotations, logged structurally per workspace. Set to `0` to disable retention. |
| Agent provider API keys | Per-workspace `StorageAdapter`, encrypted at rest with AES-256-GCM | Workspace lifetime | Master key in `$CHATLAB_HOME/master.key` (mode 0600) or `CHATLAB_MASTER_KEY` env. Lose the key, lose the cleartext. |

**Nothing leaves the host except provider calls.** chatlab does not phone home, does not call analytics services, and does not transmit data to any third-party service except the LLM provider whose API key the operator configured on an Agent profile (e.g. OpenAI, Anthropic, Ollama). Provider calls happen only when the operator types a message in a chat or invokes `/v1/agents/{id}/probe`.

## Roles under LGPD / GDPR

chatlab is **infrastructure software**. The team running it is the **controller** ("controlador" / "controller") of any personal data they put into it; chatlab's authors are not data processors because we never receive or process the operator's data. The LLM providers configured by the operator (via Agent profiles) ARE sub-processors of the operator and must be listed under the operator's own RoPA.

If your organization deploys chatlab and types real customer messages into it, **you are the controller** and you are responsible for:

- A lawful basis for the processing (consent, contract, legitimate interest…).
- Recording the processing in your data inventory ("RIPD" in LGPD terms).
- Honoring data-subject rights (access, deletion, rectification).
- Notifying ANPD / your national supervisory authority of any leak per LGPD Art. 48.
- Recording the chosen LLM provider(s) as sub-processors.

chatlab helps you discharge those responsibilities by:

- Keeping data on the operator's host except for the explicit provider call.
- Supporting bounded retention via `CHATLAB_FEEDBACK_RETENTION_DAYS` (sweep wired in v1.1).
- Offering full deletion of a workspace's data via `DELETE /v1/workspaces/{id}?confirm=true`.
- Keeping data inspectable: every chat, message, media file, and rating is readable from the operator's filesystem (the per-workspace database file).

## What chatlab deliberately does **not** do

- **Auto-redact PII.** Comments, annotations, and message contents are stored verbatim. If your test scenario contains real customer data, CPF/CNPJ, financial details, or health information, **you** are responsible for redacting before exporting the corpus.
- **Encrypt full message content at rest.** SQLite/DuckDB files store messages, feedback, and annotations unencrypted. Provider API keys are the only field encrypted at rest (AES-256-GCM, see [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#at-rest-encryption)). For full-row encryption, rely on full-disk encryption (FileVault, LUKS, BitLocker) on the host. Browser storage is unencrypted too. Per-workspace row-level encryption is on the v1.1+ roadmap.
- **Audit individual user behavior.** Feedback rows have a `rated_at` timestamp but no per-rater identity tracking.

If you need any of these, build them around chatlab — the storage adapter interface is open enough to wrap.

## Recommended practices for commercial adopters

1. **Synthetic conversations first.** Don't pipe real customer messages into chatlab. Use scripted scenarios. The HTTP API is the same whether the message is "Olá, gostaria do status do pedido 12345" (synthetic) or a real one.
2. **Retention low, sweep frequent.** Default is 90 days; for production-shaped development environments, drop to 30: `CHATLAB_FEEDBACK_RETENTION_DAYS=30`. The 24 h sweep is automatic — set the env var, restart, done. Use `Core.runRetentionSweep` from a script if you need a one-shot manual pass.
3. **Disk encryption.** FileVault / LUKS / BitLocker on the developer machine. Same goes for shared CI runners.
4. **Don't expose to the network.** chatlab's [bind-safety check](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#bind-safety) refuses non-localhost binds without an explicit token. Even with a token, treat any non-localhost deployment as production-shaped and apply your usual TLS / WAF / rate-limit chain.
5. **Export hygiene.** Before sharing a `feedback/export` JSONL outside the team, run a redaction pass on `comment`, `annotation`, and `agent_message.content`. The export is plain JSONL (`schema_version: 1`) — a simple `jq` pipeline can scrub patterns.

> **First-run notice.** chatlab surfaces the cleartext-to-provider warning in two places to keep human users (the Camila persona) on-side: the CLI boot banner emits a `[!] cloud provider configured — conversations leave your machine` line whenever the active workspace has at least one non-Ollama agent, and the Web UI ships a dismissable `PrivacyBanner` at the top of the shell with the same warning. Both surfaces are documented; the banner stays visible per-session until the user dismisses it explicitly.
6. **Document the processing.** If you adopt chatlab commercially, add it to your "Registro de Atividades de Tratamento" (LGPD) / Records of Processing Activities (GDPR) with: purpose (chat-agent development), data categories (whatever you actually feed it), retention (your chosen `CHATLAB_FEEDBACK_RETENTION_DAYS`), the LLM provider(s) you configured as sub-processors, and the lawful basis (typically *legítimo interesse* for product development).

## Data Processing Agreement (DPA) template

> **This is a template skeleton, not an executable agreement. Have legal counsel adapt and execute.**

```
DATA PROCESSING ADDENDUM — chatlab
Between [Operator Legal Name] (the "Controller") and [Adopter Legal Name] (the
"Sub-controller").

1. SCOPE
   This addendum governs the use of chatlab (open-source, MIT-licensed,
   https://github.com/jvrmaia/chatlab) by the Sub-controller's development
   teams in the context of building chat agents.

2. NATURE & PURPOSE OF PROCESSING
   The Sub-controller deploys chatlab on its own infrastructure to develop
   and quality-assure chat agents. chatlab does not transmit data to the
   project authors or to any third party not explicitly configured by the
   Sub-controller (LLM provider API endpoints chosen via the Agent profile
   are the only third-party network destinations).

3. CATEGORIES OF DATA
   - Conversation content (text, attachments)
   - Quality signals (per-message ratings + comments, per-chat annotations)
   - LLM provider API keys (encrypted at rest with AES-256-GCM under a
     master key kept in CHATLAB_HOME/master.key, mode 0600, or in the
     CHATLAB_MASTER_KEY env var)

4. RETENTION
   The Sub-controller commits to setting CHATLAB_FEEDBACK_RETENTION_DAYS to
   no more than [N] days, and to deleting workspaces no longer needed via
   DELETE /v1/workspaces/{id}?confirm=true on environment teardown.

5. SECURITY MEASURES
   - All chatlab deployments run on hosts with full-disk encryption.
   - The bind-safety check (SECURITY.md) is left enabled.
   - CHATLAB_REQUIRE_TOKEN is set on every non-localhost deployment.

6. SUB-PROCESSORS
   chatlab's authors are NOT sub-processors — they never receive Controller
   data. LLM providers configured via Agent profiles (e.g. OpenAI, Anthropic)
   ARE sub-processors of the Sub-controller and must be listed under the
   Sub-controller's own RoPA.

7. INCIDENT NOTIFICATION
   The Sub-controller shall notify the Controller within 48 hours of detecting
   any data incident affecting Controller data stored in chatlab.

8. DELETION ON TERMINATION
   On termination of the development engagement, the Sub-controller shall:
   - Delete every workspace via DELETE /v1/workspaces/{id}?confirm=true.
   - Remove the entire $CHATLAB_HOME directory from disk.
   - Confirm deletion in writing.
```

## Questions

Open a discussion on the repository tagged `legal` or contact the maintainer at the address in [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md).
