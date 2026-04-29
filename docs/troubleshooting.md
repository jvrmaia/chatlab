# Troubleshooting

If chatlab does something unexpected, the most useful starting points are:

- The console output from `npm start`. The boot banner reports the active workspace, data dir, port, and auth mode.
- The browser console at `/ui`. Network errors and WS reconnect attempts log there.
- `GET /healthz` and `GET /readyz` — the latter only returns 200 once the active storage adapter has finished booting.

If you don't find your symptom below, [open an issue](https://github.com/jvrmaia/chatlab/issues/new/choose) with the boot banner + the failing command.

---

## Process refuses to start

### Exit code 78: bind-safety check

```
chatlab: refusing to bind to 0.0.0.0 without CHATLAB_REQUIRE_TOKEN.
  Either set CHATLAB_HOST=127.0.0.1 (default) or export
  CHATLAB_REQUIRE_TOKEN=<your-shared-secret>.
```

**Cause:** you set `CHATLAB_HOST` to a non-loopback value (e.g. `0.0.0.0`, a Docker bridge IP, a tailnet IP) without setting `CHATLAB_REQUIRE_TOKEN`. chatlab refuses to expose unauthenticated access on the network. Detail in [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#bind-safety).

**Fixes (pick one):**

```bash
# 1. Local-only (default)
unset CHATLAB_HOST                # or CHATLAB_HOST=127.0.0.1
npm start

# 2. Network-exposed with a shared secret
export CHATLAB_HOST=0.0.0.0
export CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)
npm start
```

### `Error: listen EADDRINUSE :::4480`

The port is held by another process — most often a previous `npm start` that didn't shut down cleanly.

```bash
lsof -i :4480 -P              # find the PID
kill <pid>                     # or `kill -9` if it's stuck
# alternative: pick a different port
CHATLAB_PORT=4481 npm start
```

### `npm start` exits silently with no banner

The `dist/` build is missing or stale. Rebuild:

```bash
npm run build && npm start
```

If you're hacking on `src/`, run the watch loop instead:

```bash
npm run dev
```

---

## Native build failures (`npm install`)

### `better-sqlite3` fails to compile

The most common shape is a node-gyp error referencing missing headers or `make` not being on `$PATH`.

**macOS:**
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get install -y python3 build-essential
```

**Windows:** WSL2 is strongly recommended. Native MSVC builds work but require Visual Studio Build Tools + Python 3 in `$PATH`; the troubleshooting surface there is wider than what this page covers.

After installing the toolchain, re-run from a clean state:

```bash
rm -rf node_modules package-lock.json
npm install
```

### `@duckdb/node-api` fails on the install step

DuckDB's prebuild covers `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64`, and Windows. If your platform falls outside that list, the install fails. Workaround: skip DuckDB workspaces — chatlab still works on `memory` and `sqlite` adapters.

You can also limit the test suite to skip DuckDB:

```bash
npm test -- --exclude 'test/storage/duckdb*'
```

---

## API requests fail with 401 / 403

### 401 with `CHATLAB_REQUIRE_TOKEN` set

Your `Authorization: Bearer <token>` doesn't match `CHATLAB_REQUIRE_TOKEN`. Verify:

```bash
echo "$CHATLAB_REQUIRE_TOKEN"            # what the server expects
curl -i -H "Authorization: Bearer $TOKEN" $CL/v1/workspaces
```

In the **default permissive** mode (no `CHATLAB_REQUIRE_TOKEN`), **any non-empty Bearer** is accepted — `dev-token` works fine. An empty header, or a missing `Authorization` line entirely, is the failure mode there.

### 403 from inside the browser UI

The UI sends the token from `localStorage["chatlab.token"]`. If you cleared the storage or never set it, the UI uses the empty string and gets 401. Open DevTools → Application → Local Storage → set `chatlab.token` to your token, then reload.

---

## Agent probe times out or 5xx's

### Cloud provider (OpenAI / Anthropic / DeepSeek / Gemini / Maritaca)

```bash
curl -X POST $CL/v1/agents/$AGENT_ID/probe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "ping" }'
```

If it 5xx's:

1. Check the chatlab console — the underlying error from the provider appears there.
2. Common causes: invalid API key, exhausted quota, model name no longer recognized by the provider, region/availability mismatch (some Gemini and Anthropic models are gated by region).
3. Confirm the model string with `curl https://api.<provider>.com/v1/models -H "Authorization: Bearer $KEY"` (or the provider's equivalent).

### Ollama

```bash
# 1) Confirm Ollama is up
curl http://localhost:11434/api/tags

# 2) Confirm the model is pulled
ollama list | grep llama3

# 3) Confirm it can answer
ollama run llama3 "hello"
```

If `ollama list` is empty, `ollama pull llama3` (or whatever model name the agent uses).

If Ollama runs on a non-default host, the agent's `base_url` must match. The default is `http://localhost:11434/v1` — note the trailing `/v1`, which is Ollama's OpenAI-compat shim, **not** the native `/api/...` path.

---

## Storage and persistence

### Where is my data?

