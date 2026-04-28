# Glossary

Domain terms used across chatlab specs, code, and docs.

| Term | Definition |
| --- | --- |
| **Workspace** | A named, segregated environment with a UUID, a nickname, and a storage backend (`memory` / `sqlite` / `duckdb`). Holds chats, agents, messages, feedback, annotations, and media. Many can exist; only one is active at a time. See [`0001-workspaces`](./specs/capabilities/0001-workspaces.md). |
| **Active workspace** | The single workspace that the running chatlab process is currently bound to. All non-workspace-management endpoints (`/v1/chats`, `/v1/agents`, `/v1/messages/*/feedback`, etc.) operate on it. Switched via `POST /v1/workspaces/{id}/activate`. |
| **Registry** | The JSON file at `$CHATLAB_HOME/workspaces.json` that tracks every workspace + which one is active. Atomic-write protected (temp-file + rename). |
| **Agent** | A configured connection to an LLM provider — name + provider + model + optional API key + optional system prompt + context window. Workspace-scoped. See [`0002-agents`](./specs/capabilities/0002-agents.md). |
| **Provider** | One of six identifiers: `openai`, `anthropic`, `deepseek`, `gemini`, `maritaca`, `ollama`. Determines which HTTP adapter (`openai-compat` or `anthropic`) is used. |
| **Probe** | One-shot prompt sent to an agent to verify connectivity / API key — does not persist anything. `POST /v1/agents/{id}/probe`. |
| **Chat** | A single conversation between the developer (role `user`) and one chosen agent (role `assistant`), pinned to a free-text **theme**. Created with `agent_id` + `theme` and lives until explicitly deleted. |
| **Theme** | Free-text topic of a chat (e.g. `"Aprendendo Python"`). Injected as system context for the agent on every reply. |
| **Message** | One turn in a chat — `role: user | assistant`, `content`, optional `attachments[]`, simplified `status: ok | failed`, optional `error` when failed. |
| **Attachment** | Reference to a stored media record on a message. Carries `media_id`, `mime_type`, optional `filename`. |
| **Feedback** | A 👍 / 👎 rating on an assistant message, optionally with a comment ≤ 280 chars. User messages are not rateable. See [`0004-feedback-and-export`](./specs/capabilities/0004-feedback-and-export.md). |
| **Annotation** | A free-text Markdown note (≤ 16 KB) scoped to a chat. Last-write-wins. |
| **Export** | JSONL stream of rated assistant messages with their surrounding context. `schema_version: 1` (first published schema). |
| **Media record** | A binary stored under the `media` namespace — image, audio, video, document, or sticker. Up to 16 MB by default. |
| **Core** | The process-global state owner. Holds the active workspace + its storage adapter, emits events the WS gateway re-broadcasts to UI clients. |
| **AgentRunner** | The component that listens for `chat.user-message-appended` events, calls the chat's agent, and persists the assistant reply. |
| **inflight count** | Number of agent calls in progress at any moment. Workspace activation waits up to 2 s for this to drain before swapping the storage adapter. |
| **CHATLAB_HOME** | Env var pointing at the registry + data directory. Default `~/.chatlab`. |

