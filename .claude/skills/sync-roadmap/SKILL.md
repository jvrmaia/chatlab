---
name: sync-roadmap
description: Reconcile docs/ROADMAP.md with the current Status fields of capability specs. Use when the user says "sync the roadmap", "the roadmap is out of date", or after merging a spec status change.
---

# sync-roadmap

Keep `docs/ROADMAP.md` in alignment with the actual `Status:` fields of capability specs under `docs/specs/capabilities/`.

## When to use

- A capability spec's `Status:` was just changed (Draft → Accepted, Accepted → Implemented).
- The user says "sync the roadmap", "the roadmap looks stale", "update the roadmap from the specs".
- Before cutting a release.

## Steps

1. **Read every capability spec.** For each file under `docs/specs/capabilities/` matching `^[0-9]{4}-.*\.md`, extract:
   - The number (`NNNN`)
   - The title (from the H1)
   - The `Status:` field (Draft / Accepted / Implemented / Superseded by NNNN)

2. **Read the roadmap.** Parse `docs/ROADMAP.md`'s milestone sections (`v0.1`, `v0.2`, …). For each capability listed, find which milestone it belongs to.

3. **Reconcile.**
   - If a spec is `Implemented` but its roadmap entry isn't checked off → tick the checkbox.
   - If a spec is `Accepted` but the roadmap implies it's "out" → leave it but flag for the user to review.
   - If a spec exists but isn't in the roadmap at all → ask the user which milestone it belongs to. Don't guess.
   - If a roadmap entry references a spec number that no longer exists (renamed/superseded) → flag for the user.

4. **Detect milestone-completion.** If every capability in a milestone is `Implemented`, mark the whole milestone as "Released" and prompt the user to:
   - Pick a version number (e.g. `v0.1.0`)
   - Add the date
   - Move the section to a "Released" subsection at the bottom

5. **Edit the roadmap minimally.** Use the `Edit` tool with surgical replacements; don't rewrite the file wholesale. Preserve comments and ordering.

6. **Report back.** Show the user:
   - What you changed (e.g. "ticked 0001 in v0.1; flagged 0007 as missing from any milestone").
   - What needs human attention.
   - Any milestones now "Released" and pending a version bump.

## Important: do not invent

- If you cannot decide which milestone a spec belongs to, **ask** rather than guessing.
- If a spec's status looks inconsistent with reality (e.g. `Implemented` but no code exists), surface that as a question — don't silently "fix" it by demoting status.

## Verification before reporting done

- [ ] Every spec under `docs/specs/capabilities/` is accounted for in the roadmap (or flagged for the user).
- [ ] The diff to `docs/ROADMAP.md` is minimal and obviously correct.
- [ ] No status field of any spec was modified by this skill (status changes are a human decision).