```bash
echo "$CHATLAB_HOME"                                  # default: ~/.chatlab
ls -la "${CHATLAB_HOME:-$HOME/.chatlab}/"
```

Layout:

```
~/.chatlab/
├── workspaces.json              # registry: nicknames, ids, active marker
└── data/
    ├── <workspace-uuid-A>.db        # sqlite workspace
    └── <workspace-uuid-B>.duckdb    # duckdb workspace
```

`memory` workspaces have no on-disk file — restart loses everything in them.

### `DELETE /v1/workspaces/{id}` returns 400

The endpoint requires `?confirm=true` — refusing the destructive action is the default. The flag also removes the on-disk `.db` / `.duckdb` file.

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$CL/v1/workspaces/$WS_ID?confirm=true"
```

### DuckDB workspace media uploads fail or hang

DuckDB's BLOB binding through `@duckdb/node-api` is intentionally narrowed in chatlab — see the `skipMedia` option in `test/storage/_battery.ts`. If you need to attach media, create a `sqlite` workspace for that scenario and a `duckdb` workspace alongside for analytics.

---

## Master key (at-rest encryption)

### Agent probe started failing after I copied my data dir to a new machine

The master key in `$CHATLAB_HOME/master.key` is per-machine. Copying the workspace files (`*.db`, `*.duckdb`) without copying `master.key` leaves the agents' API keys encrypted with a key the new machine doesn't have. Symptoms: probe / chat hits the upstream provider with no key (Ollama works, paid providers 401).

Fix: copy `master.key` too (`scp` it, mode 0600), or pass the old machine's key as `CHATLAB_MASTER_KEY` (base64 of the 32 bytes). If the old key is gone, re-edit each agent and re-paste the API key — the new write encrypts under the new key.

### `CHATLAB_MASTER_KEY` env var rejected at startup

```
Error: CHATLAB_MASTER_KEY must decode to exactly 32 bytes (got <N>)
```

Generate a fresh value:

```bash
export CHATLAB_MASTER_KEY=$(openssl rand -base64 32)
```

The 32-byte requirement is a hard precondition for AES-256-GCM. Don't shrink to 16 (that would be AES-128 territory and the cipher is fixed at 256).

### I want to disable at-rest encryption entirely

Don't. The encryption is a v1.0 GA blocker per [the TRB review](./reviews/2026-04-30-v1.0.0-rc.1.md). The storage adapter accepts plaintext-legacy rows at read time (so old `~/.chatlab` copies upgrade transparently), but every new write encrypts.

If you genuinely have a sandbox where this doesn't matter, pass a fixed throwaway key (`CHATLAB_MASTER_KEY=$(echo -n test | sha256sum | head -c 64 | xxd -r -p | base64)` is a stable test key) and treat the data dir as ephemeral.

## Web UI quirks

### Assistant bubble never appears

Open the **Events** drawer (terminal icon, top-right). If the latest event is `agent.failed`, the agent timed out or 5xx'd — see [agent probe](#agent-probe-times-out-or-5xxs) above.

If the latest event is `chat.user-message-appended` and nothing follows, either the runner is busy with another chat (rare; runtime-bounded inflight) or the agent's HTTP call is hanging. Check the chatlab console.

### WS shows "connection lost — reconnecting…" repeatedly

Most often the chatlab process restarted. Reload the browser — the auto-reconnect uses exponential backoff (0.5 s → 30 s cap) without page reload, but a manual reload guarantees a clean slate.

If chatlab is up and the reconnect still flaps, you may have a reverse proxy in front of `/ws` that's stripping the `Upgrade` header (Cloudflare's "auto" mode does this). Either turn WS upgrades on, or run chatlab's UI directly without the proxy in front.

### Light/dark toggle resets on every page load

The bootstrap script in `index.html` reads `localStorage["chatlab.theme"]`. If your browser blocks localStorage for `127.0.0.1`, the script silently falls back to the system `prefers-color-scheme`. Allow localStorage for that origin, or set `CHATLAB_HOST` to a hostname your browser treats normally.

---

## Tests fail locally

### `1 skipped` is normal

`test/storage/duckdb.battery.test.ts` skips one media-related case by design — DuckDB's BLOB path is intentionally narrowed. The optional storage benchmark (`test/perf/storage-bench.test.ts`) is also skipped unless `CHATLAB_TEST_PERF=1`. Expect `90 passed | 2 skipped`.

### Coverage gate fails after my change

```
ERROR: Coverage for branches (62.4%) does not meet global threshold (65%)
```

Run with the report visible to see which file dropped:

```bash
npm test -- --coverage
```

The report's last column lists uncovered lines per file. Add a test that exercises the missed path. Don't drop the threshold without an ADR — see [ADR 0010 §3](./specs/adr/0010-test-strategy.md).

---

## Still stuck?

- File an issue: [`github.com/jvrmaia/chatlab/issues`](https://github.com/jvrmaia/chatlab/issues). Paste the boot banner + the command that failed + the error.
- For a security-sensitive bug, follow [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md) instead — don't post it publicly.
