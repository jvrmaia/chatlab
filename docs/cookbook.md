# Cookbook

Task-oriented snippets — short answers to "how do I X with chatlab?". Each entry is self-contained: copy, adjust the variables, run.

For exhaustive endpoint reference see [`recipes.md`](./recipes.md). For walkthroughs see the [User Guide](./user-guide/README.md).

> **Setup.** Every snippet assumes:
>
> ```bash
> export CL=http://127.0.0.1:4480
> export TOKEN=dev-token   # any non-empty token unless CHATLAB_REQUIRE_TOKEN is set
> ```

---

## Workspaces

### Boot a fresh workspace under a custom data dir

```bash
CHATLAB_HOME=$PWD/scratch npm start
# everything (workspaces.json + per-workspace .db / .duckdb files)
# lives under ./scratch/
```

Drop `./scratch/` to wipe state without touching the global `~/.chatlab`.

### Run two chatlab instances side by side

```bash
# terminal 1
CHATLAB_HOME=$PWD/A CHATLAB_PORT=4480 npm start

# terminal 2
CHATLAB_HOME=$PWD/B CHATLAB_PORT=4481 npm start
```

They share **no** state — different data dirs, different ports, different active workspaces. Useful for A/B comparing prompt changes without context bleed.

### Switch the active workspace from the command line

```bash
WS_ID=$(curl -s -H "Authorization: Bearer $TOKEN" $CL/v1/workspaces \
  | jq -r '.data[] | select(.nickname=="experiment-1") | .id')

curl -X POST -H "Authorization: Bearer $TOKEN" $CL/v1/workspaces/$WS_ID/activate
```

The WS gateway broadcasts `workspace.activated`; any open UI tab refreshes.

### Delete every chat in the active workspace, keep the workspace

```bash
curl -s -H "Authorization: Bearer $TOKEN" $CL/v1/chats \
  | jq -r '.[].id' \
  | xargs -I{} curl -X DELETE -H "Authorization: Bearer $TOKEN" $CL/v1/chats/{}
```

---

## Agents

### Point chatlab at the agent you're developing

This is what chatlab is for. Your agent under development exposes an OpenAI-compatible endpoint (`POST /v1/chat/completions`) and you wire it as a `custom` provider:

```bash
curl -X POST $CL/v1/agents -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support agent (dev)",
    "provider": "custom",
    "model": "my-agent",
    "base_url": "http://localhost:8000/v1",
    "system_prompt": "Você é um atendente cordial em português brasileiro."
  }'
```

Then any chat that picks this agent forwards user messages to your `localhost:8000`. Iterate on the agent (hot-reload your dev server, or `docker compose restart`); send the same prompt from different chats with different themes; rate replies; export the JSONL when you're ready to fine-tune.

If you don't have an OpenAI-compat surface yet, paste the 30-line FastAPI echo agent from [`docs/providers.md`](./providers.md#minimal-agent-for-sanity-checking) — it gets you to "chatlab talks to my agent" in under a minute. Replace the echo logic with your real agent once the wiring is confirmed.

### Reuse the same agent across two themes without context bleed

A chat carries its own message history; the agent is shared. Create two chats, same `agent_id`, different `theme`:

```bash
curl -X POST $CL/v1/chats -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"agent_id\": \"$AGENT_ID\", \"theme\": \"Aprendendo Python\" }"

curl -X POST $CL/v1/chats -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"agent_id\": \"$AGENT_ID\", \"theme\": \"Receitas de cozinha\" }"
```

Each chat builds its prompt from **its own history** plus its `theme` injected as system context.

### Update an agent's system prompt without losing the API key

`PATCH` only touches the fields you send. Omitting `api_key` preserves the stored value:

```bash
curl -X PATCH $CL/v1/agents/$AGENT_ID -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "system_prompt": "Responda sempre em uma frase, no máximo." }'
```

### Rotate the master key (re-encrypt all stored API keys)

The master key in `$CHATLAB_HOME/master.key` (or `$CHATLAB_MASTER_KEY` env) decrypts every agent profile's API key. Rotation is "decrypt with old, re-encrypt with new" per agent. Run this in a script that boots chatlab in-process so we can use the typed API:

