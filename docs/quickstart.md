# Quickstart

Five minutes from a fresh clone to "I configured an agent, opened a chat, sent a message, rated the reply".

> Want the longer walkthrough with screenshots? Read the [User Guide](./user-guide/README.md). This page is the 5-minute version.

## 0. Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | **22 LTS** | `node --version` |
| npm | bundled with Node | `npm --version` |
| git | any recent | `git --version` |
| curl | any recent | `curl --version` |
| (optional) Ollama | running on `localhost:11434` | `curl localhost:11434` |

## 1. Clone + build

```bash
git clone https://github.com/jvrmaia/chatlab.git
cd chatlab
npm install
npm run build
npm start
```

Banner:

```
chatlab listening on http://127.0.0.1:4480
  workspace: default (sqlite)
  data dir : /Users/you/.chatlab/data
  auth     : permissive (any non-empty bearer)
  retention: 90 days
  ui       : http://127.0.0.1:4480/ui
```

The first run auto-creates `~/.chatlab/workspaces.json` + `~/.chatlab/data/<uuid>.db` for the `default` workspace.

## 2. Configure an agent

Open <http://127.0.0.1:4480/ui> → **Admin** → **Agents** → **+ New agent**. Pick a provider (e.g. `ollama` for offline, or `openai`/`anthropic` etc. with an API key). The model field defaults to the provider's recommended one. Save.

Or via curl:

```bash
export CL=http://127.0.0.1:4480
export TOKEN=dev-token

curl -X POST $CL/v1/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenAI gpt-4o",
    "provider": "openai",
    "model": "gpt-4o",
    "api_key": "sk-...",
    "system_prompt": "You are a friendly assistant."
  }'
```

## 3. Probe the agent

The **Probe** button on the edit form sends a one-shot prompt and shows the response inline. Useful to verify the API key works before you start a real chat.

Or via curl:

```bash
curl -X POST $CL/v1/agents/$AGENT_ID/probe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "Olá" }'
# -> { "content": "Olá! Como posso ajudar?" }
```

## 4. Start a chat

Click **Chats** at the top, then **+** in the sidebar. Pick the agent + a free-text **theme** (e.g., `"Aprendendo Python"`). The chat opens; the composer is at the bottom.

Or via curl:

```bash
curl -X POST $CL/v1/chats \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "agent_id": "'$AGENT_ID'", "theme": "Aprendendo Python" }'
```

## 5. Send a message + see the reply

Type in the composer + hit Enter. Within ~2 s an assistant bubble appears.

Or via curl:

```bash
curl -X POST $CL/v1/chats/$CHAT_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "content": "Como começo a aprender?" }'
# response is the persisted user message; the assistant reply arrives
# asynchronously. Poll the messages list to see it:

curl -H "Authorization: Bearer $TOKEN" \
  $CL/v1/chats/$CHAT_ID/messages | jq '.data[-1]'
```

## 6. Rate the reply

Click 👍 or 👎 on any assistant bubble. To clear a rating, click the same affordance twice.

Or via curl:

```bash
curl -X POST $CL/v1/messages/$MSG_ID/feedback \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "rating": "up", "comment": "good first try" }'
```

## 7. Export the corpus

When you're ready to feed the data into a notebook:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  $CL/v1/feedback/export > corpus.jsonl
```

Each line carries `schema_version: 1`, the chat's `theme`, the rated assistant message + the prompt that triggered it, the rating, the optional comment, and any conversation-level annotation. See [capability 0004](./specs/capabilities/0004-feedback-and-export.md) for the schema.

## What's next

- The full reference for every endpoint: [`recipes.md`](./recipes.md).
- The narrative walkthrough with screenshots: [`user-guide/README.md`](./user-guide/README.md).
- The contract: [`specs/api/openapi.yaml`](./specs/api/openapi.yaml).
- The why: [`specs/capabilities/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/capabilities) and [`specs/adr/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/adr).
