# 0012 — Security and dependency scanning

- **Status:** Accepted
- **Date:** 2026-04-30
- **Deciders:** @jvrmaia

## Context

Every PR to `main` pulls transitive dependencies (Express, React, Tailwind, Vite, the persistence adapters, etc.). Without automated scanning the project would acquire vulnerable code silently — and once application code is in flight, the maintainer has no human-attention budget to triage advisories one by one. We need a **standard, default-on stack** that runs without human attention and surfaces problems early.

Two related concerns sharpen the requirement: chatlab handles user-supplied API keys for upstream LLM providers, and the bind-safety surface (`CHATLAB_HOST`, `CHATLAB_REQUIRE_TOKEN`) means the project ships network-accessible behavior by default. A vulnerable dependency in either path is a real-world risk, not a theoretical one.

Constraints:

- **Free for OSS.** No commercial licenses or per-seat costs.
- **Native to GitHub when possible.** Minimizes secrets to manage and accounts to onboard.
- **Standard / well-known.** Contributors should not need to learn proprietary tools to read scan results.
- **No vendor lock-in.** Tooling must be replaceable without rewriting workflows.
- **Aligned with [ADR 0010](./0010-test-strategy.md)'s gating model.** Findings on a PR should block merge, with a documented suppression path for false positives.

## Decision

We adopt **four complementary tools**, each with a single, narrow job. None overlaps.

| Tool | What it scans | Trigger | Native? |
| --- | --- | --- | --- |
| **CodeQL** | SAST — code patterns that lead to known vulnerability classes (injection, XSS, path traversal, …) | PR to `main`, push to `main`, weekly cron | ✅ GitHub-native |
| **Gitleaks** | Secret-shaped strings committed to the repo (API keys, tokens, private keys) | PR to `main`, push to `main` | ⚪️ Community action, no external service |
| **OSV-Scanner** | Known CVE / GHSA advisories in dependencies (recursive, all manifests) | PR to `main` (when manifests change), push to `main`, **daily cron at 05:00 UTC**, `workflow_dispatch` | ⚪️ Google-maintained, open data (osv.dev) |
| **Dependabot** | Outdated dependencies (npm + github-actions) | **Daily**, opens PRs to bump versions, max 5 open at once | ✅ GitHub-native |

### Workflow files

- `.github/dependabot.yml` — Dependabot config.
- `.github/workflows/codeql.yml` — SAST.
- `.github/workflows/secret-scan.yml` — Gitleaks.
- `.github/workflows/dependency-scan.yml` — OSV-Scanner.

All four are required checks on PRs to `main`. Findings publish to the **GitHub Security tab** (CodeQL, OSV-Scanner via SARIF) so the maintainer has one central view.

### Suppression policy

False positives happen — every scanner has them. The suppression path, in priority order:

1. **CodeQL findings** — dismiss in the Security tab with a written justification. The dismissal is auditable and survives across analyses.
2. **OSV-Scanner findings** — add a suppression in `osv-scanner.toml` at the repo root, with a comment linking to the upstream GHSA / CVE explaining the rationale and the planned removal date.
3. **Gitleaks findings** — `.gitleaksignore` for path patterns; per-finding suppression via fingerprints. Each entry needs a justification comment.
4. **Dependabot PRs** — never silently auto-merge. Maintainer reviews; blocked updates need an issue documenting the block reason.

### Cadence rationale

- **Daily** dependency vulnerability scan + Dependabot updates: balances signal volume against the lag between an advisory landing on osv.dev and the project hearing about it. Subdaily would create noise; weekly leaves a multi-day vulnerability window during active periods.
- **Weekly** CodeQL cron: catches drift from new CodeQL ruleset versions even when no PRs are landing. Weekly is the GitHub default and matches industry norms.
- **Per-PR** for all four (when applicable): guarantees no PR can land vulnerable code without it being annotated.

## Consequences

- **Positive:** every PR to `main` has CodeQL, Gitleaks, and (when manifests change) OSV-Scanner as required checks. Maintainers cannot silently merge a vulnerable change.
- **Positive:** Dependabot keeps the tree fresh without manual triage; the maintainer reviews PRs that arrive instead of going looking for updates.
- **Positive:** four tools, four jobs. Replacement is local — swapping Gitleaks for `trufflehog` is a one-file change.
- **Positive:** all findings unified in the GitHub Security tab — one URL to bookmark.
- **Negative:** PR run time grows. Mitigated by parallelizing the four workflows; the longest single job (CodeQL) runs ~3 min on this repo's size.
- **Negative:** Dependabot opens PRs daily once the dependency tree is real. Acceptable; the 5-PR cap and `chore(deps):` commit-message prefix make them easy to triage in batch.
- **Negative:** OSV-Scanner needs a lockfile (`package-lock.json` / `pnpm-lock.yaml`) to detect transitive vulns. Until the first `npm install` runs, the scanner has only direct deps to look at. Documented; not blocking.

## Alternatives considered

- **Snyk** — strong product, but commercial. Free tier exists but has rate limits and asks for credentials. Rejected as introducing a vendor dependency.
- **Semgrep** — capable SAST, larger rule library. Rejected because (a) CodeQL is already free-and-native for GitHub, (b) Semgrep Cloud is the commercial value-add and we'd be using only the OSS subset, (c) no compelling rule we need that CodeQL lacks for our stack.
- **Trivy** — broader scanner (filesystem, container, IaC). Rejected as primary because we don't have a container image yet and OSV-Scanner is more focused for our manifest-only scanning today. Will revisit when the Docker image lands (Trivy could complement at that stage).
- **TruffleHog** for secret scanning — comparable to Gitleaks. Either works; chose Gitleaks for its simpler config and slightly more mature GitHub Action.
- **Renovate** instead of Dependabot — comparable tool, more flexible config. Rejected for v0.x because Dependabot is GitHub-native and zero-setup. We may revisit if Renovate's config flexibility becomes a real need.
- **Run all four on a single weekly cron** — rejected. PR-time gating is what catches vulnerable code *before* merge; weekly-only would let vulnerable code land for up to seven days before alerting.
- **No auto-scanning, manual review only** — rejected. Doesn't survive contact with reality at any project size beyond two contributors.