# Personas

> Three personas anchor every capability spec's user stories. If a user story doesn't map to one of these, it probably needs sharpening — or the persona set needs growing. Add a persona via PR; keep them tight.

## 1. Solo Developer (default — most user stories)

**Name:** Bruno (BR, 28, full-stack)
**Tools:** VS Code · Node 22 · Docker · Postman · ChatGPT
**Context:** Lead engineer at a mid-size startup. Building a customer-support agent that will eventually run on Telegram, Slack, and a custom web widget. Wants to iterate on the agent's prompt and provider without re-deploying his integration code on every change. Doesn't want to pay per-token costs while testing edge cases.

**Primary objectives:**
- Get a "hello world" round-trip (human types → agent replies) running on his laptop within 30 minutes of `npm install`.
- Compare two providers side by side without re-coding the integration — flip the agent assignment per chat.
- Capture the conversations as he goes so he has training data once the prompt stabilizes.

**Frustration:** "Every time I want to compare two LLMs my repo turns into a soup of `if (provider === 'openai')` branches. Then I forget which prompt was tested against which model on which scenario, and the conversations I needed for fine-tuning are gone because I refreshed the browser."

**Maps to capability specs:** [`0001`](./specs/capabilities/0001-workspaces.md), [`0002`](./specs/capabilities/0002-agents.md), [`0003`](./specs/capabilities/0003-chats-and-messages.md), [`0005`](./specs/capabilities/0005-media.md). User stories anchored on Bruno are the load-bearing ones.

---

## 2. PM / Tester (non-developer)

**Name:** Camila (BR, 35, product manager)
**Tools:** Linear · Figma · Slack · Browser only · Loom
**Context:** PM for the same chat-agent project. Doesn't write code, doesn't want to. Needs to validate the agent's responses cover the customer-journey edge cases she defined. Will rate replies thumbs-up/thumbs-down and write chat-level notes describing patterns.

**Primary objectives:**
- Open a URL, pick an agent, type messages — no terminal, no JSON, no Postman.
- Rate the agent's responses without reading documentation about what 👍 means.
- Write longer-form notes per chat when "thumbs-down" doesn't capture *why*.

**Frustration:** "When the engineers tell me to 'just try it', I usually have to install Node, then npm something, then read three READMEs, just to send a test message. By the time I get there I've forgotten what I was testing."

**Maps to capability specs:** [`0004`](./specs/capabilities/0004-feedback-and-export.md) (feedback + annotations — Camila is the rater the system is designed for), [`0006`](./specs/capabilities/0006-web-ui.md) (Web UI — Camila is the reason the UI exists).

---

## 3. ML Engineer (corpus consumer)

**Name:** Diego (BR, 31, ML engineer)
**Tools:** JupyterLab · HuggingFace `datasets` · DPO trainer · `jq` · pandas
**Context:** Works with Bruno's team. Will fine-tune a small open-source model on the conversations Bruno and Camila capture. Doesn't run chatlab himself — only consumes its export.

**Primary objectives:**
- One command (`curl .../v1/feedback/export`) gives him a JSONL file he can `from datasets import load_dataset` straight into.
- Each row carries enough metadata (`agent_version` auto-populated as `<provider>:<model>`, optional `failure_category`, timestamps, `theme`) for him to slice the corpus by experiment, model version, theme, and failure mode.
- Schema versioning is explicit so his pipeline doesn't break when the team adds new fields.

**Frustration:** "Half the time the dataset I get from product teams has comments mixing 5 reviewers, no agent version, no theme tags — I throw out 60% of the rows just to get a clean preference signal."

**Maps to capability specs:** [`0004`](./specs/capabilities/0004-feedback-and-export.md). Anchored on [ADR 0007](./specs/adr/0007-feedback-corpus-model.md) decisions about schema and format.

---

## How to use these in capability specs

When writing a user story, check:

- Does the story name **one of these three personas explicitly**? ("As Bruno, …", "As Camila, …", "As Diego, …".)
- If not — should the persona set grow, or is the story serving an unstated user the spec hasn't acknowledged?
- The [`spec-writer` Claude Code subagent](https://github.com/jvrmaia/chatlab/blob/main/.claude/agents/spec-writer.md) is briefed to flag user stories that don't map to a known persona.

Add a new persona only when at least one capability spec needs it and won't fit the existing three. Personas are cheap to add but expensive to maintain — keep the list tight.
