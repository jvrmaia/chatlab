# 0006 — Web UI

- **Status:** Implemented (v1.0.0)
- **Authors:** @jvrmaia
- **Related ADRs:** [`0005-web-ui-framework`](../adr/0005-web-ui-framework.md), [`0013-adopt-claude-design-system`](../adr/0013-adopt-claude-design-system.md)
- **Depends on:** [`0001-workspaces`](./0001-workspaces.md), [`0002-agents`](./0002-agents.md), [`0003-chats-and-messages`](./0003-chats-and-messages.md), [`0004-feedback-and-export`](./0004-feedback-and-export.md), [`0005-media`](./0005-media.md)

## Summary

A browser interface, served by chatlab, that lets a developer create and switch workspaces, configure agents, open chats with chosen agents and themes, exchange messages, rate replies, and annotate conversations. The layout reflects the actual roles (developer + agent) — chat list on the left, conversation surface in the middle, optional event log on the right, plus light/dark theme and three densities.

![Chatlab Web UI: header with brand + workspace picker + Chats/Admin tabs, chat list, chat view with bubbles + composer.](../../_assets/screenshots/06-chat-view.png)

## Motivation

The UI's job is to surface the workspace + agent + chat triad as first-class affordances and get out of the way so the developer can focus on prompts and replies.

## User stories

- As a **chat-agent developer**, I want to see which workspace I'm in at all times, and switch with one click, so that I never accidentally send messages to the wrong workspace.
- As a **chat-agent developer**, I want to configure a new agent and use it in a fresh chat in under 30 seconds, so that the iteration loop stays fast.
- As a **chat-agent developer**, I want every chat in the sidebar to show its theme and the agent's name, so that I don't have to open every chat to remember what each is for.
- As a **PM / tester**, I want to rate replies and write notes without learning anything beyond clicking, so that I produce useful training data on day 1.

## Behavior

### Layout

```
┌───────────────────────────────────────────────────────┐
│ chatlab    [default ▾]            [Chats] [Admin]     │   ← workspace picker + tabs
├──────────┬────────────────────────────────────────────┤
│chats list│ chat header (theme + agent name)           │
│          │                                            │
│ "Aprend." │ user / assistant bubbles                  │
│ "Receit." │                                           │
│  + New   │ composer                                   │
└──────────┴────────────────────────────────────────────┘
```

### Header

- Brand `chatlab` on the left.
- Workspace picker dropdown, showing the currently-active workspace's nickname. Clicking opens a list of every workspace; clicking one calls `POST /v1/workspaces/{id}/activate` and the UI refetches the chat list, agents, etc.
- Top-level tabs: **Chats** (default) and **Admin**.

### Chats tab

