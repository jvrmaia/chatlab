# Quickstart

Five minutes from a fresh clone to "I configured an agent, opened a chat, sent a message, rated the reply".

> Want the longer walkthrough with screenshots? Read the [User Guide](./user-guide/README.md). This page is the 5-minute version.

## 0. Prerequisites

**npm path (steps 1 → 7)**

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | **22 LTS** | `node --version` |
| npm | bundled with Node | `npm --version` |
| git | any recent | `git --version` |
| curl | any recent | `curl --version` |
| (optional) Ollama | running on `localhost:11434` | `curl localhost:11434` |

**Docker path (step 1-D → 7)** — use instead of the npm path above

| Tool | Version | Check |
| --- | --- | --- |
| Docker | **24+** | `docker --version` |
| git | any recent | `git --version` |
| curl | any recent | `curl --version` |
| jq | any recent | `jq --version` |
| (optional) Ollama | running on `localhost:11434` | `curl localhost:11434` |

> `jq` is used in the DuckDB workspace bootstrap. Install via `brew install jq` (macOS), `apt install jq` (Debian/Ubuntu), or [jq downloads](https://jqlang.org/download/).

## 1. Clone + build

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

The first run auto-creates `~/.chatlab/workspaces.json` + `~/.chatlab/data/<uuid>.db` for the `default` workspace.

## 1-D. Docker path (alternative to step 1)

Skip this section if you're using the npm path above.

The container binds to `0.0.0.0` by default, which triggers the bind-safety check —
the process exits with code 78 before opening any port unless `CHATLAB_REQUIRE_TOKEN`
is set. Generate a token first and keep the value — it's your bearer for every API call:

```bash
export CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)
echo "$CHATLAB_REQUIRE_TOKEN"   # save this
```

Pull and run from Docker Hub:

```bash
docker run --rm -p 4480:4480 \
  -e CHATLAB_REQUIRE_TOKEN="$CHATLAB_REQUIRE_TOKEN" \
  jvrmaia/chatlab:latest
```

Or build from source:

```bash
git clone https://github.com/jvrmaia/chatlab.git
cd chatlab
docker build -t chatlab:dev .
docker run --rm -p 4480:4480 \
  -e CHATLAB_REQUIRE_TOKEN="$CHATLAB_REQUIRE_TOKEN" \
  chatlab:dev
```

Banner:

```
chatlab listening on http://0.0.0.0:4480
  workspace: default (sqlite)
  data dir : /data
  auth     : enforced (CHATLAB_REQUIRE_TOKEN set)
  retention: 90 days
  ui       : http://0.0.0.0:4480/ui
```

Open `http://localhost:4480/ui`. When continuing to step 2, use these exports instead of the defaults shown there:

```bash
export CL=http://localhost:4480
export TOKEN="$CHATLAB_REQUIRE_TOKEN"
```

> **Persistence note.** The `--rm` example above uses ephemeral container storage — the workspace database and the API-key encryption key live inside the container and are lost when it stops. For a persistent setup, use docker compose (below) or mount a volume with `docker run`.

### docker compose (persistent, recommended)

Create a `compose.yml` in any directory:

```yaml
services:
  chatlab:
    image: jvrmaia/chatlab:latest    # or: build: . to use a local build
    ports:
      - "4480:4480"
    environment:
      CHATLAB_REQUIRE_TOKEN: "${CHATLAB_REQUIRE_TOKEN}"
    volumes:
      - chatlab-data:/data
    restart: unless-stopped

volumes:
  chatlab-data:
```

Then start it:

```bash
export CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)
echo "$CHATLAB_REQUIRE_TOKEN"   # save this
docker compose up -d
```

The named volume `chatlab-data` persists the workspace database and the API-key encryption key across restarts. When continuing to step 2:

```bash
export CL=http://localhost:4480
export TOKEN="$CHATLAB_REQUIRE_TOKEN"
```

#### Accessing the SQLite file from the host (bind mount)

The compose example above uses a named Docker volume (`chatlab-data`), which keeps the
data inside Docker's storage. If you want direct access to the `.db` file from the host
— for inspection, backup, or use with another SQLite tool — replace the named volume with
a bind mount:

```yaml
services:
  chatlab:
    build: .
    ports:
      - "4480:4480"
    environment:
      CHATLAB_REQUIRE_TOKEN: "${CHATLAB_REQUIRE_TOKEN}"
    volumes:
      - ./chatlab-data:/data      # host directory instead of named volume
    restart: unless-stopped
```

After `docker compose up -d`, the workspace registry and `.db` files are visible on the host:

```
chatlab-data/
├── workspaces.json               # registry — active workspace ID
└── data/
    └── <workspace-uuid>.db       # SQLite database, directly queryable
```

Open `chatlab-data/data/<uuid>.db` with any SQLite client. The workspace UUID is in
`workspaces.json` under `storage_path`.

#### Using DuckDB storage

The default workspace uses SQLite. To switch to DuckDB — better suited for analytical queries over large feedback corpora — create and activate a DuckDB workspace once after first boot:

```bash
# Create the DuckDB workspace
WORKSPACE_ID=$(curl -s -X POST http://localhost:4480/v1/workspaces \
  -H "Authorization: Bearer $CHATLAB_REQUIRE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nickname": "analytics", "storage_type": "duckdb"}' | jq -r '.id')

# Activate it (written to the volume — survives restarts automatically)
curl -s -X POST http://localhost:4480/v1/workspaces/$WORKSPACE_ID/activate \
  -H "Authorization: Bearer $CHATLAB_REQUIRE_TOKEN"
```

The registry file in the volume records `analytics (duckdb)` as the active workspace; all subsequent `docker compose up` boots use it with no extra flags.

> SQLite is the right default for most workloads. Prefer DuckDB when you intend to query the `.duckdb` file directly (DuckDB CLI, Python, a notebook) or when the feedback corpus grows large enough that columnar aggregations matter.

For a production setup with TLS and a reverse proxy, see [Distribution: Docker](./distribution/docker.md).

## 2. Configure an agent

Open <http://127.0.0.1:4480/ui> → **Admin** → **Agents** → **+ New agent**. Pick a provider (e.g. `ollama` for offline, or `openai`/`anthropic` etc. with an API key). The model field defaults to the provider's recommended one. Save.

Or via curl:

```bash
# npm path — any non-empty value works (permissive auth)
export CL=http://127.0.0.1:4480
export TOKEN=dev-token
# Docker path — use the values set in step 1-D instead:
#   export CL=http://localhost:4480
#   export TOKEN="$CHATLAB_REQUIRE_TOKEN"

curl -X POST $CL/v1/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenAI gpt-4o",
    "provider": "openai",
    "model": "gpt-4o",
    "api_key": "sk-...",
    "system_prompt": "You are a friendly assistant."
  }'
```

## 3. Probe the agent

The **Probe** button on the edit form sends a one-shot prompt and shows the response inline. Useful to verify the API key works before you start a real chat.

Or via curl:

```bash
curl -X POST $CL/v1/agents/$AGENT_ID/probe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "Olá" }'
# -> { "content": "Olá! Como posso ajudar?" }
```

## 4. Start a chat

Click **Chats** at the top, then **+** in the sidebar. Pick the agent + a free-text **theme** (e.g., `"Aprendendo Python"`). The chat opens; the composer is at the bottom.

Or via curl:

```bash
curl -X POST $CL/v1/chats \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "agent_id": "'$AGENT_ID'", "theme": "Aprendendo Python" }'
```

## 5. Send a message + see the reply

Type in the composer + hit Enter. Within ~2 s an assistant bubble appears.

Or via curl:

```bash
curl -X POST $CL/v1/chats/$CHAT_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "content": "Como começo a aprender?" }'
# response is the persisted user message; the assistant reply arrives
# asynchronously. Poll the messages list to see it:

curl -H "Authorization: Bearer $TOKEN" \
  $CL/v1/chats/$CHAT_ID/messages | jq '.data[-1]'
```

## 6. Rate the reply

Click 👍 or 👎 on any assistant bubble. To clear a rating, click the same affordance twice.

Or via curl:

```bash
curl -X POST $CL/v1/messages/$MSG_ID/feedback \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "rating": "up", "comment": "good first try" }'
```

## 7. Export the corpus

When you're ready to feed the data into a notebook:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  $CL/v1/feedback/export > corpus.jsonl
```

Each line carries `schema_version: 1`, the chat's `theme`, the rated assistant message + the prompt that triggered it, the rating, the optional comment, and any conversation-level annotation. See [capability 0004](./specs/capabilities/0004-feedback-and-export.md) for the schema.

## What's next

- The full reference for every endpoint: [`recipes.md`](./recipes.md).
- The narrative walkthrough with screenshots: [`user-guide/README.md`](./user-guide/README.md).
- The contract: [`specs/api/openapi.yaml`](./specs/api/openapi.yaml).
- The why: [`specs/capabilities/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/capabilities) and [`specs/adr/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/adr).
