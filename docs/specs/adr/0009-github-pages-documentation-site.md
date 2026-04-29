# 0009 — GitHub Pages documentation site

- **Status:** Accepted
- **Date:** 2026-04-29
- **Deciders:** @jvrmaia

## Context

Documentation lives in `docs/` as Markdown — readable on GitHub but not easily discoverable, searchable, or linkable for people who don't already know the repo. Potential users searching for a local chat-agent dev platform, contributors browsing the architecture, and integrators reading the OpenAPI all benefit from a real documentation site.

Constraints:

- **Single source of truth.** Markdown lives in `docs/` and stays there. Any solution that demands a copy of the same content elsewhere will drift.
- **Mermaid renders out of the box.** Diagrams are Mermaid per [ADR 0008](./0008-mermaid-for-diagrams.md); the doc site must render them without per-page workarounds.
- **OpenAPI renders nicely.** [`docs/specs/api/openapi.yaml`](../api/openapi.yaml) is a primary artifact; the site must turn it into navigable, searchable documentation.
- **No Python toolchain.** The project is Node + TypeScript ([ADR 0002](./0002-language-and-runtime.md)) — splitting into Node + Python for one tool is a CI and onboarding tax.
- **Hosting on GitHub Pages.** Free, no extra service, redeploys on push, no DNS work to start.
- **Match the existing stack where possible.** Web UI is React + Vite ([ADR 0005](./0005-web-ui-framework.md)) — staying in the React ecosystem keeps the toolchain coherent.

## Decision

We adopt **Docusaurus 3.x** as the static site generator for documentation, deployed to GitHub Pages.

### Generator and integrations

- **Docusaurus 3.x** as the generator.
- **`@docusaurus/theme-mermaid`** for diagram rendering — required to satisfy [ADR 0008](./0008-mermaid-for-diagrams.md).
- **`redocusaurus`** to render `docs/specs/api/openapi.yaml` as a navigable API page on the site (powered by Redoc under the hood).
- **TypeScript** config files (`docusaurus.config.ts`, `sidebars.ts`) — consistent with [ADR 0002](./0002-language-and-runtime.md).

### Source layout

- The site **reads `docs/` directly** via the docs plugin config:
  ```ts
  // docs-site/docusaurus.config.ts (planned shape)
  presets: [
    ['classic', {
      docs: { path: '../docs', routeBasePath: '/' },
      // ...
    }]
  ]
  ```
- No copy/sync, no `docs-site/docs/` shadow tree. One Markdown file, two render surfaces (GitHub + the site).
- The site's `package.json`, config, and React component overrides live under `docs-site/`.

### Site URL and deployment

- URL: **`https://jvrmaia.github.io/chatlab`** (default GitHub Pages project URL; no custom domain for now).
- Deployment: **`.github/workflows/docs-deploy.yml`** builds on every push to `main` that touches `docs/**`, `docs-site/**`, or the workflow file; uploads `docs-site/build/` via **`actions/upload-pages-artifact`** and publishes with **`actions/deploy-pages`** (OIDC). Requires **Settings → Pages → GitHub Actions** as the source (not the legacy `gh-pages` branch).
- The workflow uses Node version pinned in `.nvmrc`.

### Sidebar / information architecture

The Docusaurus sidebar mirrors the existing `docs/` structure (declared explicitly in [`docs-site/sidebars.ts`](../../../docs-site/sidebars.ts) because numeric filename prefixes are stripped from auto-generated ids):

| Sidebar section | Source |
| --- | --- |
| **Getting started** | [`docs/project-overview.md`](../../project-overview.md) (links to the root README on GitHub), [`docs/quickstart.md`](../../quickstart.md), [`docs/recipes.md`](../../recipes.md), `docs/distribution/{npm,docker,manual}.md` |
| **User guide** | `docs/user-guide/*.md` |
| **Architecture** | `docs/ARCHITECTURE.md`, `docs/GLOSSARY.md` |
| **Capabilities** | every file under `docs/specs/capabilities/` (skipping `_template.md`) |
| **API contract** | [`docs/specs/api/README.md`](../api/README.md) plus **Redoc** from [`docs/specs/api/openapi.yaml`](../api/openapi.yaml) at route `/api/` (there are no separate `http.md` / `webhooks.md` prose files in this repo) |
| **ADRs** | `docs/specs/adr/README.md` plus every ADR file (skipping `_template.md`) |
| **Project** | `docs/ROADMAP.md`, `docs/testing.md`, `docs/personas.md`, `docs/legal/data-handling.md`, `docs/specs/README.md` |

