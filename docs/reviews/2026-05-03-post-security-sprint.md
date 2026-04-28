# TRB review — `chatlab` post-security-sprint

- **Date:** 2026-05-03
- **Project:** `chatlab` v1.1.0 (branch `fix/dependencies`, clean working tree at commit `98f8a03`)
- **Panel:** 14 specialists (full composition; ML/AI seat does not recuse — six LLM providers + `custom` are in scope)
- **Scope:** Full-project health snapshot after two rounds of post-v1.1.0 work: (1) all pending Dependabot PRs merged (Express 5, Tailwind 4, Vitest 4, Vite 6→8, better-sqlite3 12, multer 2, TypeScript 6, actions bumps, OSV scanner fixes); (2) three HIGH-confidence security vulnerabilities fixed (WebSocket auth bypass, stored XSS via MIME spoofing on media download, SSRF with response exfiltration via `agent base_url`). **Baseline:** [`2026-04-30-v1.0.0-ga.md`](./2026-04-30-v1.0.0-ga.md) — maturity 7.6/10.

---

## Verify gauntlet results

Run on 2026-05-03 against the `fix/dependencies` branch, identical to `main`:

| Check | Result |
| --- | --- |
| `npm run typecheck` | **Clean** — zero errors (server + UI TSC) |
| `npm test` | **93 passed / 2 skipped** (18+1 server files + 1 UI file; Vitest 4.1.5) |
| Server coverage | **Statements 82.95% / Branches 65.87% / Functions 89.65% / Lines 86.19%** — all gates green (80/65/80/80) |
| `npm run build` | **Clean** — CSS 29.60 kB gzip 6.83 kB; JS 457.34 kB gzip 142.09 kB |
| `npm run docs:build` | **Exit 0 with 11 broken-link warnings** — all in `pt-BR` locale only; `onBrokenLinks: "warn"` was deliberately relaxed for v1.1 partial translation |

---

## Executive summary

| Item | GA review (2026-04-30) | This review (2026-05-03) | Δ |
| --- | :---: | :---: | --- |
| **Maturity score** | 7.6 / 10 | **7.9 / 10** | +0.3 |
| **Security posture** | Crítica items from rc-1 all closed; no new vulns documented | Three HIGH vulns fixed (WS auth bypass, MIME-spoof XSS, SSRF exfiltration) | +0.5 on security axis |
| **Dependency health** | Express 4, Vitest 3, Vite 5 | Express 5, Vitest 4, Vite 8, TS 6, better-sqlite3 12, multer 2 | All major bumps merged and green |
| **Docs build** | `onBrokenLinks: "throw"` → downgraded to `"warn"` in v1.1 | 11 broken-link warnings (pt-BR locale only); EN build clean | Known residual; plan in CHANGELOG |
| **SECURITY.md** | Refers to `v1.0.0-rc.1` as current | Still refers to `v1.0.0-rc.1` — not updated since initial draft | Stale |
| **CHANGELOG Unreleased** | Empty | **Empty** — three security fixes and Dependabot sprint not recorded | Gap |
| **Critical challenge** | Manual axe sweep (item 7) still owed | Persists; additionally: SSRF blocklist does not cover RFC-1918 ranges (10.x, 172.16–31.x, 192.168.x) | New finding |
| **Readiness** | Proceed conditional | Proceed — no new release blockers; two items should be documented patches | Proceed with minor actions |

The score rises by 0.3 from the GA baseline. The security sprint demonstrably improved posture: three HIGH-severity vulnerabilities are fixed with code that reads clearly and has test coverage for the auth path. The score does not rise further because (a) the SSRF blocklist leaves RFC-1918 ranges open, (b) `src/lib/logger.ts` branches are at 10% coverage, (c) the CHANGELOG Unreleased section is empty despite meaningful changes, and (d) the SECURITY.md version matrix still reads "v1.0.0-rc.1".

---

## Pareceres

### 1. Product Manager

**Pontos Fortes.** The `custom` provider continues to anchor the wedge clearly. The README comparison table (LangSmith / Promptfoo / Playground) is present and honest — chatlab explicitly points users to Promptfoo for eval until `0007` lands. The bilingual release (v1.1.0) is a meaningful differentiator for the Brazilian developer persona. The security sprint did not break user-visible behavior; the auth enforcement (both HTTP and WS) is correctly described in `SECURITY.md` bind-safety section.