```ts
import { startChatlab } from "chatlab";
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

// 1) Boot once with the OLD key — read every agent's plaintext.
const old = await startChatlab({ port: 0 });
const adapter = await old.core.getActiveAdapter();
const agents = await adapter.agents.list();   // already decrypted via OLD key
const plaintexts = new Map(agents.map((a) => [a.id, a.api_key ?? null]));
await old.stop();

// 2) Generate a NEW key, write it, set CHATLAB_MASTER_KEY for the next boot.
const newKey = randomBytes(32);
writeFileSync(`${process.env.HOME}/.chatlab/master.key`, newKey, { mode: 0o600 });

// 3) Boot again with the NEW key, PATCH each agent with its plaintext —
//    storage adapter encrypts on write with the NEW key.
const fresh = await startChatlab({ port: 0 });
const a2 = await fresh.core.getActiveAdapter();
for (const [id, plain] of plaintexts) {
  if (plain) await a2.agents.update(id, { api_key: plain });
}
await fresh.stop();
```

If the rotation script crashes mid-run, the old key still works for any unrotated rows — the storage adapter accepts both. Re-run the script; idempotent.

### Smoke-test an agent before opening a chat

```bash
curl -X POST $CL/v1/agents/$AGENT_ID/probe -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "Diga olá." }'
# -> { "content": "Olá! ..." }
```

If the probe times out or 5xx's, the agent is misconfigured (key, base URL, model name). See [troubleshooting](./troubleshooting.md#agent-probe-times-out-or-5xxs).

---

## Chats and messages

### Send a message and wait synchronously for the reply

The HTTP response to `POST .../messages` is just the persisted **user** message; the assistant reply arrives asynchronously. To get the reply in one script:

```bash
USER_MSG_ID=$(curl -s -X POST $CL/v1/chats/$CHAT_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "content": "Hello" }' | jq -r .id)

# Poll until the assistant reply lands (typically <2 s).
for i in $(seq 1 20); do
  REPLY=$(curl -s -H "Authorization: Bearer $TOKEN" $CL/v1/chats/$CHAT_ID/messages \
    | jq --arg uid "$USER_MSG_ID" '
        [.[]] | map(select(.role=="assistant" and .created_at > (
          [.[]] | map(select(.id==$uid))[0].created_at
        ))) | first
      ')
  if [ "$REPLY" != "null" ]; then echo "$REPLY"; break; fi
  sleep 0.5
done
```

For a less polling-heavy approach, subscribe over WebSocket (next snippet).

### Subscribe to live events from a script

```bash
# wscat (npm i -g wscat) or websocat
wscat -c "ws://127.0.0.1:4480/ws" -H "Authorization: Bearer $TOKEN"
# every event arrives as one JSON frame:
#   {"type":"chat.user-message-appended","message":{...}}
#   {"type":"chat.assistant-replied","message":{...}}
#   {"type":"agent.failed","chat_id":"...","error":"..."}
```

### Attach a media file in two requests

```bash
# 1) upload — get back the media id
MEDIA_ID=$(curl -s -X POST $CL/v1/media -H "Authorization: Bearer $TOKEN" \
  -F "type=image" -F "file=@./screenshot.png" | jq -r .id)

# 2) send a message that references it
curl -X POST $CL/v1/chats/$CHAT_ID/messages -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"content\": \"What's in this image?\",
    \"attachments\": [ { \"media_id\": \"$MEDIA_ID\", \"mime_type\": \"image/png\", \"filename\": \"screenshot.png\" } ]
  }"
```

In v1.0 the media is stored but not forwarded to the LLM; multimodal forwarding lands in v1.1 — see [`ROADMAP.md`](./ROADMAP.md).

---

## Feedback and export

### Rate the last assistant reply 👍 from a script

```bash
LAST_ASSISTANT=$(curl -s -H "Authorization: Bearer $TOKEN" $CL/v1/chats/$CHAT_ID/messages \
  | jq -r 'map(select(.role=="assistant")) | last | .id')

curl -X PUT $CL/v1/messages/$LAST_ASSISTANT/feedback \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "rating": "up" }'
```

### Append a per-chat note (replaces previous note)