Templates (`_template.md`), `docs/specs/tests/**`, and `docs/_design/**` are excluded from the docs plugin via `exclude` globs in `docs-site/docusaurus.config.ts`.

### Implementation status

The following artifacts exist on `main`:

- **`docs-site/`** — Docusaurus 3 (`package.json`, `docusaurus.config.ts`, `sidebars.ts`, …). Markdown is parsed as **CommonMark** (`markdown.format: 'md'`) so prose can use `<http://…>` autolinks and angle-bracket component names without MDX escaping; Mermaid stays enabled via `@docusaurus/theme-mermaid`. **`@mermaid-js/layout-elk`** is a direct dependency to satisfy the theme's layout resolution.
- **`.github/workflows/docs-deploy.yml`** — builds on push to `main` (paths: `docs/**`, `docs-site/**`) and publishes with **GitHub Pages** (`actions/deploy-pages`). Requires **Settings → Pages → Source: GitHub Actions**.
- **`docs/project-overview.md`** — sidebar entry pointing readers at the root README on GitHub (a symlink to `README.md` broke static generation; this stub keeps one canonical README at repo root).
- **`lint-docs.yml`** — includes a **Docusaurus build** job so PRs cannot merge if `docs-site` fails to compile.

Published URL: **`https://jvrmaia.github.io/chatlab/`** (project Pages base path `/chatlab/`).

## Consequences

- **Positive:** documentation becomes discoverable to readers who don't already know the repo. Search engines index it. The OpenAPI gets a beautiful navigable page automatically.
- **Positive:** single source of truth. Editors of `docs/*.md` don't have to think about whether the site needs a separate update.
- **Positive:** Mermaid and OpenAPI render with first-class plugins — no custom build steps to keep working.
- **Positive:** new specs and ADRs are wired through `sidebars.ts` — when adding a file, update that manifest (and rely on CI to catch a missing id).
- **Negative:** Docusaurus and Redoc add ~80 MB under `docs-site/node_modules/`, separate from the root app workspace.
- **Negative:** the site URL becomes a public surface. **Renaming or moving a Markdown file in `docs/` is a breaking change for the site URL** — handle the same way we handle other public-surface changes: call it out in the PR description, and add redirects in the Docusaurus config when scaffolding is in place.
- **Neutral:** Docusaurus' versioning feature is **disabled**. The live site reflects `main`; turn versioning on only if we need frozen doc sets alongside semver releases.

## Alternatives considered

- **Astro Starlight** — close runner-up. Lighter, faster, framework-agnostic. Rejected because (a) the React stack is already chosen for the Web UI ([ADR 0005](./0005-web-ui-framework.md)) and Starlight builds on Astro's own islands runtime, mixing two component models; (b) the OpenAPI integration (`starlight-openapi`) is younger and less battle-tested than `redocusaurus`.
- **VitePress** — Vue-based. Fast, simple, native Mermaid support. Rejected because the project standardized on React ([ADR 0005](./0005-web-ui-framework.md)) and we don't want to maintain Vue components for the doc site only.
- **MkDocs Material** — popular and beautiful. Rejected because it introduces a Python toolchain in a Node-only project, splitting CI and onboarding.
- **Plain Jekyll on GitHub Pages** — zero config but very limited. No Mermaid out of the box, no OpenAPI rendering, opinionated theming. Rejected as not meeting our constraints.
- **Nextra (Next.js-based)** — capable but pulls in the full Next.js toolchain, which is overkill for a static doc site.
- **Hosted services (Mintlify, ReadMe, GitBook)** — rejected. External dependency, license cost at scale, and the source still needs to live somewhere mirrored from `docs/`.