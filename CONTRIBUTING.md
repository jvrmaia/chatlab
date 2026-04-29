# Contributing to chatlab

Thanks for your interest in contributing! As of v1.0.0-rc.1 chatlab runs end-to-end and capabilities `0001`–`0006` are implemented. Both spec/docs work and code contributions are welcome.

## Code of conduct

By participating in this project you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Ways to contribute

| What | Where to start |
| --- | --- |
| Propose a new capability | Open a **Capability Proposal** issue, then draft a spec under [`docs/specs/capabilities/`](./docs/specs/capabilities/) using the [`_template.md`](./docs/specs/capabilities/_template.md). |
| Refine an existing capability spec | Open a PR against the relevant spec file. Mention which Open Question(s) you are resolving. |
| Record a design decision | Add an ADR under [`docs/specs/adr/`](./docs/specs/adr/) using the [`_template.md`](./docs/specs/adr/_template.md). |
| Improve docs / fix typos / English style | Direct PR. No issue needed. |
| Report a bug | Open a **Bug Report** issue (becomes more relevant once code lands). |

## Local setup

Prerequisites: **Node.js 22 LTS** (version pinned in [`.nvmrc`](./.nvmrc) — `nvm`/`fnm` pick it up automatically), `git`, native build toolchain (macOS Xcode CLT or Linux `python3 build-essential`).

```bash
git clone https://github.com/<your-fork>/chatlab.git
cd chatlab
npm install
npm run build
npm test     # 90 tests pass in <2s
npm start    # http://127.0.0.1:4480 + /ui
```

For the full walkthrough — including persistent storage, webhooks, ratings, and exports — see [`docs/quickstart.md`](./docs/quickstart.md). For the per-endpoint copy-paste curl recipes, see [`docs/recipes.md`](./docs/recipes.md). For the test guide, see [`docs/testing.md`](./docs/testing.md). The deeper dev workflow (hot-reload UI, watch mode, repository layout) is in [`docs/distribution/manual.md`](./docs/distribution/manual.md).

## Branching & commits

- Branch from `main`. Use a short descriptive name: `spec/groups-admin-actions`, `docs/fix-roadmap-link`, `adr/storage-engine`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) — examples:
  - `docs: tighten direct-messages spec`
  - `feat(spec): add capability for status broadcasts`
  - `chore: bump node engine to 22.12`
- Keep PRs focused. One spec / one ADR / one fix per PR is the norm.

## Spec & ADR conventions

- Files are numbered with **4-digit prefixes** (`0001-`, `0002-`, …) and use kebab-case names.
- Numbers are assigned at PR-merge time — if two PRs propose the same number, the second one rebases.
- Specs follow [`docs/specs/capabilities/_template.md`](./docs/specs/capabilities/_template.md). ADRs follow [`docs/specs/adr/_template.md`](./docs/specs/adr/_template.md) (MADR-lite).
- Every spec has a `Status:` field — one of `Draft`, `Accepted`, `Implemented`, `Superseded`.

## Security & dependencies

Per [ADR 0012](./docs/specs/adr/0012-security-and-dependency-scanning.md), every PR to `main` runs four automated checks. All must pass before merge:

- **CodeQL** (SAST) — flags vulnerable code patterns. Findings publish to the GitHub Security tab.
- **Gitleaks** (secret scan) — blocks committed secrets (API keys, tokens, private keys).
- **OSV-Scanner** (dependency vulnerability scan) — runs on PRs that touch any `package*.json` / lockfile, on every push to `main`, and **daily at 05:00 UTC** to catch advisories that landed after the last PR.
- **Dependabot** keeps the dependency tree fresh by opening daily PRs to bump versions (max 5 open at a time, grouped minor + patch). Always review before merging — never auto-merge silently.

Suppression paths (false positives, planned removals) are documented in ADR 0012. The PR template carries a security & dependencies checklist that contributors must work through.

## Tests

Test strategy is locked in [ADR 0010](./docs/specs/adr/0010-test-strategy.md): **Vitest** for unit + integration, **Playwright** for screenshot capture (E2E test scenarios deferred). Coverage gate: **80% lines / 80% statements / 80% functions / 65% branches** on `src/` (excluding `src/ui/**` and `src/cli.ts` until an E2E tier lands). Tests live under `test/` and mirror `src/` by area (`test/agents/`, `test/http/`, `test/storage/`, `test/workspaces/`, `test/ws/`); PRs that add `src/` code without satisfying the gate will not merge.

## Diagrams

Use **Mermaid** for all diagrams — inline in Markdown, in fenced ` ```mermaid ` blocks. GitHub renders Mermaid natively, so no build step is required. ASCII diagrams are deprecated; convert opportunistically when you touch surrounding text. The escape hatch for the rare case Mermaid can't express is a plain SVG under `docs/assets/diagrams/`, accompanied by an ADR explaining the exception. Decision recorded in [ADR 0008](./docs/specs/adr/0008-mermaid-for-diagrams.md).

## Documentation site

The browsable site ([ADR 0009](./docs/specs/adr/0009-github-pages-documentation-site.md)) lives at **[https://jvrmaia.github.io/chatlab/](https://jvrmaia.github.io/chatlab/)** once **Settings → Pages → Build and deployment → GitHub Actions** is enabled for this repository.

Local preview:

```bash
npm ci --prefix docs-site    # or npm install --prefix docs-site
npm run docs:dev             # http://localhost:3000/chatlab/
npm run docs:build           # production build (same as CI)
```

**Editing expectations**

- Markdown under `docs/` is the single source of truth; `docs-site/` only holds Docusaurus config.
- **Renaming or moving a file in `docs/` changes the public URL** — call it out in the PR; add Docusaurus redirects when necessary.
- New capability or ADR Markdown files must be added to [`docs-site/sidebars.ts`](./docs-site/sidebars.ts) (numeric prefixes in filenames are stripped from auto ids).
- Root [`README.md`](./README.md) is intentionally **not** symlinked into `docs/` (caused Docusaurus SSG failures); [`docs/project-overview.md`](./docs/project-overview.md) links readers to the README on GitHub.

Decision recorded in [ADR 0009](./docs/specs/adr/0009-github-pages-documentation-site.md).

## Versioning

We follow [SemVer](https://semver.org/). v1.0 is the first public release; **breaking changes require a major bump**. Pre-release versions use the `-rc.N` suffix (`1.0.0-rc.1`, `1.0.0-rc.2`, …) until the maintainer drops the suffix at tag time.

## Review expectations

- Specs need at least one approval from a maintainer before merging.
- ADRs in `Accepted` status are not edited in place — supersede them with a new ADR if the decision changes.
- Be kind, be concrete, be patient.

## Questions

Open a **Discussion** on the repository (once enabled) or an issue tagged `question`.
