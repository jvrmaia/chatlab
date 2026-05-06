# 2. Workspaces and agents

The first time you boot chatlab, it creates a single workspace called `default` with a sqlite backend. That's enough to start chatting. But if you're going to run multiple parallel scenarios — "support-bot demo" vs "experimental hot-take" vs "DuckDB analytics" — you'll want more workspaces.

## The workspace picker

The `chatlab` brand at the top-left sits next to a dropdown that lists every workspace. Clicking switches the running adapter to that workspace's storage. The chat list, agent list, and everything else refresh from the new workspace's data — none of the previous workspace's state leaks through.

## Creating a workspace

Go to **Admin → Workspaces → + New workspace**. Pick a nickname and a storage backend:

| Backend | Use case |
| --- | --- |
| `memory` | Ephemeral. Process restart wipes it. Use for tests or quick demos. |
| `sqlite` | File-backed, fast for normal write loads. Default. |
| `duckdb` | File-backed, optimized for analytical queries. Reach for it if you'll be running aggregates over the feedback corpus. |

Click **Create**, then **activate** in the row. The workspace picker at the top updates.

To delete a workspace, type its nickname into the prompt — chatlab refuses to delete without a typed-confirm, since the data file goes with the row.

## Configuring an agent

An **agent** is a configured connection — to a hosted LLM **or** to the agent **you're building**. Agents are workspace-scoped: what you create in `experiment-1` doesn't show up in `default`. Seven providers ship out of the box:

| Provider | Default model | Needs API key | Notes |
| --- | --- | --- | --- |
| `openai` | `gpt-4o` | yes | |
| `anthropic` | `claude-sonnet-4-6` | yes | |
| `deepseek` | `deepseek-chat` | yes | |
| `gemini` | `gemini-2.5-flash` | yes | |
| `maritaca` | `sabia-3` | yes | |
| `ollama` | `llama3` | no | Local — runs on `localhost:11434`. |
| `custom` | `my-agent` | optional | **Your agent under development.** Any OpenAI-compat endpoint. See [`docs/providers.md#custom-your-agent-under-development`](../providers.md). |

Go to **Admin → Agents → + New agent**. Fill in name + provider + (model — auto-filled with the provider default) + API key + optional system prompt + optional context window (default 20).

The form's API key field is `<input type="password">`. Once saved, the key is **encrypted at rest** (AES-256-GCM, master key at `$CHATLAB_HOME/master.key` (mode 0600) — see [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#at-rest-encryption)), masked (`***last4`) in every HTTP response, and never appears in the JSONL feedback export.

## Probing the agent

The **Probe** button on the edit form sends a one-shot prompt and shows the response inline. Use it to verify the API key works before you start a real chat. A wrong key surfaces the upstream error inline (`ZZ_AGENT_PROVIDER_ERROR` + the original status).

## What's next

[3. Open a chat with a theme](./03-chats-and-messages.md).
