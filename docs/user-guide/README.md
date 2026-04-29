# User Guide

A narrative walkthrough of chatlab v1.x, end to end.

If you want the 5-minute version with no commentary, read [`../quickstart.md`](../quickstart.md).

## Journey

1. [Install chatlab](./01-install.md) — from-source today; npm + Docker once published.
2. [Configure your first workspace + agent](./02-workspaces-and-agents.md) — workspace picker, provider selection, API keys.
3. [Open a chat with a theme](./03-chats-and-messages.md) — pick an agent, set a theme, type messages.
4. [Multiple chats, multiple themes](./04-multiple-chats.md) — context segregation in action.
5. [Feedback and export](./05-feedback-and-export.md) — rate replies, write notes, export JSONL.
6. [Going further](./06-going-further.md) — programmatic API, media attachments, deferred features.

## What you don't need

- A WhatsApp account, a phone, a QR code, a Meta business approval.
- A pre-deployed agent service.
- A network connection (with local Ollama).

## What this guide assumes

- Node.js 22 on your machine.
- Comfort with `curl` + a terminal (`jq` helpful but optional).
- Basic familiarity with the LLM provider you want to use (OpenAI / Anthropic / etc.).

## Where the source of truth lives

- [`docs/specs/api/openapi.yaml`](../specs/api/openapi.yaml) — every endpoint, shape, error code.
- [`docs/specs/capabilities/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/capabilities) — six numbered specs describing what chatlab does.
- [`docs/specs/adr/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/adr) — durable architectural decisions.

When this guide is wrong, those files are right.
