# Project Status

**Current as of:** 2026-05-13
**Base TRB review:** 2026-05-12 — maturity 8.1/10 (post-v0.2.2 sprint, 14-persona panel)

This is the living project-health document. It is updated in-place as action items close; it does not accumulate dated snapshots.

---

## What's been completed

### v0.2.2 sprint (landed)

- **Eval harness** (`0007`) — `chatlab eval --agent <id>` subcommand: YAML golden-set loader, HTTP polling runner, Markdown/JSON reporter, baseline diff. 14 Vitest tests (EVAL-L-01 through EVAL-CLI-02).
- **SSE extraction** — `src/lib/sse.ts` shared generator; both provider adapters import it.
- **CLI subcommand guard** — `detectUnknownSubcommand` exits 1 for unknown commands.
- **ADRs 0015–0017** — CLI subcommand architecture, centralized LLM message builder, LLM integration build-vs-SDK.
- **SSRF RFC-1918 gap closed** — full blocklist per ADR 0014 (169.254.x.x, fc00::/7 ULA).
- **LocaleToggle ARIA fix** — `aria-selected` + `role="tablist"` + `role="tab"`.
- **Bundle-size CI gate** — gzip < 200 kB enforced in `ci.yml`.

### Post-v0.2.2 action register closures (2026-05-13)

| Item | Closed |
| --- | --- |
| 1 — `temperature: 0` enforcement in eval + EVAL-I-03 test | 2026-05-13 |
| 2 — `0007-eval-harness.md` Acceptance section + Status → Implemented | 2026-05-13 |
| 4 — ADRs 0015–0017 added to `sidebars.ts` | 2026-05-12 |
| 6 — hardcoded `"eval-token"` replaced with `randomBytes(16).toString("hex")` | 2026-05-13 |
| 7 — `SECURITY.md` updated to `>= 0.2.2`; EL2 note added | 2026-05-13 |
| 8 — `CHANGELOG.md [Unreleased]` populated | 2026-05-13 |
| 14 — subcommand checklist added to ADR 0015 | 2026-05-13 |
| 18 — ROADMAP v0.3.0 reframed (eval stable, not eval new) | 2026-05-13 |

---

## Open action items

Update the **Status** column as each item closes. Set `Closed YYYY-MM-DD — <evidence>` when done.

| # | Item | Severity | Target | Status |
|---|------|----------|--------|--------|
| 3 | Add `docs/user-guide/eval.md` walkthrough; link from User Guide sidebar | Média | v0.3.0 | Open |
| 5 | Add drain-timeout `logger.warn` in `stop()` when deadline exceeded; add `logger.info`/`logger.error` in `AgentRunner.respondTo` | Média | v0.3.0 | Open |
| 9 | SHA-pin `actions/checkout` and `actions/setup-node` in `ci.yml`, `lint-docs.yml`, `codeql.yml`, `secret-scan.yml`, `dependency-scan.yml` | Média | v0.3.0 | Open |
| 10 | Run `axe-core` via Playwright E2E on 5 primary screens; assert zero critical/serious violations | Alta | v0.3.0 | Partial (carried) |
| 11 | Audit JSONL export: confirm `agent_version` is read from `messages` row, not live agent record; add regression test | Média | v0.3.0 | Open |
| 12 | Add real assertion to `test/perf/storage-bench.test.ts`: 1 000 messages, `listByChat` with `limit`, assert < 100 ms | Baixa | v0.4.0 | Open |
| 13 | Pin Docker base image to a digest, or add Dependabot `docker` ecosystem entry | Média | v0.3.0 | Open |
| 15 | Add `--agent` name-based lookup fallback in `runEval` (resolve by name if UUID not found) | Baixa | v0.4.0 | Open |
| 16 | Add EL2 hosted-service restriction note to `docs/legal/data-handling.md` | Baixa | v0.3.0 | Open |
| 17 | Fix `<track kind="captions">` empty `src` in `<Attachment>` audio/video — remove or provide real captions | Baixa | v0.4.0 | Partial (carried) |
