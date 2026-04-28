# 1. Install chatlab

| Mode | Command | When to pick |
| --- | --- | --- |
| **From source** | `git clone … && npm install && npm run build && npm start` | You want `main` or to hack on chatlab. |
| **NPM** | `npx @jvrmaia/chatlab` (or `npm i -g @jvrmaia/chatlab`) | Lowest-friction trial; same on every Node host. |
| **Docker** | `docker run -e CHATLAB_REQUIRE_TOKEN=… jvrmaia/chatlab:latest` | Reproducible container, polyglot teams, CI. |

The npm name `chatlab` was already taken by an unrelated package, so chatlab is scoped — but the **CLI binary is still `chatlab`** after install.

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
- **`auth: permissive`** — any non-empty `Authorization: Bearer <token>` is accepted. Set `CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)` for strict mode.
- **`retention: 90 days`** — feedback + annotations sweep older rows on startup + daily. Set `CHATLAB_FEEDBACK_RETENTION_DAYS=30` (or `0` to disable).

## Docker

The container binds to `0.0.0.0` by default, which triggers the bind-safety check — the
process exits with code 78 before opening any port unless `CHATLAB_REQUIRE_TOKEN` is set.
Generate a token first:

```bash
export CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)
echo "$CHATLAB_REQUIRE_TOKEN"   # save this — it is your bearer for every API call
docker run --rm -p 4480:4480 \
  -e CHATLAB_REQUIRE_TOKEN="$CHATLAB_REQUIRE_TOKEN" \
  jvrmaia/chatlab:latest
```

Banner (Docker):

```
chatlab listening on http://0.0.0.0:4480
  workspace: default (sqlite)
  data dir : /data
  auth     : enforced (CHATLAB_REQUIRE_TOKEN set)
  retention: 90 days
  ui       : http://0.0.0.0:4480/ui
```

For persistent storage, `docker compose`, SQLite bind mounts, DuckDB workspace bootstrap,
and `CHATLAB_MASTER_KEY` (needed when running without a persistent volume), see
[Distribution: Docker](../distribution/docker.md).

## Stopping chatlab

`Ctrl+C` in the same terminal. WS, HTTP, runner, and storage all shut down cleanly. For Docker, `docker stop <container>` or `Ctrl+C` if running in the foreground.

## What's next

[2. Configure your first workspace + agent](./02-workspaces-and-agents.md).
