# 3. Chats and messages

A **chat** is a single conversation between you (role `user`) and one chosen agent (role `assistant`), pinned to a free-text **theme**. Each chat carries its own UUID and message history — context never bleeds between chats.

## Creating a chat

Click **Chats** at the top, then **+** in the sidebar. A small inline form opens:

- **Agent dropdown** — every agent in the active workspace. Pick one.
- **Theme** — free-text topic (e.g. `"Aprendendo Python"`). Up to 280 chars.

Click **Create**. The chat appears in the sidebar and gets selected automatically.

## Sending messages

Type in the composer at the bottom + hit **Enter** (or click **Send**). The user bubble appears immediately. Within a couple of seconds the assistant bubble follows.

What happened under the hood:

1. `POST /v1/chats/{id}/messages` persisted the user message + emitted `chat.user-message-appended`.
2. The AgentRunner picked up the event, looked up the chat's `agent_id`, built a messages array (system prompt + theme + last N messages), and called the provider.
3. The reply got persisted as an `assistant` message + emitted `chat.assistant-replied`.
4. The WS gateway broadcast the events; the UI re-fetched and rendered.

## Markdown in messages

Both user and assistant bubbles render their content as **GitHub-flavored Markdown**. That means `**bold**`, `_italic_`, fenced code blocks (```` ```python ````), inline `code`, lists, task lists (`- [x]`), tables, blockquotes, and autolinks all render. Triple-backtick fences are particularly useful when you're testing an agent that returns code — the result is readable instead of escaped.

Raw HTML inside messages is **dropped** by the renderer (no `<script>`, no `<iframe>`, no `<img>` either) — only safe Markdown features go through. Links open in a new tab.

## When something goes wrong

If the agent's API key is wrong (or the provider is down, or you're rate-limited), the assistant bubble appears with a red border and the error visible inline. The chat stays open — fix the key in **Admin → Agents → Edit** and the next message succeeds.

Failed messages persist with `status: "failed"` and the error message in the `error` field. They don't break the runner — subsequent messages fire normally.

## Attachments

The 📎 icon on the composer (or drag-and-drop) lets you attach a file. The file uploads to `POST /v1/media`, gets a UUID, and rides along on the next user message as an `attachments[]` entry.

Note: in v1.0 the runner does **not** forward attachments to the LLM provider — multimodal forwarding is deferred to v1.1. The attachment is stored alongside the message but the provider only sees the text content. You can still test "user uploaded a screenshot" UX flows; you'll just need to paste a transcription manually for now.

## What's next

[4. Multiple chats, multiple themes](./04-multiple-chats.md).