```bash
curl -X PUT $CL/v1/chats/$CHAT_ID/annotation \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "body": "user wanted refunds, agent kept offering replacements" }'
```

### Export only thumbs-down from the last 7 days

```bash
SINCE=$(date -u -v-7d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d '7 days ago' +"%Y-%m-%dT%H:%M:%SZ")
curl -H "Authorization: Bearer $TOKEN" \
  "$CL/v1/feedback/export?rating=down&since=$SINCE" > down-7d.jsonl
```

For converting the JSONL into Parquet / pandas / HuggingFace `datasets`, see [`exporting-feedback.md`](./exporting-feedback.md).

---

## Programmatic (TypeScript)

### Start chatlab in-process for a one-off script

```ts
import { startChatlab } from "chatlab";

const cl = await startChatlab({ port: 0 });
try {
  const r = await fetch(`${cl.url}/v1/workspaces`, {
    headers: { Authorization: "Bearer dev-token" },
  });
  console.log(await r.json());
} finally {
  await cl.stop();
}
```

### Use the `Core` instance directly (skip HTTP)

```ts
import { startChatlab } from "chatlab";

const cl = await startChatlab({ port: 0 });
const core = cl.core;

// Active storage adapter — call methods directly without going through HTTP.
const adapter = await core.getActiveAdapter();
const chats = await adapter.chats.list();
console.log(chats);

await cl.stop();
```

Useful for harness code that needs to set up state much faster than serial HTTP requests can.

### Drive a real LLM agent from a Node test

```ts
import { startChatlab } from "chatlab";

const cl = await startChatlab({ port: 0 });
const headers = { Authorization: "Bearer t", "Content-Type": "application/json" };

const agent = await fetch(`${cl.url}/v1/agents`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    name: "Local",
    provider: "ollama",
    model: "llama3",
    system_prompt: "Respond in one sentence.",
  }),
}).then((r) => r.json());

const chat = await fetch(`${cl.url}/v1/chats`, {
  method: "POST",
  headers,
  body: JSON.stringify({ agent_id: agent.id, theme: "smoke test" }),
}).then((r) => r.json());

await fetch(`${cl.url}/v1/chats/${chat.id}/messages`, {
  method: "POST",
  headers,
  body: JSON.stringify({ content: "Olá" }),
});

// Wait for the assistant to reply.
const start = Date.now();
let reply: unknown = null;
while (Date.now() - start < 10_000) {
  const msgs = (await fetch(`${cl.url}/v1/chats/${chat.id}/messages`, { headers }).then((r) =>
    r.json(),
  )) as { role: string; content: string }[];
  reply = msgs.find((m) => m.role === "assistant");
  if (reply) break;
  await new Promise((r) => setTimeout(r, 250));
}

console.log(reply);
await cl.stop();
```

This is the integration-test shape — a real Ollama running, an ephemeral chatlab port, no global state.

---

## UI tweaks

### Force the UI into dark mode for a screencast

The toggle in the header sets `localStorage["chatlab.theme"] = "dark"` and a `data-theme="dark"` attribute on `<html>`. To pre-set it before opening the page (e.g. in a Playwright recording):

```ts
await page.addInitScript(() => {
  localStorage.setItem("chatlab.theme", "dark");
  localStorage.setItem("chatlab.density", "comfy");
});
await page.goto("http://127.0.0.1:4480/ui");
```

### Hide the dev drawer during a screen recording

The drawer collapses to a 32 px gutter when the user clicks the terminal icon. There is no API for it — it persists no state, so closing it before the recording is enough.

---

## CI integration

### Boot chatlab inside GitHub Actions for an integration test

```yaml
- uses: actions/setup-node@v4
  with:
    node-version-file: ".nvmrc"

- run: npm ci
- run: npm run build

- name: Boot chatlab
  run: |
    CHATLAB_PORT=4480 \
    CHATLAB_HOST=127.0.0.1 \
    npm start &
    npx wait-on http://127.0.0.1:4480/healthz

- run: ./scripts/run-integration-tests.sh
```

`CHATLAB_HOST=127.0.0.1` is the default; the explicit value documents intent. If you set a non-loopback host, `CHATLAB_REQUIRE_TOKEN` becomes mandatory — see [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#bind-safety).