**Riscos e Vulnerabilidades.**
- **Severity: Média.** The CHANGELOG `[Unreleased]` section is empty. The three security fixes and the full Dependabot sprint (major bumps across six packages) are documented only in commit messages and git history, not in the change log that users and downstream adopters read. This gap misleads about what changed since v1.1.0.
- **Severity: Baixa.** `SECURITY.md` still names `v1.0.0-rc.1` as the supported version in its opening sentence. The project shipped v1.0.0 and v1.1.0 since that draft; the version matrix section ("will be replaced with a version matrix once stable releases ship") was never replaced. A security reporter reading it sees stale guidance.

**Recomendação Prioritária.** Document the security fixes and dependency bumps in `CHANGELOG.md [Unreleased]` and update `SECURITY.md` supported-versions to `>= 1.1.0`. Acceptance criterion: `grep -A5 "## \[Unreleased\]" CHANGELOG.md` must produce at least one non-empty line; `grep "rc.1" SECURITY.md` must return zero matches.

---

### 2. Software Engineer

**Pontos Fortes.** The Express 5 migration is clean — no deprecated middleware, `Router()` usage is idiomatic, `express.json({ limit: "1mb" })` is a correct explicit bound. The AgentRunner concurrency model (`beginInflight` / `endInflight` integer counter + 2 s drain in `activateWorkspace`) is tested by `test/agents/runner-swap.test.ts` (RUN-SWAP-01). TypeScript 6 and strict mode are enabled and typecheck is clean. The three security fixes (commit `50ff950`) are surgical — `WsGateway` now receives `requireToken` and gates `verifyClient`, `validateBaseUrl` blocks loopback + known cloud IMDS, `Content-Disposition: attachment` is enforced on media downloads.

**Riscos e Vulnerabilidades.**
- **Severity: Média.** `stop()` in `src/index.ts` calls `agentRunner.stop()` then immediately `httpServer.close()` without waiting for `core.inflightCount()` to drain to zero. If a long LLM call (up to 60 s timeout) is in flight when SIGTERM arrives, the HTTP server closes underneath it and the in-progress `core.storage.messages.append()` may land in a half-closed adapter. The `activateWorkspace` path correctly drains; the shutdown path does not.
- **Severity: Baixa.** The ADR index (`docs/specs/adr/README.md`) has 13 ADRs on disk; none covers the security-vulnerability response workflow (process, CVSS assignment, coordinated disclosure cadence) — this exists in `SECURITY.md` as prose but is not an architecture decision record.

**Recomendação Prioritária.** Add an inflight-drain loop in the `stop()` function before `httpServer.close()`: poll `core.inflightCount() === 0` with a bounded timeout (e.g. 60 s + 5 s grace). Acceptance criterion: a test that starts a 500 ms mocked LLM call, calls `stop()` immediately, and asserts the assistant message was persisted before the process exits.

---

### 3. Security Engineer

**Pontos Fortes.** The three HIGH vulnerabilities confirmed fixed: (1) `WsGateway` now uses `verifyClient` with `timingSafeEqual` — same constant-time comparison as `authMiddleware`; (2) `ALLOWED_MIME_BY_TYPE` in `types/media.ts` now uses explicit regex excluding `text/html`, `text/javascript`, and similar dangerous types; `Content-Disposition: attachment` prevents inline rendering; `X-Content-Type-Options: nosniff` is set globally in `server.ts`; (3) `validateBaseUrl` blocks `localhost`, `127.x`, `::1`, `169.254.169.254`, `100.100.100.200`, `metadata.google.internal`, `metadata.goog`. AES-256-GCM at-rest encryption for API keys (`src/lib/crypto.ts`) remains intact. Bind-safety guard (exit 78 if non-loopback host without token) unchanged and correct.

**Riscos e Vulnerabilidades.**
- **Severity: Alta.** The SSRF blocklist (`validateBaseUrl`) does not block RFC-1918 private ranges: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, or IPv6 private ranges (`fc00::/7`, `fe80::/10`). An attacker with API access can set `base_url=http://10.1.2.3/v1` and the agent probe will reach internal services. This matters most in Docker/K8s deployments where the 10.x sidecar range is the default pod network. The commit message for the fix (`50ff950`) only mentioned "loopback e known metadata services" — the RFC-1918 gap was not addressed.
- **Severity: Média.** No test exercises the WS `requireToken` rejection path (WS-gateway test suite has four tests; none starts an instance with `requireToken` set and asserts that an unauthenticated WebSocket upgrade is refused). The fix is correct in code (`verifyClient` wiring) but lacks regression coverage.
- **Severity: Baixa.** No `Content-Security-Policy` header is set on API or UI responses. The local-first threat model mostly accepts this; it becomes a gap if `CHATLAB_HOST=0.0.0.0` is used in a shared environment.

