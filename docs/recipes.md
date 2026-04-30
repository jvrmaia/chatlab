# Recipes

Copy-paste `curl` commands for every endpoint exposed by chatlab v1.x. All examples assume:

- chatlab running at `http://127.0.0.1:4480` (default)
- Bearer token `dev-token` (any non-empty token works unless `CHATLAB_REQUIRE_TOKEN` is set)

> **Convention.** Shell variables for the bits that change frequently:
>
> ```bash
> export CL=http://127.0.0.1:4480
> export TOKEN=dev-token
> ```

Health probes do **not** require auth:

```bash
curl $CL/healthz   # liveness
curl $CL/readyz    # readiness
```

---

## Workspaces

### List + active

```bash
curl -H "Authorization: Bearer $TOKEN" $CL/v1/workspaces
curl -H "Authorization: Bearer $TOKEN" $CL/v1/workspaces/active
```

### Create

```bash
curl -X POST $CL/v1/workspaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "nickname": "experiment-1", "storage_type": "sqlite" }'
```

`storage_type` is one of `memory | sqlite | duckdb`.

### Activate / rename

```bash
# switch the running adapter
curl -X POST $CL/v1/workspaces/$WS_ID/activate \
  -H "Authorization: Bearer $TOKEN"

# rename (storage_type/path are immutable)
curl -X PATCH $CL/v1/workspaces/$WS_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "nickname": "renamed" }'
```

### Delete

```bash
# requires ?confirm=true — removes workspace + its data files
curl -X DELETE "$CL/v1/workspaces/$WS_ID?confirm=true" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Agents (scoped to active workspace)

### Create — Ollama (no API key, local)

```bash
curl -X POST $CL/v1/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Local llama3",
    "provider": "ollama",
    "model": "llama3",
    "system_prompt": "Você é um atendente cordial em português."
  }'
```

### Create — OpenAI

```bash
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

### Create — Anthropic

```bash
curl -X POST $CL/v1/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Claude Sonnet 4.6",
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "api_key": "sk-ant-..."
  }'
```

DeepSeek (`deepseek` / `deepseek-chat`), Gemini (`gemini` / `gemini-2.5-flash`), and Maritaca (`maritaca` / `sabia-3`) follow the same shape.

### List, update, delete

```bash
# api keys masked
curl -H "Authorization: Bearer $TOKEN" $CL/v1/agents

# omit api_key in patch to preserve it
curl -X PATCH $CL/v1/agents/$AGENT_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "renamed" }'

# DELETE returns 409 if any chat references the agent
curl -X DELETE -H "Authorization: Bearer $TOKEN" $CL/v1/agents/$AGENT_ID
```

### Probe (one-shot test)

```bash
curl -X POST $CL/v1/agents/$AGENT_ID/probe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "Diga olá em português." }'
# -> { "content": "Olá! ..." }
```

---

## Chats + messages

### Create a chat

```bash
curl -X POST $CL/v1/chats \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "agent_id": "'$AGENT_ID'", "theme": "Aprendendo Python" }'
```

### List + read

```bash
curl -H "Authorization: Bearer $TOKEN" $CL/v1/chats
curl -H "Authorization: Bearer $TOKEN" $CL/v1/chats/$CHAT_ID
curl -H "Authorization: Bearer $TOKEN" $CL/v1/chats/$CHAT_ID/messages
```

### Send a user message

```bash
curl -X POST $CL/v1/chats/$CHAT_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "content": "Como começo?" }'
```

The HTTP response is the persisted user message. The assistant reply arrives asynchronously — poll `GET .../messages` or subscribe via WS.

### Send a message with attachment

```bash
curl -X POST $CL/v1/chats/$CHAT_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "What's in this image?",
    "attachments": [{ "media_id": "'$MEDIA_ID'" }]
  }'
```

(Multimodal forwarding to the provider is deferred to v1.1 — for now, attachments are stored alongside the message but not sent to the LLM.)

### Delete

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" $CL/v1/chats/$CHAT_ID
```

---

## Feedback + annotations

### Rate an assistant message

```bash
curl -X POST $CL/v1/messages/$MSG_ID/feedback \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "rating": "up", "comment": "great answer" }'
```

`rating` is `"up"` or `"down"`; `comment` is optional, ≤ 280 chars. To clear:

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" $CL/v1/messages/$MSG_ID/feedback
```

### Bulk read all ratings for a chat

```bash
curl -H "Authorization: Bearer $TOKEN" $CL/v1/chats/$CHAT_ID/feedback
```

### Annotation

```bash
# read (returns body: "" if never written)
curl -H "Authorization: Bearer $TOKEN" $CL/v1/chats/$CHAT_ID/annotation

# write (PUT semantics, ≤ 16 KB Markdown)
curl -X PUT $CL/v1/chats/$CHAT_ID/annotation \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "body": "user kept rephrasing — agent ignored the order id" }'
```

### Export corpus as JSONL

```bash
curl -H "Authorization: Bearer $TOKEN" $CL/v1/feedback/export > corpus.jsonl

# filter to thumbs-down only since a date:
curl -H "Authorization: Bearer $TOKEN" \
  "$CL/v1/feedback/export?rating=down&since=2026-04-01T00:00:00Z" > down.jsonl
```

Every line carries `schema_version: 1`. See [capability 0004](./specs/capabilities/0004-feedback-and-export.md).

---

## Media

### Upload

```bash
curl -X POST $CL/v1/media \
  -H "Authorization: Bearer $TOKEN" \
  -F "type=image" \
  -F "file=@./screenshot.png"
# -> { "id": "..." }
```

`type` is one of `image|audio|video|document|sticker`.

### Get metadata + download

```bash
curl -H "Authorization: Bearer $TOKEN" $CL/v1/media/$MEDIA_ID
curl -H "Authorization: Bearer $TOKEN" $CL/v1/media/$MEDIA_ID/download > out.png
curl -X DELETE -H "Authorization: Bearer $TOKEN" $CL/v1/media/$MEDIA_ID
```

---

## Programmatic API (Node)

If your code is a Node.js process, you can boot chatlab in-process:

```ts
import { startChatlab } from "@jvrmaia/chatlab";

const cl = await startChatlab({ port: 0 });   // 0 = random ephemeral port
console.log(cl.url);                            // -> http://127.0.0.1:51234

// drive it with fetch() against cl.url ...

await cl.stop();
```

The exported `Core` instance is available at `cl.core` for advanced harness work — see [`src/index.ts`](../src/index.ts).
