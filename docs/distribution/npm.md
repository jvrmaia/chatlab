# Distribution: NPM

> **Package name:** the npm name `chatlab` (no scope) was already taken by an unrelated package, so chatlab is published as **`@jvrmaia/chatlab`**. The CLI binary remains `chatlab` — after install, you type `chatlab` regardless of the scoped package name.

The NPM distribution targets Node-shop developers who already have a JavaScript/TypeScript toolchain and want the lowest-friction way to spin up chatlab.

## Quick start

```bash
# Run without installing
npx @jvrmaia/chatlab

# Or install globally — the bin is still `chatlab`
npm install -g @jvrmaia/chatlab
chatlab
```

## Quick start (today, from source)

```bash
git clone https://github.com/jvrmaia/chatlab.git
cd chatlab
npm install
npm run build
npm start
```

By default chatlab:

- Listens on `http://127.0.0.1:4480` for the HTTP API
- Serves the Web UI at `http://127.0.0.1:4480/ui`
- Stores data in `~/.chatlab/data/` — sqlite by default for the auto-created `default` workspace
- Does not dispatch webhooks (no built-in webhook surface in v1.x)

## Configuration

| Env var | CLI flag | Default | Purpose |
| --- | --- | --- | --- |
| `CHATLAB_PORT` | `--port` | `4480` | HTTP / WebSocket / UI port |
| `CHATLAB_HOST` | `--host` | `127.0.0.1` | Bind address |
| `CHATLAB_HOME` | `--home` | `~/.chatlab` | Workspace registry + data dir |
| `CHATLAB_WORKSPACE_ID` | `--workspace` | (registry's `active_id`) | Activate a specific workspace at boot |
| `CHATLAB_LOG_LEVEL` | `--log-level` | `info` | One of `silent`, `error`, `warn`, `info`, `debug` |
| `CHATLAB_REQUIRE_TOKEN` | `--require-token` | unset | Enforce a specific Bearer token. Required when `CHATLAB_HOST` is non-localhost — see [bind-safety in `SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#bind-safety). |
| `CHATLAB_FEEDBACK_RETENTION_DAYS` | — | `90` | How many days feedback rows + annotations are kept before automatic deletion (24 h timer). `0` disables retention. |
| `CHATLAB_MASTER_KEY` | — | auto-generated | Base64 of 32 bytes used to encrypt provider API keys at rest (AES-256-GCM). When unset, chatlab generates `$CHATLAB_HOME/master.key` (mode 0600) on first boot and reuses it. Override for CI / Docker secrets. **Lose the key, lose the cleartext.** See [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#at-rest-encryption). |

## Bind-safety

If you set `CHATLAB_HOST` to anything other than `127.0.0.1` / `localhost` / `::1` **without** also setting `CHATLAB_REQUIRE_TOKEN`, chatlab refuses to start (exit code `78`). See [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#bind-safety).

## Programmatic API

`chatlab` ships as a regular npm package. You can import it from a Node.js process and boot a chatlab instance in-process — no separate `npm start`. This is what `test/http/_harness.ts` does to spin up chatlab per test file.

### Minimal start/stop

```ts
import { startChatlab } from "@jvrmaia/chatlab";

const cl = await startChatlab({ port: 0 });   // 0 = ephemeral port
console.log(cl.url);                           // -> http://127.0.0.1:51234

// drive it via fetch() against cl.url ...

await cl.stop();
```

`startChatlab` accepts the same options the CLI accepts as flags / env vars:

| Option | Equivalent env var | Default |
| --- | --- | --- |
| `host` | `CHATLAB_HOST` | `127.0.0.1` |
| `port` | `CHATLAB_PORT` | `4480` (`0` picks ephemeral) |
| `home` | `CHATLAB_HOME` | `~/.chatlab` |
| `requireToken` | `CHATLAB_REQUIRE_TOKEN` | unset |
| `logLevel` | `CHATLAB_LOG_LEVEL` | `info` |

The returned object exposes:

- **`cl.url`** — the resolved base URL (`http://<host>:<port>`).
- **`cl.config`** — the fully-resolved config object (helpful when you passed `port: 0` and need to read back the real one).
- **`cl.core`** — the running `Core` instance (event emitter + storage owner; advanced uses).
- **`cl.stop()`** — closes the HTTP listener, the WS gateway, the active storage adapter; resolves when shutdown is complete.

### A complete script: configure an agent and run a chat

```ts
import { startChatlab } from "@jvrmaia/chatlab";

const cl = await startChatlab({ port: 0 });
const headers = {
  Authorization: "Bearer dev",
  "Content-Type": "application/json",
};

try {
  // 1. Configure an agent in the default workspace.
  const agent = await fetch(`${cl.url}/v1/agents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Local llama3",
      provider: "ollama",
      model: "llama3",
      system_prompt: "Respond in one sentence.",
    }),
  }).then((r) => r.json());

  // 2. Open a chat with that agent on a theme.
  const chat = await fetch(`${cl.url}/v1/chats`, {
    method: "POST",
    headers,
    body: JSON.stringify({ agent_id: agent.id, theme: "smoke test" }),
  }).then((r) => r.json());

  // 3. Send a user message. The HTTP response is the persisted user message;
  //    the assistant reply lands asynchronously, broadcast over WS and
  //    persisted to the chat's message log.
  await fetch(`${cl.url}/v1/chats/${chat.id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: "Olá" }),
  });

  // 4. Poll for the assistant reply.
  const start = Date.now();
  let reply: { content: string } | undefined;
  while (Date.now() - start < 10_000) {
    const msgs: { role: string; content: string }[] = await fetch(
      `${cl.url}/v1/chats/${chat.id}/messages`,
      { headers },
    ).then((r) => r.json());
    reply = msgs.find((m) => m.role === "assistant") as typeof reply;
    if (reply) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log("Assistant reply:", reply?.content ?? "(timed out)");
} finally {
  await cl.stop();
}
```

Run it from any Node 22 script. Real-world equivalents that work the same way: a Vitest spec, a Playwright fixture, a CLI you write that wraps chatlab behind a subcommand.

### Subscribe to events instead of polling

```ts
const ws = new WebSocket(cl.url.replace(/^http/, "ws") + "/ws", {
  headers: { Authorization: "Bearer dev" },
});

ws.on("message", (raw) => {
  const event = JSON.parse(raw.toString()) as { type: string };
  if (event.type === "chat.assistant-replied") {
    console.log("got reply:", event);
  }
});
```

The full surface (event types, payloads) lives in `src/core/core.ts` — `CoreEvent` is the union.

### Drive `Core` directly without HTTP

For very tight harness loops, you can skip the HTTP round-trips entirely and call the active storage adapter:

```ts
const core = cl.core;
const adapter = await core.getActiveAdapter();

const chat = await adapter.chats.create({
  agent_id: "...",
  theme: "fixture",
});
await adapter.messages.append(chat.id, { role: "user", content: "seed" });
```

This bypasses the auth layer and the OpenAPI shape — exposed for tests, not for application code. The full export surface is at [`src/index.ts`](https://github.com/jvrmaia/chatlab/blob/main/src/index.ts).

## Versioning

v1.0 is the first release under the `chatlab` name. Tagged releases publish to npm under the `latest` dist-tag (stable) or `next` (pre-release).

## Supported Node versions

Whatever is in [`.nvmrc`](https://github.com/jvrmaia/chatlab/blob/main/.nvmrc) at release time. Currently Node **22 LTS**.
