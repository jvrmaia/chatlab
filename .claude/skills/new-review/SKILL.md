---
name: new-review
description: Scaffold a new TRB (Technical Review Board) review under docs/reviews/. Use when the user says "convene a TRB", "new review", "let's do a review", or wants to capture a structured project-health snapshot before a milestone (release tag, design pivot, post-incident).
---

# new-review

Scaffold a new review report under `docs/reviews/`. Reviews are **read-only after publication** — they record the project's state at a moment in time and aren't edited later (only the action register at the bottom is updated as items close).

## When to use

- Before tagging a release (especially before promoting `-rc.N` → `v1.0.0`).
- After a major architectural change lands (post-mortem-style).
- When the user says "convene a TRB", "do a review", "another TRB", "review board".

For an actual multi-persona review with specialist pareceres, prefer launching the [`trb-reviewer`](../../agents/trb-reviewer.md) agent — this skill just lays down the file scaffold.

## Steps

1. **Confirm context.** Ask (in one short turn) for: the review's date (default today, per `currentDate`), a short kebab-case context tag (e.g. `v1.0.0-rc.2`, `post-incident-2026-05-12`, `pre-eval-harness`), and a one-line scope summary.

2. **Pick the filename.** `docs/reviews/<YYYY-MM-DD>-<context>.md`. Verify it doesn't exist.

3. **Read the template** by inspecting the most recent prior review for shape (`docs/reviews/2026-04-30-v1.0.0-rc.1.md` is canonical). Copy its skeleton:
   - Frontmatter-style header (Date, Project, Panel, Scope).
   - Reviewer note on framing (only if relevant).
   - Executive summary (Maturity / Critical challenge / Readiness).
   - 14 condensed pareceres section (or 13 if ML/AI doesn't apply — note the recusal explicitly).
   - Critical challenge consolidation.
   - Action register table (`# | Recommendation | Owner area | Severity | Target | Status`).
   - Follow-up plan + Readiness statement.

4. **Pre-fill what you know:** dates, project version (read `package.json`), panel composition, scope from the user's one-liner. Leave each parecer slot as `_TBD by <discipline>_` so the writer / `trb-reviewer` agent can fill them in.

5. **Update `docs/reviews/README.md`** index — add a new row at the top of the table:
   `| <date> | [`<filename>`](./<filename>) | <one-line summary — fill after pareceres land>. |`

6. **Update `docs-site/sidebars.ts`** — add `"reviews/<date>-<context>"` to the **Reviews** subcategory inside the `Project` category.

7. **Report back** the path created, and remind the user:
   - The pareceres section is empty — fill manually or invoke `trb-reviewer`.
   - The report becomes **read-only** the moment it's published. Action-register status updates are the only edits allowed afterwards.
   - `npm run docs:build` will fail until the new file resolves all internal links — keep them sparse and tested.

## Conventions to preserve

- **One review per date / context combination.** Don't overwrite an existing one.
- **Read-only after publication.** Corrections happen in a follow-up review.
- **Action register is the durable artifact.** Each row needs a target release (`v1.0 GA`, `v1.1`, …) and a status (`Open`, `In progress`, `Closed YYYY-MM-DD — <evidence link>`, `Spec drafted`, `Skeleton`).
- **Severity scale:** `Baixa` / `Média` / `Alta` / `Crítica` — match prior reviews so trend analysis works.

## Verification before reporting done

- [ ] The new file exists and matches the prior review's section structure.
- [ ] `docs/reviews/README.md` index has a new row pointing at it.
- [ ] `docs-site/sidebars.ts` includes the new id under `Reviews`.
- [ ] `npm run docs:build` passes (no broken links — note: `onBrokenLinks: 'throw'`).