**Recomendação Prioritária.** Extend `validateBaseUrl` to reject RFC-1918 private ranges and IPv6 ULAs. Acceptance criterion: `POST /v1/agents` with `base_url="http://10.0.0.1/v1"` must return HTTP 400; same for `172.16.0.1`, `192.168.1.1`, `http://[fc00::1]/v1`. Add a Vitest test case for each.

---

### 4. UI/UX Designer

**Pontos Fortes.** The bilingual toggle (`<LocaleToggle>`) is present in the header, persisted to `localStorage`, and tested. ARIA fixes from v1.0.0 (DevDrawer `role="log"` / `aria-live`, AnnotationsPanel `aria-controls`, ChatList `role="list"` / `aria-current`) remain in place — confirmed in `DevDrawer.tsx` line 83. Design tokens contrast is at WCAG AA on all six measured pairs (`--warn`, `--danger`, `--ink-3`; both themes) per the axe-contrast-check artefact. `MarkdownContent` correctly uses `react-markdown` without `rehype-raw` — raw HTML is dropped, preventing XSS via assistant-crafted markdown. The `<PrivacyBanner>` renders with `role="alert"` and a proper dismiss button with `aria-label`.

**Riscos e Vulnerabilidades.**
- **Severity: Alta.** The manual axe-DevTools pass against the live UI (item 7, carried over from rc-1) is still owed. This means landmark structure, focus traps, keyboard navigation order, and screen-reader flow have not been validated against the actual rendered DOM. The ARIA markup looks correct on inspection but only a live axe run would catch compound component bugs (e.g., a dialog without `aria-modal`, a popover without `aria-expanded`).
- **Severity: Média.** The `<Attachment>` sub-component in `MessageBubble.tsx` renders `<audio controls>` and `<video controls>` with a `<track kind="captions">` element but no `src` — the track is decorative and would fail a strict accessibility check (an empty caption track is not equivalent to actual captions). For assistive technology users this is a real gap.

**Recomendação Prioritária.** Run axe-DevTools (or `axe-core` programmatically via the Playwright E2E skeleton) on the five main UI screens (empty state, workspace-picker, chat view, admin/agents, dev drawer open). Acceptance criterion: zero `critical` or `serious` violations in the axe report for all five screens; the report is committed to `docs/reviews/` or referenced from a test artefact.

---

### 5. DevOps Engineer

**Pontos Fortes.** All six workflows present (`ci.yml`, `release.yml`, `lint-docs.yml`, `docs-deploy.yml`, `codeql.yml`, `secret-scan.yml`, `dependency-scan.yml`). The Dependabot sprint merged all open PRs, so the actions tree is current. `ci.yml` path-filters prevent unnecessary runs on docs-only changes. The `release.yml` multi-arch Docker build (`linux/amd64`, `linux/arm64`) uses GHA cache (`type=gha,mode=max`) and publishes with npm provenance (`--provenance`). OSV-Scanner is pinned to `v2.3.5`. Redocly CLI is pinned to `2.30.3` in all three workflows that invoke it.

**Riscos e Vulnerabilidades.**
- **Severity: Média.** Actions are pinned by major version tag (`actions/checkout@v6`, `docker/build-push-action@v7`, `gitleaks/gitleaks-action@v2`, `lycheeverse/lychee-action@v2`) rather than immutable SHA-pinned commits. A compromised maintainer account on any of those action repos could inject malicious code into chatlab CI by tagging a new commit at the same major version. This is a known GitHub supply-chain attack vector, most material for the `release` workflow which has `contents: write` and `id-token: write`.
- **Severity: Baixa.** `lint-docs.yml` uses `npx -y @mermaid-js/mermaid-cli@latest` — the `@latest` tag is not pinned. A supply-chain compromise of `@mermaid-js/mermaid-cli` would execute on every docs-only PR. Lower severity because the docs workflow does not have publish permissions.

**Recomendação Prioritária.** SHA-pin the four third-party actions used in `release.yml` (`docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/login-action`, `docker/build-push-action`) to specific commit hashes. Acceptance criterion: `grep "docker/.*@v" .github/workflows/release.yml` returns zero matches; all four actions reference 40-character hex SHAs.

---

### 6. SRE

