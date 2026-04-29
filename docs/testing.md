# Testing

How to run the test suite, what's covered, and how to add more.

## Run all tests

```bash
npm test
```

Expected output as of v1.0.0-rc.1:

```
 ✓ test/agents/anthropic.test.ts (5 tests)
 ✓ test/agents/openai-compat.test.ts (4 tests)
 ✓ test/agents/runner.test.ts (2 tests)
 ✓ test/agents/runner-swap.test.ts (1 test)
 ✓ test/core/retention.test.ts (4 tests)
 ✓ test/http/agents-router.test.ts (8 tests)
 ✓ test/http/auth.test.ts (4 tests)
 ✓ test/http/chats-router.test.ts (5 tests)
 ✓ test/http/feedback-router.test.ts (6 tests)
 ✓ test/http/media-router.test.ts (5 tests)
 ✓ test/http/server.test.ts (3 tests)
 ✓ test/http/workspaces-router.test.ts (6 tests)
 ✓ test/storage/duckdb.battery.test.ts (8 tests | 1 skipped)
 ✓ test/storage/encryption.test.ts (3 tests)
 ✓ test/storage/memory.test.ts (8 tests)
 ✓ test/storage/sqlite.test.ts (8 tests)
 ✓ test/workspaces/registry.test.ts (7 tests)
 ✓ test/ws/gateway.test.ts (4 tests)

 Test Files  18 passed | 1 skipped (19)
      Tests  90 passed | 2 skipped (92)
```

## Coverage

```bash
npm test -- --coverage
```

Thresholds (in [`vitest.config.ts`](../vitest.config.ts)): **80% lines / 80% statements / 80% functions / 65% branches**. Branches lag because every defensive `if (err)` and unreachable error path counts; 65% is a pragmatic floor that flags real gaps.

The browsable documentation site (`docs-site/`, Docusaurus) is built on every PR touching `docs/**` or `docs-site/**` via `.github/workflows/lint-docs.yml`. Broken links to paths outside `docs/` surface as **warnings** during `npm run build` (`onBrokenLinks: 'warn'`).

Coverage excludes:
- `src/ui/**/*` (browser-side, will be E2E-tested when Playwright tier lands per ADR 0010)
- `src/cli.ts` (process bootstrap)
- Pure type-export files (no runtime code)

## Test layout

```
test/
  agents/
    anthropic.test.ts          provider — system field split, x-api-key, error paths
    openai-compat.test.ts      provider — Bearer auth, body shape, parse, error paths
    runner.test.ts             AgentRunner — chat → agent → reply (success + failure)
  http/
    _harness.ts                bootHarness() — boots chatlab in a temp $CHATLAB_HOME
    agents-router.test.ts      /v1/agents CRUD + /probe + 409 on referenced delete
    auth.test.ts               Bearer guard
    chats-router.test.ts       /v1/chats CRUD + message append + assistant reply integration
    feedback-router.test.ts    /v1/messages/{id}/feedback + /v1/chats/{id}/annotation + JSONL export
    media-router.test.ts       /v1/media upload + GET + download + DELETE
    server.test.ts             /favicon.ico, /healthz, /readyz
    workspaces-router.test.ts  /v1/workspaces CRUD + activate + ?confirm guard
  storage/
    _battery.ts                cross-adapter test battery — every namespace
    memory.test.ts             runs the battery against MemoryAdapter
    sqlite.test.ts             runs the battery against SqliteAdapter
    duckdb.battery.test.ts     runs the battery against DuckDbAdapter (skips media)
  workspaces/
    registry.test.ts           WorkspaceRegistry — bootstrap, CRUD, atomic-write
  ws/
    gateway.test.ts            WS hello, ping/pong, chat-event broadcast
```

## Capturing UI screenshots (`docs:capture`)

The User Guide and several capability specs embed PNGs of the Web UI. They're produced by a Playwright capture script under [`docs/_capture/`](https://github.com/jvrmaia/chatlab/tree/main/docs/_capture) that boots chatlab in a temp `$CHATLAB_HOME`, drives the UI to a known state, and writes PNGs to [`docs/_assets/screenshots/`](https://github.com/jvrmaia/chatlab/tree/main/docs/_assets/screenshots).

```bash
npm run docs:capture:install   # one-time chromium download
npm run docs:capture
```

The capture is **not** part of `npm test` — it's a docs build step, not an assertion. Re-run after any UI change.

## Optional E2E suite (`test/e2e/`)

Per [ADR 0010 §5](./specs/adr/0010-test-strategy.md), browser-regression E2E is opt-in. The skeleton lives at [`test/e2e/`](https://github.com/jvrmaia/chatlab/tree/main/test/e2e) and is gated on `CHATLAB_TEST_E2E=1`:

```bash
CHATLAB_TEST_E2E=1 npx playwright test --config=test/e2e/playwright.config.ts
```

The smoke spec (`test/e2e/smoke.spec.ts`) requires a local Ollama running on `localhost:11434` with `llama3` pulled. It boots chatlab in-process on an ephemeral port, runs the happy path (configure agent → chat → rate → export), and asserts the JSONL `schema_version: 1`. Promoted to a CI gate when capability `0007-eval-harness` lands.

## Add a new test

1. Pick a file under the relevant directory.
2. Use `bootHarness()` from `test/http/_harness.ts` for HTTP-level tests, or `runStorageBattery()` from `test/storage/_battery.ts` if you're adding a new storage adapter.
3. Run `npm test` — it picks the new test up automatically.

## Manual smoke (~5 minutes before tagging a release)

1. Boot chatlab with `npm start` — confirm banner says `chatlab listening on http://127.0.0.1:4480`, mentions active workspace.
2. Open `/ui` — confirm UI loads, **no 401s in the console** for assets / favicon, **no 404s**.
3. Admin → Agents → create an Ollama profile (or OpenAI with a real key). Probe with `Olá` — confirm reply.
4. Admin → Workspaces → create `experiment-1` with sqlite. Activate. Confirm chat list refreshes (empty).
5. Chats tab → + New chat → pick the agent + theme `"Aprendendo Python"`. Send `Olá` — confirm assistant bubble within ~2 s.
6. Open another chat with the same agent + theme `"Receitas"` — confirm context segregation.
7. Switch back to `default` workspace — confirm chat list reflects `default`'s data.
8. Rate an assistant reply 👍, write an annotation, reload — both persist.
9. `GET /v1/feedback/export` — confirm JSONL with `schema_version: 1`.
10. Final `Ctrl+C` — confirm clean shutdown.
