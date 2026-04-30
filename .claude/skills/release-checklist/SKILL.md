---
name: release-checklist
description: Cut a release of chatlab — runs the verification gauntlet (typecheck/test/build/redocly/docs:build), bumps the version in package.json, moves the CHANGELOG Unreleased section to a dated entry, and walks through the manual smoke checklist. Use when the user says "cut a release", "tag v1.0.0", "release vX.Y.Z", "let's ship".
---

# release-checklist

Coordinate a chatlab release. The actual `git tag` + `git push --tags` is the user's call (and triggers `release.yml`); this skill makes sure everything **before** the tag is sound.

## When to use

- The user wants to cut a tagged release (`v1.0.0`, `v1.0.0-rc.2`, `v1.1.0`, …).
- The user says "ship", "release", "tag", "cut a version".

Refuse politely if the working tree is dirty (uncommitted changes) — the user must commit or stash first.

## Inputs to confirm

Ask the user (one short message) for:

1. **Target version** (e.g. `1.0.0-rc.2`, `1.0.0`, `1.1.0`). Strict semver, no leading `v`.
2. **Whether this is a stable release** (`1.0.0`) or a pre-release (`-rc.N` / `-beta.N`) — affects the CHANGELOG framing and the npm dist-tag.

## Steps

### 1. Pre-flight

- Confirm the branch is `main` (`git rev-parse --abbrev-ref HEAD`).
- Confirm the working tree is clean (`git status --short`). Halt if dirty.
- Read `package.json`'s current `version`. Confirm the user's target is a valid semver bump (no downgrade, no skipping versions for a stable release).

### 2. Verify gauntlet

Run all of these and surface any failure to the user before continuing:

```bash
npm run typecheck
npm test            # expect 90+ passing, 1+ skipped
npm run build
npx -y -p @redocly/cli@2.30.3 redocly lint docs/specs/api/openapi.yaml
npm run docs:build  # onBrokenLinks: 'throw' — must pass
```

If the user changed UI surfaces since the last release, also run:

```bash
npm run docs:capture
```

Halt and report on first failure.

### 3. Pre-GA blocker check (only for `1.0.0` stable)

If the target is `1.0.0` exactly (not `-rc`):

- Read `docs/reviews/2026-04-30-v1.0.0-rc.1.md`'s action register.
- Confirm every row marked **GA blocker** is `Closed`. The current set is items **1–5**: encrypt API keys, retention sweep, structured logger, "Why chatlab" comparison, privacy banner.
- Item 7 (manual axe pass) is **Partial** by design. If the user wants stable, they confirm explicitly that it's been done since the rc.
- If any blocker is still `Open`, halt and tell the user.

### 4. Bump `package.json`

Edit `package.json`'s `version` field to the target. Do **not** also edit `package-lock.json` by hand — `npm install` is unnecessary for a version-only bump (npm regenerates `package-lock.json`'s root version on next install).

### 5. Move CHANGELOG entry

Edit `CHANGELOG.md`:

- Move all bullets currently under `## [Unreleased]` into a new section `## [<version>] — <YYYY-MM-DD>` (today).
- Leave `## [Unreleased]` empty (with no subsection headers).
- Update the link footer: `[Unreleased]: https://github.com/jvrmaia/chatlab/compare/v<version>...HEAD` and add `[<version>]: https://github.com/jvrmaia/chatlab/releases/tag/v<version>`.

### 6. Smoke list (manual — print for the user to walk)

Print the steps from `docs/testing.md` "Manual smoke (~5 minutes before tagging a release)". Don't try to automate them. The user reports back when done.

### 7. Commit + tag (user-driven)

Tell the user the exact commands to run themselves:

```bash
git add package.json CHANGELOG.md
git commit -m "chore: release v<version>"
git tag v<version>
git push origin main
git push origin v<version>     # triggers .github/workflows/release.yml
```

Do **not** run these yourself unless explicitly asked. `git push --tags` triggers the release workflow which publishes to npm + Docker Hub — that's a hard-to-reverse action.

### 8. Post-tag (after the user pushes)

Tell the user to:

- Watch `release.yml` run on GitHub Actions.
- Verify the npm package installs: `npx @jvrmaia/chatlab@<version> --version`.
- Verify the Docker image: `docker pull jvrmaia/chatlab:<version>`.
- Confirm the GitHub Release got created with notes from `CHANGELOG.md`.

If the target was stable (`1.0.0`), schedule the **follow-up TRB review** in 2 weeks to verify item 7 (axe sweep) and re-baseline maturity. The `schedule` skill or a calendar reminder works.

## Conventions to preserve

- **Stable releases never carry `-rc` / `-beta` / `-alpha` suffixes.** Pre-releases always do.
- **CHANGELOG `[Unreleased]` is sacred.** Always reset it after every tag — never let two consecutive tags share entries.
- **The release workflow is the source of truth for publishing.** Don't `npm publish` manually unless the workflow is broken.
- **Don't force-push tags.** A tag once pushed is final.

## Verification before reporting done

- [ ] All 5 (or 6) verify-gauntlet commands clean.
- [ ] `package.json` version matches the target.
- [ ] `CHANGELOG.md` `[Unreleased]` is empty; the new dated section has all the entries.
- [ ] Smoke list was printed (the user does the manual walk).
- [ ] User has the commit + tag commands; pushing is **their** decision.