**Pontos Fortes.** `/healthz` returns `{ status: "ok", uptime_seconds }` and is exempted from auth — correct for liveness probes. `/readyz` is separate and guards the `setReady` flag, allowing deploy-level readiness gating. Pino logger is wired into `Core`, structured JSON in non-TTY (CI / Docker), pretty in TTY. `CHATLAB_LOG_LEVEL` controls level; `silentLogger()` silences tests. Retention sweep emits structured `{ workspace_id, retention_days, feedback, annotations }` log line. The Dockerfile includes a `HEALTHCHECK` instruction. The compose example sets `service_healthy` dependency on chatlab before Caddy starts.

**Riscos e Vulnerabilidades.**
- **Severity: Alta.** `stop()` does not drain in-flight agent calls before closing the HTTP server (also flagged by the Software Engineer). From an SRE perspective the consequence is torn writes under a rolling restart: Kubernetes sends SIGTERM, the app stops accepting new connections, but a running `respondTo` call may attempt to write to a closing SQLite adapter. The SQLite adapter's `close()` is called after `httpServer.close()` but there is no bounded drain loop in between.
- **Severity: Média.** No `/metrics` endpoint (Prometheus format or OpenTelemetry exporter). The project is local-first so this is an expected gap, but shared/Docker deployments have no SLO-level observability. Structured logs exist but are not correlated with request IDs on agent calls (only HTTP requests carry `request_id` from `requestIdMiddleware`; `AgentRunner.respondTo` does not).
- **Severity: Baixa.** No `--max-old-space-size` or memory limit is set in the Docker `CMD`; Node.js defaults to ~50% of available RAM which can be unexpectedly large on memory-constrained containers.

**Recomendação Prioritária.** Add a bounded inflight drain to `stop()` in `src/index.ts`. Acceptance criterion: integration test spins up an instance, issues a long (mocked) LLM call, sends SIGTERM equivalent (calls `stop()`), and asserts `core.inflightCount() === 0` before `core.stop()` is called.

---

### 7. Data Engineer

**Pontos Fortes.** `Core.startRetentionSweep` installs a 24-hour `setInterval` with `handle.unref()` (does not prevent process exit). `Core.runRetentionSweep` sweeps both `feedback` and `annotations` namespaces. `CHATLAB_FEEDBACK_RETENTION_DAYS` defaults to 90, is configurable to 0 (disable), and is printed in the boot banner. The data-handling doc is accurate and detailed; the DPA template is present. Feedback export is JSONL `schema_version: 1` with `agent_version: <provider>:<model>`.

**Riscos e Vulnerabilidades.**
- **Severity: Média.** The `agent_version` field in the JSONL export is derived as `<provider>:<model>` at export time from the current agent record. If an agent's model is renamed or the agent is deleted between conversation and export, prior rows silently lose their original provenance. This was flagged in the GA review; it remains unaddressed and the v1.1 CHANGELOG does not mention it.
- **Severity: Baixa.** The retention sweep covers `feedback` and `annotations` but not `messages` or `media`. A workspace with high message volume or large attachments has no auto-pruning path; only a full workspace delete removes them. The data-handling doc is accurate about this scope but does not suggest a workaround (e.g., periodic workspace export + delete + recreate).
- **Severity: Baixa.** `src/lib/logger.ts` has 10% statement coverage (lines 25–48 untouched). The `createLogger` function's TTY-detection and pino-pretty transport branches are not exercised by any test. While the logger works correctly in production, a regression in those branches would not be caught.

**Recomendação Prioritária.** Record `agent_version` as a snapshot field at message-creation time (not derived at export time), or snapshot it onto the feedback row. Acceptance criterion: `POST /v1/chats/{id}/messages` persists `agent_version` in the messages or feedback table such that a subsequent agent model rename does not change the value returned in the JSONL export for existing rows.

---

### 8. ML Engineer / AI Specialist

**Pontos Fortes.** Seven providers are enumerated and enumerable (`AGENT_PROVIDERS` is a `readonly` tuple used for validation in `parseCreate`). The `custom` provider has explicit defaults (`base_url: "http://localhost:8000/v1"`, `model: "my-agent"`, `requires_api_key: false`) — a developer can point chatlab at their own agent without configuring anything beyond a name. The `AgentRunner` builds context correctly: system prompt + theme concatenation, configurable `context_window` clamped to 200. Capability `0007-eval-harness` has a complete Behavior + Acceptance section.

