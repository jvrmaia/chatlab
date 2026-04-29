# 0010 — Test strategy

- **Status:** Accepted
- **Date:** 2026-04-30
- **Deciders:** @jvrmaia

## Context

chatlab is a local development platform for chat agents. The HTTP surface is medium-sized (~20 paths under `/v1/*` plus health probes), the storage layer is pluggable across three adapters (memory / sqlite / duckdb), and the agent runner reaches out to six LLM providers. Hand-testing every shape on every PR is impractical, and there is no public contract to drift against.

Forces at play:

- The stack is pinned to **Node 22 + TypeScript + Express + React + Vite** ([ADR 0002](./0002-language-and-runtime.md), [ADR 0004](./0004-http-framework.md), [ADR 0005](./0005-web-ui-framework.md)). The test framework should align rather than re-introduce a parallel toolchain.
- The OpenAPI surface is internal and small enough that a contract-testing tier (Prism, Schemathesis) is heavier than the bug it would catch. The OpenAPI YAML is linted on every push (`npx @redocly/cli lint`) and that has been sufficient.
- The Web UI is a single-page React app served from the same Express process. It is exercised by humans during development and by Playwright during the docs-capture screenshot pipeline; no end-user-facing browser regression suite exists yet.
- Coverage gates need to be tight enough to flag real regressions, loose enough to accommodate defensive error paths and unreachable branches that the v8 reporter still scores.

## Decision

The test strategy has two tiers and one auxiliary pipeline. Anything beyond what is listed here is deferred.

### 1. Frameworks

| Layer | Tool | Why |
| --- | --- | --- |
| Unit + integration | **Vitest 2.x** | Native ESM, native TypeScript, watch mode aligned with our Vite UI build ([ADR 0005](./0005-web-ui-framework.md)). Same DX as Jest with less config, no `--experimental-vm-modules` workaround. |
| Screenshot capture | **Playwright** | Drives the real UI in headless Chromium to produce the PNGs embedded in the user guide and capability specs (`npm run docs:capture`). Not used for assertions in v1.0. |

E2E browser regression and accessibility audits (`@axe-core/playwright`) are deferred to a future ADR. They land when the UI has stabilized enough that a regression suite is worth maintaining.

### 2. Test layout

Tests live under `test/`, organized by area (mirroring `src/`):

```
test/
  agents/         provider adapters + AgentRunner integration
  http/           Express routers, with bootHarness() in test/http/_harness.ts
  storage/        cross-adapter battery + per-adapter wiring
  workspaces/     WorkspaceRegistry persistence + atomic writes
  ws/             WebSocket gateway broadcasts
```

Each spec re-uses one of two shared fixtures:

- `test/http/_harness.ts` — `bootHarness()` boots chatlab in a temp `$CHATLAB_HOME`, returns a configured Express request agent. Used by every HTTP router test.
- `test/storage/_battery.ts` — `runStorageBattery()` exercises every namespace (workspaces, agents, chats, messages, feedback, annotations, media). Each adapter's spec calls it; DuckDB's variant skips media because BLOB support there is intentionally narrower (see [ADR 0006](./0006-persistence-engines.md)).

There is **no** `test/contract/`, `test/e2e/`, or `test/capabilities/` tier. Capability `Verification:` checklists are exercised by the existing unit + integration tests organized by area; an explicit per-spec mapping was tried in early drafts and produced index churn without finding regressions.

### 3. Coverage gate

The Vitest config (`vitest.config.ts`) enforces:

| Metric | Threshold |
| --- | --- |
| Lines | **80%** |
| Statements | **80%** |
| Functions | **80%** |
| Branches | **65%** |

Branches are intentionally lower than the other three: every defensive `if (err)` and unreachable error path counts, and forcing 80% there would push contributors to write tests for impossible states.

Coverage is computed over `src/**/*.ts` with the following exclusions:

- `src/ui/**/*` — browser-side; not exercised by Vitest. Will be measured separately when an E2E tier lands.
- `src/cli.ts` — process bootstrap; covered by the manual smoke checklist in [`docs/testing.md`](../../testing.md).
- Pure type-export files (`src/types/domain.ts`, `src/types/feedback.ts`, `src/storage/adapter.ts`) — no runtime code; the v8 reporter still scores them at 0% if included.

The gate is enforced by `npm test -- --coverage`. PRs that drop coverage below threshold do not merge.

### 4. CI gating (PRs to `main`)

The pipeline (separate from this ADR — defined in `.github/workflows/`) enforces:

- `npm run typecheck` — server + UI projects, no errors.
- `npm test` — Vitest suite; coverage gate per §3.
- `npm run build` — server + UI emit successfully.
- `npx @redocly/cli lint docs/specs/api/openapi.yaml` — OpenAPI remains valid.
- Security scans per [ADR 0012](./0012-security-and-dependency-scanning.md): CodeQL, Gitleaks, OSV-Scanner.

Screenshot capture (`npm run docs:capture`) is **not** a PR gate — it's a documentation build step, run after UI changes. The PR description should mention which screenshots were regenerated.

### 5. What is intentionally out of scope for v1.0

- **Contract testing (Prism / Schemathesis / openapi-diff).** No external contract to honor; redocly lint + the integration tests cover the real risk.
- **Browser E2E regression suite.** The Playwright machinery exists for screenshots only. A real regression suite waits for the UI to settle.
- **Accessibility audits.** [`@axe-core/playwright`](https://www.npmjs.com/package/@axe-core/playwright) is a likely future dependency; not blocking v1.0.
- **Per-capability test plan files (`docs/specs/tests/capabilities/NNNN.test.md`).** The active flow goes spec → code → test directly.

These reappear in their own ADRs when there is a concrete need.

## Consequences

- **Positive:** the tier list is honest. Two tools, one CI gate, one coverage gate — readable in a glance, easy to keep accurate.
- **Positive:** Vitest's parallel forks keep the full suite (~90 tests) under 2 s on a laptop, so coverage runs on every PR are cheap.
- **Positive:** the layout under `test/` mirrors `src/` 1:1 — a new contributor knows exactly where a test for `src/foo/bar.ts` belongs.
- **Negative:** no automated drift detection on the OpenAPI shape. If a router changes a response schema without updating the YAML, the redocly lint passes (the YAML is still internally valid) and the integration test passes (it asserts what the code returns, not what the spec promises). Mitigation: the OpenAPI is small enough that PR review catches this; if it stops being small, add an openapi-diff job.
- **Negative:** `src/ui/**` coverage is opaque until the E2E tier lands. The user guide screenshots and the manual smoke checklist are the partial substitutes.

## Alternatives considered

- **Add a contract-testing tier (Prism + Schemathesis) anyway.** Rejected. The cost is real (extra CI minutes, an extra dependency) and the bug it catches — internal HTTP shape drift — is already caught by the integration tests, which assert exact response bodies.
- **Per-capability test files (`test/capabilities/NNNN.test.ts`).** Rejected. Produced an index that needed maintaining alongside both the spec and the area-organized tests, with no improvement in regression detection.
- **Higher branches threshold (e.g., 80%).** Rejected. Would force tests for unreachable error paths and `instanceof` guards on values that can't fail in practice, without flagging real gaps.
- **Jest instead of Vitest.** Rejected. ESM-first defaults of Vitest match our `"type": "module"` `package.json` ([ADR 0002](./0002-language-and-runtime.md)) without `--experimental-vm-modules` workarounds.
- **Cypress instead of Playwright** (when E2E lands). Open. Cypress' single-tab single-origin model would force workarounds for the multi-actor flows; Playwright is multi-context-native. Final call deferred to the ADR that introduces the E2E tier.
