# 6. Going further

You've installed chatlab, configured a workspace + agent, opened chats with themes, exchanged messages, rated replies, and exported a corpus. Where to next?

## Programmatic API (Node)

Boot chatlab in-process for integration tests:

```ts
import { startChatlab } from "chatlab";

const cl = await startChatlab({ port: 0 });   // ephemeral port
console.log(cl.url);                            // -> http://127.0.0.1:51234

// drive it with fetch() against cl.url ...

await cl.stop();
```

The exported `Core` is at `cl.core` for advanced harness work. You can also pass `agentFetcher: typeof fetch` to stub provider responses without touching global `fetch`:

```ts
const cl = await startChatlab({
  port: 0,
  agentFetcher: async () => new Response(JSON.stringify({ choices: [...] }), { status: 200 }),
});
```

This is exactly how chatlab's own integration tests work — see `test/agents/runner.test.ts`.

## Programmatic workspace control

```ts
import { WorkspaceRegistry } from "chatlab";

const registry = new WorkspaceRegistry({ home: "/tmp/my-chatlab-home" });
await registry.init();

const ws = registry.create({ nickname: "scenario-1", storage_type: "memory" });
registry.setActive(ws.id);
```

The registry is just a JSON file with atomic-write semantics. Useful when seeding fixtures for E2E tests.

## What chatlab v1.0 doesn't do

These are deferred — see [`docs/ROADMAP.md`](../ROADMAP.md):

- **Streaming responses (SSE)** — the runner buffers the full provider response.
- **Multimodal forwarding** — attachments are stored but not sent to the LLM.
- **Tool / function calling.**
- **Multi-user / multi-agent chats** (round-table testing).
- **Token / cost tracking.**
- **Platform adapters** (Telegram, Slack, Discord, WhatsApp Cloud API). Coming in v1.2+.
- **Browsable docs site** — [https://jvrmaia.github.io/chatlab/](https://jvrmaia.github.io/chatlab/) ([ADR 0009](../specs/adr/0009-github-pages-documentation-site.md)); run locally with `npm run docs:dev` from the repo root.

## What chatlab is not

- Not a hosted SaaS — runs entirely on your laptop. See [ADR 0011](../specs/adr/0011-hosted-instance-deferred.md).
- Not a fine-tuning loop — chatlab outputs the corpus; what you do with it is your loop.
- Not a chat platform end-users sign up for — it's a developer tool for building agents that target real chat platforms.

## You're done

The reference for everything you might need:

- [`recipes.md`](../recipes.md) — curl for every endpoint.
- [`specs/api/openapi.yaml`](../specs/api/openapi.yaml) — formal HTTP contract.
- [`specs/capabilities/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/capabilities) — what chatlab does, why.
- [`specs/adr/`](../specs/adr/) — durable architectural decisions.
- [`ARCHITECTURE.md`](../ARCHITECTURE.md) — how the pieces fit together.