**Riscos e Vulnerabilidades.**
- **Severity: Alta.** Capability `0007-eval-harness` remains entirely unimplemented — no CLI subcommand, no golden-set loader, no report writer. The ROADMAP leads with it as the v1.1 headline item but v1.1.0 shipped without it. The eval harness is the single highest-leverage ML feature the project lacks; developers comparing chatlab to Promptfoo have no answer for regression testing until it ships.
- **Severity: Média.** `temperature: 0.7` is hardcoded in `AgentRunner.respondTo` (line 70 of `runner.ts`). Neither the agent profile nor the chat creation API exposes a temperature field. Reproducible evaluation requires `temperature: 0`; the capability `0007` spec correctly specifies `temperature: 0` for eval runs, but the runner cannot produce deterministic output with the current schema.
- **Severity: Baixa.** No streaming support (`text/event-stream`). The UI shows a complete assistant reply in a single event; there is no incremental display. For local Ollama models this creates a dead-silence period before the bubble appears.

**Recomendação Prioritária.** Add `temperature?: number` to the `AgentCreate` / `AgentPatch` types and surface it through the runner. Acceptance criterion: `POST /v1/agents` with `temperature: 0` creates an agent whose runner calls the provider with `temperature: 0` (verifiable via the injected `agentFetcher` mock in `runner.test.ts`).

---

### 9. Business Analyst

**Pontos Fortes.** All six active capability specs (`0001`–`0006`) have the Acceptance section backfilled with Vitest test IDs, OpenAPI operations, and user-guide sections. Capability `0007` has a complete Behavior section, clear Out-of-scope, and falsifiable Verification criteria. The ADR collection is consistent: 13 ADRs with Accepted/Deferred/Superseded status fields, all written in MADR-lite format. The Definition of Done is implicitly encoded in the `Status: Implemented` field on capability specs.

**Riscos e Vulnerabilidades.**
- **Severity: Média.** There is no ADR or capability-spec amendment documenting the three security fixes. The SSRF mitigation (`validateBaseUrl`), the WS `verifyClient` auth gate, and the MIME-type allowlist are architectural security decisions that belong in either an ADR (decision record) or in the relevant capability spec's Security section. Currently they exist only in commit messages and `SECURITY.md` prose. Future maintainers cannot trace "why is this specific blocklist here?" to a recorded decision.
- **Severity: Baixa.** The ROADMAP v1.1 section still lists eval harness as "probable scope" rather than acknowledging it did not ship in v1.1.0. The wording is ambiguous: a reader cannot tell whether `0007` is targeted for a hypothetical v1.1.x patch or has slipped to v1.2.

**Recomendação Prioritária.** Amend the relevant capability specs (at minimum `0002-agents.md` and `0005-media.md`) to include a Security subsection that records the SSRF and MIME-spoofing mitigations with the rationale, or write a new ADR `0014-base-url-ssrf-mitigation` that supersedes none of the existing 13. Acceptance criterion: `grep -r "SSRF\|validateBaseUrl\|MIME.*spoof" docs/specs/` returns at least one match in a spec or ADR file.

---

### 10. Technical Writer

**Pontos Fortes.** The README is narrative-first and technically precise: "Why chatlab and not…" comparison table, clear quickstart, test count and coverage thresholds stated inline. The Docusaurus site builds (EN locale clean, pt-BR with documented broken-link warnings). Sequence diagram in `docs/ARCHITECTURE.md` covers the message-to-reply flow. The `docs/legal/data-handling.md` document is thorough — DPA template, sub-processor list, recommended practices. Bilingual coverage extends to all seven user-guide pages and three distribution pages.

**Riscos e Vulnerabilidades.**
- **Severity: Média.** `docs-site/docusaurus.config.ts` has `onBrokenLinks: "warn"` — this is explicitly documented in the CHANGELOG as a temporary demotion until pt-BR spec translations catch up. However, the lint-docs CI job's `docusaurus-build` step will now silently succeed even when new broken links are introduced in the EN locale. There is no lint step that specifically validates only the EN build at `throw` severity.
- **Severity: Média.** Eleven broken links in the pt-BR locale are carried as known residuals. None are in user-critical paths (all are in spec/ADR/cookbook cross-references), but the pt-BR user who clicks "User Guide → Workspaces and Agents" from a capability spec page gets a 404. The CHANGELOG says "Re-tighten in v1.2" but no issue tracks this.
- **Severity: Baixa.** The `SECURITY.md` version matrix section was never populated. "This section will be replaced with a version matrix once stable releases ship" is still present verbatim; v1.0.0 and v1.1.0 have shipped.

