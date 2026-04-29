# 1. Install chatlab

| Mode | Status | When to pick |
| --- | --- | --- |
| **From source** | Available today | You want `main` or to hack on chatlab. |
| **NPM** (`npx chatlab`) | Pre-publish | After v1.0 ships to npmjs. |
| **Docker** | Pre-publish | Reproducible container in CI. |

Until v1.0 hits npm, **from-source is the path**.

## From source

```bash
git clone https://github.com/jvrmaia/chatlab.git
cd chatlab
npm install
npm run build
npm start
```

Banner:

```
chatlab listening on http://127.0.0.1:4480
  workspace: default (sqlite)
  data dir : /Users/you/.chatlab/data
  auth     : permissive (any non-empty bearer)
  retention: 90 days
  ui       : http://127.0.0.1:4480/ui
```

## What the banner is telling you

- **`workspace: default (sqlite)`** — chatlab auto-bootstrapped a workspace named `default` backed by a sqlite file at `~/.chatlab/data/<uuid>.db`. You can create more workspaces with different storage backends from the UI.
- **`auth: permissive`** — any non-empty `Authorization: Bearer <token>` is accepted. Set `CHATLAB_REQUIRE_TOKEN=hunter2` for strict mode.
- **`retention: 90 days`** — feedback + annotations sweep older rows on startup + daily. Set `CHATLAB_FEEDBACK_RETENTION_DAYS=30` (or `0` to disable).

## Stopping chatlab

`Ctrl+C` in the same terminal. WS, HTTP, runner, and storage all shut down cleanly.

## What's next

[2. Configure your first workspace + agent](./02-workspaces-and-agents.md).
