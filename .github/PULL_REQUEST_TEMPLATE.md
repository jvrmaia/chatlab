<!--
Thanks for the PR! Please fill in the sections below. Delete sections that don't apply.
-->

## What & why

<!-- One paragraph. What does this PR change, and why? -->

## Type of change

- [ ] New capability spec
- [ ] Edit to an existing capability spec
- [ ] New ADR
- [ ] Documentation (README, CONTRIBUTING, ARCHITECTURE, etc.)
- [ ] Tooling (`.claude/`, `.github/`, configs)
- [ ] Code (once we have any) — bug fix
- [ ] Code (once we have any) — feature
- [ ] Dependency bump (Dependabot or manual)
- [ ] Other: <!-- describe -->

## Linked issues

<!-- "Closes #123", "Refs #456", etc. -->

## Spec / ADR checklist

<!-- Skip if not applicable. -->

- [ ] Filename follows `NNNN-kebab-name.md`
- [ ] `Status:` field present and reasonable
- [ ] Index file updated (`docs/specs/README.md` or `docs/specs/adr/README.md`)
- [ ] Roadmap updated if the change affects milestone scope

## Security & dependencies checklist

<!--
Required automated checks (per ADR 0012) run on every PR to `main`:
  - codeql.yml (SAST)
  - secret-scan.yml (Gitleaks)
  - dependency-scan.yml (OSV-Scanner — only on PRs touching manifests)
  - lint-docs.yml (Redocly + markdown links + Mermaid)
All must pass before merge. Findings show up in the GitHub Security tab.
-->

- [ ] No secrets, API keys, tokens, or credentials are added in this PR (Gitleaks will block, but please double-check).
- [ ] No new vulnerable dependency was introduced. If OSV-Scanner flags a finding, link the GHSA / CVE and either pin a fixed version or add a justified entry to `osv-scanner.toml`.
- [ ] If this PR adds a new external dependency, link the project, briefly justify the choice, and confirm the license is MIT-compatible.
- [ ] If this PR introduces a new attack surface (new endpoint, new file-system path, new webhook target), I have considered: input validation, authentication, error-message leakage, and resource limits.

## Verification

<!-- How did you check this works? Manual scenarios, tests run, etc. -->

## Notes for reviewers

<!-- Anything you want a reviewer to look at first, decisions you're unsure about, etc. -->