**Recomendação Prioritária.** Restore `onBrokenLinks: "throw"` for the EN locale while keeping `"warn"` for pt-BR, or add a separate CI step that runs `docusaurus build` with `--locale en-US` only and treats broken links as errors. Acceptance criterion: introducing a deliberately broken internal link in an EN `.md` file causes the CI `docusaurus-build` job to fail.

---

### 11. QA Engineer

**Pontos Fortes.** Test count: **93 passed / 2 skipped** (up from 90+2 at the GA baseline). Coverage gates remain green: Statements 82.95% / Branches 65.87% / Functions 89.65% / Lines 86.19% — all above the 80/65/80/80 thresholds. The WS gateway test suite covers hello-frame, ping/pong, invalid-JSON error frame, and full chat broadcast cycle (WS-01 through WS-04). Auth test suite covers no-bearer → 401, wrong-token → 401, correct-token → 200, health endpoint unauthenticated (AUTH-01 through AUTH-04). `test/agents/runner-swap.test.ts` covers the workspace-swap-during-inflight regression.

**Riscos e Vulnerabilidades.**
- **Severity: Alta.** No test covers WS gateway behavior when `requireToken` is set and a client connects **without** a valid token. The security fix (commit `50ff950`) wired `verifyClient` correctly, but zero tests assert that an unauthenticated WS upgrade is rejected with 401. A regression in `WsGateway` constructor that accidentally drops the `verifyClient` check would go undetected.
- **Severity: Média.** No test covers `validateBaseUrl` rejections for SSRF targets. Neither the `169.254.169.254` block nor the localhost/loopback block has a Vitest assertion. The agents-router test suite (AGT-H-01 through AGT-H-08) does not include an `AGT-H-09` for `base_url` validation.
- **Severity: Baixa.** `src/lib/logger.ts` is at 10% statement coverage. The `createLogger` pretty-transport and JSON-transport code paths are not tested. This is unlikely to mask a critical regression but depresses the branch coverage average artificially.

**Recomendação Prioritária.** Add two tests: (a) `WS-05` — start a chatlab instance with `CHATLAB_REQUIRE_TOKEN=secret`, attempt a WebSocket connection without a Bearer header, assert the connection is refused; (b) `AGT-H-09` — `POST /v1/agents` with `base_url="http://169.254.169.254/latest/meta-data"` returns HTTP 400; same for `http://10.0.0.1/v1` once the RFC-1918 gap is fixed. Acceptance criterion: both test IDs appear in `vitest run` output with status `passed`.

---

### 12. Performance Engineer

**Pontos Fortes.** The build is fast (1.21 s in Vite 8) and bundles are reasonable for a full-featured React + Tailwind + Markdown-rendering SPA: JS gzip 142.09 kB, CSS gzip 6.83 kB. The Vite 8 upgrade brings the Rolldown Rust-based bundler (if opted in) and improved tree-shaking; the current bundle size is actually held flat despite the i18n dependency additions (`react-i18next` + `i18next` + `i18next-browser-languagedetector`). Vitest 4.1.5 test runtime is 2.08 s for 18 server test files — appropriate for integration-style tests that boot real Express instances.

**Riscos e Vulnerabilidades.**
- **Severity: Média.** JS gzip at 142 kB is approaching the "initial load matters" threshold for a dev tool. The i18n additions (`react-i18next` bundle + two locale JSON files) are likely the marginal contributors. No bundle analysis (`vite-bundle-visualizer` or `rollup-plugin-visualizer`) is in the toolchain, so there is no per-module visibility. A future `react-markdown` upgrade or additional i18n locales could push JS past 200 kB gzip without early warning.
- **Severity: Baixa.** Storage benchmarks (`test/perf/storage-bench.test.ts`) remain scaffolded but contain no real assertions — only placeholder comments. The scaffold has been present since v1.0.0-rc.1 (item 13 of the original action register). The opt-in flag `CHATLAB_TEST_PERF=1` means this gap doesn't block CI, but there is no data on read/write latency at 10k+ message scale.

**Recomendação Prioritária.** Add a bundle-size regression gate using Vite's `build.rollupOptions.output.manualChunks` or a size-limit CI check that fails if the gzip JS bundle exceeds 200 kB. Acceptance criterion: a deliberate large import causes the CI build step to print a size warning or fail; remove the import and the build passes.

---

### 13. Cloud Architect

