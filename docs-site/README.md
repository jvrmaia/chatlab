# chatlab documentation site

Static documentation built with [Docusaurus 3](https://docusaurus.io/). Markdown lives in the parent repo under [`../docs/`](../docs/) — this folder only holds site config.

## Commands

From `docs-site/`:

```bash
npm install
npm run start    # http://localhost:3000/chatlab/
npm run build
npm run serve    # preview production build
```

Broken links fail the build (`onBrokenLinks: 'throw'` in `docusaurus.config.ts`). Use a GitHub URL (e.g. `https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md`) for any reference outside `docs/`, or update `exclude` in the docs preset to drop the file from the site.

## Deploy

GitHub Actions workflow `.github/workflows/docs-deploy.yml` publishes to GitHub Pages when `main` changes under `docs/` or `docs-site/`.

## Dependency audit

`npm audit` here reports a number of advisories (currently ~24, mostly `high` from the Docusaurus build chain — `mermaid`, `sockjs`, `webpack-dev-server`, `serialize-javascript`, `uuid`). They are **build-time dev dependencies only** — none of them ship in the static HTML/JS that gets uploaded to GitHub Pages, so the published site is not exposed.

Policy:

- **Do not run `npm audit fix --force`** — it downgrades `@docusaurus/theme-mermaid` and breaks the build.
- Bump cleanly via Dependabot PRs targeting `docs-site/package.json`, or wait for upstream Docusaurus releases that resolve the transitive versions.
- Re-run `npm audit` here whenever Docusaurus is upgraded; expect the count to drop as the upstream chain matures.
