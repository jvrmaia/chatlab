---
sidebar_label: Project overview
---

# chatlab

A **local-first workbench** for chat agents. Point chatlab at the agent **you're building** (the `custom` provider, any OpenAI-compat endpoint) and at six LLM clients (OpenAI, Anthropic, DeepSeek, Gemini, Maritaca, Ollama) for comparison. Open chats with chosen agents and themes, exchange messages, rate replies, write notes, export a JSONL corpus when you're ready to fine-tune.

## Why chatlab and not …

| Pick chatlab when… | Pick **LangSmith** when… | Pick **Promptfoo** when… | Pick **OpenAI Playground** when… |
| --- | --- | --- | --- |
| You're **building a chat agent** and want to test it side-by-side with `gpt-4o`, `claude-sonnet-4-6`, and `llama3` from a single workbench. The `custom` provider points at your dev server; the six LLM clients ride alongside. Local-first, JSONL-export-ready, no SaaS. | You're shipping a LangChain app and need cloud-hosted observability + tracing across chains. chatlab does not trace internal chains — it's a workbench for the conversation surface, not the runtime. | You only need a **regression-eval** loop (golden set → assertions → score). Promptfoo is great at that one job. chatlab's eval harness is on the v1.1 roadmap; use Promptfoo until it lands. | You want to compare a single OpenAI prompt across `gpt-4o` and `o1` interactively. The Playground is fast and free for that. chatlab's wedge is multi-provider + multi-workspace + persistent corpus + your-own-agent. |

**The wedge:** point-at-your-own-agent (`custom`) + multi-provider comparison + multi-workspace + fully local + JSONL-export-ready. If the first one doesn't matter (you're not building an agent, just consuming one), one of the alternatives above is probably the better pick.

This documentation site is generated from the [`docs/` tree](https://github.com/jvrmaia/chatlab/tree/main/docs). The **canonical README** (install snippet, capability matrix, repository layout) stays at the repository root — open **[README.md on GitHub](https://github.com/jvrmaia/chatlab/blob/main/README.md)**.

Continue from here: **[Quickstart](./quickstart.md)**.