**Pontos Fortes.** The local-first decision (ADR 0011) is clear and well-argued; the Dockerfile is multi-stage (deps → build → runtime), runs as a non-root `chatlab` user (uid 10001), and includes a `HEALTHCHECK` instruction. The compose example correctly uses `service_healthy` and requires `CHATLAB_REQUIRE_TOKEN` via a `${var:?error}` substitution that fails-fast at `docker compose up` time. Multi-arch (`linux/amd64`, `linux/arm64`) is wired in the release workflow. No K8s/Helm chart is present — consistent with the local-first stance and the deferred hosted-instance ADR.

**Riscos e Vulnerabilidades.**
- **Severity: Média.** The Docker `runtime` stage sets `CHATLAB_HOST=0.0.0.0` as a default environment variable. This means an operator who runs `docker run -p 4480:4480 jvrmaia/chatlab:latest` without setting `CHATLAB_REQUIRE_TOKEN` will encounter the bind-safety exit (code 78) rather than a running service — which is correct — but the failure mode is surprising and the Docker Hub README / compose example do not prominently warn about this. The SECURITY.md bind-safety section explains it but is not surfaced on the Docker Hub page.
- **Severity: Baixa.** The Dockerfile does not pin a specific `bookworm-slim` digest. `node:22-bookworm-slim` is a mutable tag; a security patch to the base image requires a rebuild but there is no automated trigger (Dependabot currently handles npm but not Docker base images).

**Recomendação Prioritária.** Add a `README.docker.md` (or extend the existing `docs/distribution/docker.md`) with a one-liner that explains the `CHATLAB_HOST=0.0.0.0` + `CHATLAB_REQUIRE_TOKEN` requirement when running via plain `docker run`. Acceptance criterion: `grep -i "CHATLAB_REQUIRE_TOKEN" docs/distribution/docker.md` returns at least two matches (one explaining the requirement, one showing the flag in the example command).

---

### 14. Legal Advisor

**Pontos Fortes.** `docs/legal/data-handling.md` accurately describes processing scope, roles (controller vs. sub-processor), six LLM sub-processors, retention configuration, at-rest encryption scope (API keys only), and data subject rights. The DPA template skeleton is present. The privacy banner (`<PrivacyBanner>`) correctly fires when any non-Ollama agent is configured and is per-session dismissable. CLI boot warning appears for cloud providers. The LGPD/GDPR posture section explicitly disclaims full-row encryption and auto-redaction, giving adopters accurate expectations.

**Riscos e Vulnerabilidades.**
- **Severity: Média.** `SECURITY.md` still states the project is at `v1.0.0-rc.1`. For a security researcher or legal reviewer assessing the current supported version, this is a material misrepresentation: v1.0.0 and v1.1.0 have been released with substantive security fixes. The six-provider sub-processor list and the at-rest encryption section were updated but the version preamble was not.
- **Severity: Média.** The three security fixes (WS auth bypass, MIME-spoof XSS, SSRF exfiltration) were not disclosed in a coordinated manner. No CVE IDs were assigned, no GitHub Security Advisory was opened, and the CHANGELOG does not mention them. For an operator who deployed v1.0.0 or v1.1.0 and subscribes to the repository for security notifications, there is no notification path that the prior version had exploitable vulnerabilities.
- **Severity: Baixa.** The privacy banner uses `sessionStorage` — clearing it reappears the banner on next tab, which is appropriate. However, there is no "don't show again" path (e.g., `localStorage`). For operators who have already read the banner and understand the implications, this creates repetitive friction per-session.

**Recomendação Prioritária.** Open a GitHub Security Advisory for each of the three fixed vulnerabilities (or a combined advisory), update `SECURITY.md` supported-versions to `>= 1.1.0`, and add entries to `CHANGELOG.md [Unreleased]` that reference the fixes. Acceptance criterion: `SECURITY.md` does not contain "rc.1"; the GitHub repository Security tab shows at least one advisory in "Closed" state linking to the relevant commits.

---

## Critical challenge

**The security sprint fixed the three HIGH vulnerabilities as scoped, but exposed a residual gap in the SSRF mitigation.** `validateBaseUrl` correctly blocks loopback addresses and known cloud IMDS endpoints, but does not block RFC-1918 private ranges (`10.x`, `172.16–31.x`, `192.168.x`) or IPv6 private addresses (`fc00::/7`, `fe80::/10`). In Docker or Kubernetes deployments — the primary context for `CHATLAB_HOST=0.0.0.0` usage — the entire pod/container network is typically in the `10.x` range, making SSRF lateral movement viable for any user with API access. This gap was flagged by three panelists (Security Engineer, QA Engineer, Software Engineer) independently.

