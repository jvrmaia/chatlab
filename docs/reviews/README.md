# Reviews

Snapshots of project health at specific release boundaries. These are **not** specs (they decide nothing) and **not** ADRs (they record no architectural choice). They record what the project looked like at a moment in time, who looked at it, and what they recommended.

Each review is filed as `YYYY-MM-DD-<context>.md`. The newest review is canonical for current state; older entries stay for trend analysis.

| Date | Context | Summary |
| --- | --- | --- |
| 2026-05-03 | [`2026-05-03-post-security-sprint.md`](./2026-05-03-post-security-sprint.md) | Full 14-persona TRB snapshot of v0.1.0 post-security-sprint (Dependabot + 3 HIGH vuln fixes). Maturity 7.9/10. SSRF RFC-1918 gap and missing security-fix regression tests are the primary findings. |
| 2026-05-03 | [`2026-05-03-axe-v1.1-patch.md`](./2026-05-03-axe-v1.1-patch.md) | Axe accessibility review of the v0.1.0 patch build. 2 critical violations found and fixed. All 5 primary UI screens pass at 0 critical/serious violations. |
| 2026-04-30 | [`2026-04-30-v1.0.0-ga.md`](./2026-04-30-v1.0.0-ga.md) | TRB GA review (follow-up to rc-1). Maturity 7.6/10. 5/5 GA blockers Closed; 3 new contrast findings; item 7 still Partial pending manual axe pass. |
| 2026-04-30 | [`2026-04-30-axe-contrast-check.md`](./2026-04-30-axe-contrast-check.md) | OKLCH→WCAG contrast verification of the design-token palette. Partial evidence for TRB item 7. 3 findings (`--warn`, `--danger`, `--ink-3-on-sunken`). |
| 2026-04-30 | [`2026-04-30-uat-panel.md`](./2026-04-30-uat-panel.md) | UAT panel of 6 downstream-role evaluators (data scientist, annotator, tester, ML engineer, analyst, NLP researcher). 21 user stories backlogged for v0.2.0 / v0.3.0 / later. |
| 2026-04-30 | [`2026-04-30-v1.0.0-rc.1.md`](./2026-04-30-v1.0.0-rc.1.md) | TRB review of v0.1.0-rc.1 — maturity 7.0/10; 5 GA blockers identified (all closed by end of day). |
