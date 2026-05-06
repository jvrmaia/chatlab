# 4. Multiple chats, multiple themes

The headline of chatlab v1.x: **the same agent can have many chats with different themes, all kept perfectly separate**.

## Why this matters

When you're testing an agent, you want to ask it about completely different topics — pricing questions, technical questions, support cases, whatever — without the previous conversation polluting the new one.

You just create another chat. Each chat carries its own UUID + theme. The runner builds the messages array from **only that chat's history** plus the theme as system context. Two chats with the same agent on different themes literally cannot bleed into each other.

## Try it

1. Create a chat with theme `"Aprendendo Python"`. Send `"Como começo?"`. The assistant replies with Python-flavored advice.
2. Create another chat with the same agent + theme `"Receitas culinárias"`. Send `"Como faço um pão?"`. The assistant replies about bread — no mention of Python.

If you flip back to the first chat, its history is intact. The agent has no idea the second chat exists.

## When this matters most

- **Comparing prompt strategies.** Open two chats with the same agent, one with system prompt A and one with system prompt B. Send the same question. Compare side-by-side.
- **Long demos.** A "demo to the team" chat with a focused sequence of Q&A doesn't have to be cluttered with throwaway messages from warm-up runs.
- **Bug reproduction.** If a particular sequence of messages breaks the agent, isolate it in its own chat with theme `"reproduce: the bug from #PR-42"`.

## What about multi-agent / round-table?

Chats have exactly one assistant agent in v1.0. Two assistants, multi-user round-table, etc., are out of scope — see [capability 0003 §Out of scope](../specs/capabilities/0003-chats-and-messages.md#out-of-scope). If you want to compare two agents, run them in two chats.

## What's next

[5. Feedback and export](./05-feedback-and-export.md).