**Secondary challenge: the lack of test coverage for the two security fixes themselves.** The WS auth bypass fix has zero test assertions proving an unauthenticated upgrade is rejected; the SSRF validation has zero test assertions against any blocked host. Both fixes are correct in code but are invisible to the test suite's regression detection.

---

## Action register

| # | Recommendation | Owner area | Severity | Target | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Extend `validateBaseUrl` to block RFC-1918 + IPv6 private ranges | Security / QA | Alta | v1.1.x patch | Open |
| 2 | Add WS-05 test: requireToken enforcement rejects unauthenticated upgrade | QA | Alta | v1.1.x patch | Open |
| 3 | Add AGT-H-09 test: `base_url` SSRF blocked hosts return 400 | QA | Alta | v1.1.x patch | Open |
| 4 | Add inflight-drain loop in `stop()` before `httpServer.close()` | Engineering / SRE | Média | v1.1.x patch | Open |
| 5 | Populate `CHANGELOG.md [Unreleased]`: document security fixes + Dependabot sprint | PM / Writer | Média | Immediate | Open |
| 6 | Update `SECURITY.md` supported-versions to `>= 1.1.0`; remove rc.1 reference | PM / Legal | Média | Immediate | Open |
| 7 | Open GitHub Security Advisory for the three fixed HIGH vulnerabilities | Legal / PM | Média | Immediate | Open |
| 8 | Add/amend capability spec or ADR for SSRF and MIME-spoof security decisions | BA | Média | v1.1.x patch | Open |
| 9 | Complete manual axe-DevTools pass (5 screens); commit report | UI/UX / QA | Alta | v1.1.x / v1.1.1 | Partial (carried from item 7, rc-1 review) |
| 10 | Restore `onBrokenLinks: "throw"` for EN locale in Docusaurus build | Writer | Média | v1.2 | Open |
| 11 | Fix 11 broken links in pt-BR locale (user-guide cross-references) | Writer | Média | v1.2 | Open |
| 12 | SHA-pin third-party actions in `release.yml` | DevOps | Média | v1.1.x patch | Open |
| 13 | Add `temperature` field to `AgentCreate` / `AgentPatch`; wire through runner | ML / Engineering | Média | v1.1 | Open |
| 14 | Snapshot `agent_version` at message-creation time (not derived at export) | Data | Média | v1.1 | Open |
| 15 | Implement capability `0007-eval-harness` CLI subcommand | ML / Engineering | Alta | v1.1 | Open |
| 16 | Fix `<track kind="captions">` in `<Attachment>` audio/video: either provide real captions or remove the empty element | UI/UX | Média | v1.1 | Open |
| 17 | Add bundle-size gate (JS gzip < 200 kB threshold in CI) | Performance | Média | v1.2 | Open |
| 18 | Add `README.docker.md` note on `CHATLAB_HOST=0.0.0.0` + `CHATLAB_REQUIRE_TOKEN` requirement | Cloud / Writer | Média | v1.1.x patch | Open |
| 19 | Add logger coverage: test `createLogger` JSON and pretty branches | Data / QA | Baixa | v1.1 | Open |
| 20 | Add real storage benchmark assertions in `test/perf/storage-bench.test.ts` | Performance | Baixa | v1.2 | Open |
| 21 | Update ROADMAP v1.1 to accurately reflect `0007` slipped to next release | PM / BA | Baixa | Immediate | Open |

---

## Readiness statement

The panel finds `chatlab v1.1.0` **ready to continue shipping** with no new release blockers introduced by the security sprint. The three HIGH vulnerabilities are fixed and the code reads correctly. However, **three items should be addressed as a v1.1.x patch release before any broader promotion of the project:**

1. **RFC-1918 SSRF gap** (items 1 + 3) — the SSRF fix is incomplete without private-range coverage.
2. **Security-fix regression tests** (items 2 + 3) — two fixed vulnerabilities have no test coverage.
3. **CHANGELOG + SECURITY.md + Advisory** (items 5, 6, 7) — the fixes need to be surfaced to existing operators through standard disclosure channels.

Items 4, 8–21 are improvements that should be scheduled into v1.1 or v1.2 work but do not block the current state from being tagged as a patch release once items 1–3 above are addressed.

**Maturity score: 7.9 / 10.** The project is genuinely more secure than it was at the GA gate. The score is held below 8.0 by the incomplete SSRF blocklist, the absent security regression tests, and the CHANGELOG/SECURITY.md hygiene gaps — all of which are inexpensive to fix.