- Sidebar: list of chats in the active workspace, ordered by `updated_at DESC`. Each row: theme (1 line), agent name (smaller text), last message preview.
- "+ New chat" button opens a small inline form: agent dropdown (workspace's agents) + theme text input. Submit creates the chat and selects it.
- Chat view: header shows theme + agent name. Body shows alternating `user` / `assistant` bubbles. Composer at the bottom: text input + drag-and-drop file area. Hitting Enter (or clicking Send) calls `POST /v1/chats/{id}/messages`. Within ~2 s, the assistant reply arrives via WS and is appended.
- Assistant bubbles carry 👍 / 👎 affordances. User bubbles do not.
- Each chat has an **annotations panel** (collapsed by default) below the messages — same shape as before the pivot, just keyed by `chat_id` now.
- Failed assistant replies render with a red border and the error message visible inline.

### Admin tab

Two subtabs.

- **Workspaces**: table with `nickname`, `storage_type`, `storage_path`, `created_at`, "currently active" marker, "Activate" / "Delete" actions. "+ New workspace" form: nickname + storage_type. Delete confirmation requires typing the nickname (typed-confirm pattern, less footgun-prone than a single button).
- **Agents**: agent CRUD scoped to the active workspace. "+ Novo agente" form (name + provider dropdown + model + api key + base URL + system prompt + context_window). Per-row "Probe" / "Edit" / "Delete" actions. The provider dropdown auto-fills the model placeholder with the provider default. **No "Default" toggle** — agents are picked per-chat, not globally.

### Real-time updates

- The UI opens a WebSocket on `/ws` and listens for events:
  - `workspace.activated` — refetch chat list, agents.
  - `chat.user-message-appended` / `chat.assistant-replied` — append to current chat view.
  - `agent.failed` — append failed assistant bubble with error visible.
- WS reconnect is exponential-backoff (0.5 s → 30 s cap) without page reload, with a small status banner during `connecting` / `closed` states.

### Persistence (UI state)

- Selected chat persists to `localStorage` under `chatlab.selectedChatId`. If the chat doesn't exist on boot, selection is silently cleared.
- Workspace activation lives server-side (registry); the UI just reads `GET /v1/workspaces/active` on mount.

### Auth

- The UI calls every endpoint with `Authorization: Bearer ui-dev-token` — the literal string is hardcoded in `src/ui/api.ts`. When `CHATLAB_REQUIRE_TOKEN` is set on the server, the bundled UI cannot call the API; either set the token to `ui-dev-token` or run the UI in an environment that injects the configured token (deferred to v1.1).

## Out of scope

- **Mobile-responsive layout.** Targeted at desktop laptops. Tablet / phone usability is best-effort.
- **i18n.** Mixed pt-BR / en labels are accepted in v1.0; real i18n is v1.1+ work.
- **Theming / dark mode.** Light theme only.
- **Search across chats.**
- **Drag-to-reorder chats.**
- **Keyboard shortcuts** beyond Enter-to-send.

## Open questions

1. Should the workspace picker show storage_type icons (sqlite/duckdb/memory)? Useful but adds visual noise.
2. Should the Admin → Workspaces panel show *data file size* per workspace (so users can see disk usage)? Currently no.
3. Should there be a way to "duplicate this chat" (fork the message history into a new chat with a new theme)? Useful for branch-and-compare. Captured in capability 0001's open question 2.

## Verification

- [ ] Open `/ui` on a fresh boot. Confirm: workspace picker shows `default`, Chats tab is selected, chat list is empty, composer placeholder reads "Configure an agent to start chatting".
- [ ] Switch to Admin → Agents. Create an Ollama profile. Click Probe — see a response.
- [ ] Switch to Admin → Workspaces. Create `experiment-1` (sqlite). Activate it. Confirm picker updates and chat list refreshes (empty).
- [ ] Switch to Chats. + New chat → pick the agent + theme `"Aprendendo Python"`. Send "Olá". Within 2 s an assistant bubble appears.
- [ ] + New chat with the same agent + theme `"Receitas"`. Send "Como faço pão?". Confirm the reply doesn't reference Python (context segregation).
- [ ] Reload the page — the previously-selected chat is restored.
- [ ] Stop the chatlab process (`Ctrl+C`). Confirm the UI shows the "connection lost — reconnecting…" banner. Restart — banner clears within 2-3 s, no full-page reload.
- [ ] Switch workspaces from the picker — chat list reflects the new workspace's data.
- [ ] Rate an assistant reply 👍, write an annotation, reload — both persist.
- [ ] Drag-drop an image into the composer — appears as an attachment on the next user message.

## Acceptance

- **Vitest test ID(s):** none directly — UI is exercised by humans + by `npm run docs:capture` (Playwright screenshot pipeline). E2E regression deferred to v1.1 (item 12 of TRB review 2026-04-30).
- **OpenAPI operation(s):** none — the UI consumes the contract defined by capabilities `0001`–`0005`.
- **User Guide section:** [`docs/user-guide/`](../../user-guide/) — every page in the user guide implicitly verifies a UI flow.
