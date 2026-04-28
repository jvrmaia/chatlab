---
name: new-adr
description: Scaffold a new Architecture Decision Record under docs/specs/adr/ from the project template. Use when the user says "new ADR", "record this decision", "we need an ADR for <X>", or otherwise wants to capture an architectural choice.
---

# new-adr

Scaffold a new ADR (Architecture Decision Record) for `chatlab`.

## When to use

- The user wants to record an architectural decision in writing.
- The user says "new ADR", "let's write an ADR for X", "record this decision".
- A discussion has converged on a decision that future contributors will need to understand.

Do **not** use this skill for capability specs — use [`new-capability-spec`](../new-capability-spec/SKILL.md).

## Steps

1. **Confirm the decision.** Ask the user (one short message) for: a short title (kebab-case-able) and the one-sentence decision. If both are clear from context, skip.

2. **Pick the next free number.**
   - List `docs/specs/adr/` and look at filenames matching `^[0-9]{4}-`.
   - The new number is `max(existing) + 1`, zero-padded to 4 digits.

3. **Copy the template.** Read `docs/specs/adr/_template.md` and write a new file at `docs/specs/adr/NNNN-<kebab-title>.md`. Replace:
   - `NNNN — Decision title` → `NNNN — <Title Case Title>`
   - `Status: Proposed | Accepted | Superseded by NNNN` → `Status: Proposed` (the user moves it to `Accepted` after review)
   - `Date: YYYY-MM-DD` → today's date
   - `Deciders: @your-handle, @co-decider` → the user's GitHub handle if known.
   - The instructional prose under each section heading → seed bullets the user can fill in.

4. **Pre-fill what you can.** From the conversation context, draft:
   - **Context** — at least one paragraph summarizing the forces at play.
   - **Decision** — the one-sentence decision the user provided.
   - **Consequences** — at least one positive and one negative bullet.
   - **Alternatives considered** — list any alternatives the user mentioned, each with a one-line dismissal.

5. **Handle supersession.** If this ADR replaces an earlier one:
   - Add `Supersedes: NNNN` to the new ADR's frontmatter.
   - Edit the old ADR's `Status:` to `Superseded by NNNN`.
   - Reference the new ADR from the old one in a final "Superseded" section.

6. **Update the index.** Edit `docs/specs/adr/README.md` and add a row to the index table.

7. **Report back.** Tell the user the path created, the ADR number, and that the status is `Proposed` until they merge it.

## Conventions to preserve

- ADRs are **append-only**. Never edit a merged ADR's substance; supersede it instead.
- ADR numbers are independent of capability spec numbers.
- The format is **MADR-lite** (Context, Decision, Consequences, Alternatives). Don't add new sections without consulting the template.

## Verification before reporting done

- [ ] The new file exists and parses as valid Markdown.
- [ ] The number is unique within `docs/specs/adr/`.
- [ ] The index in `docs/specs/adr/README.md` is updated.
- [ ] If superseding, the prior ADR's status was updated.
