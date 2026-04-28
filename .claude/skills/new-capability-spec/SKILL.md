---
name: new-capability-spec
description: Scaffold a new capability spec under docs/specs/capabilities/ from the project template. Use when the user says "new capability spec", "scaffold a capability", "draft a spec for <X>", or otherwise wants to start a new spec file in this repo.
---

# new-capability-spec

Scaffold a new capability spec for `chatlab`.

## When to use

- The user asks to draft a new emulator capability (e.g. "let's spec out reactions", "add a capability for status broadcasts").
- The user says "new spec", "new capability", "scaffold a capability spec".

Do **not** use this skill to author ADRs — use [`new-adr`](../new-adr/SKILL.md) for that.

## Steps

1. **Confirm scope.** Ask the user (one short message) for: the capability name (kebab-case), and one sentence describing what it does. If the user already gave both, skip.

2. **Pick the next free number.**
   - List `docs/specs/capabilities/` and look at filenames matching `^[0-9]{4}-`.
   - The new number is `max(existing) + 1`, zero-padded to 4 digits. If no specs exist, start at `0001`.

3. **Copy the template.** Read `docs/specs/capabilities/_template.md` and write a new file at `docs/specs/capabilities/NNNN-<kebab-name>.md`. Replace:
   - `NNNN — Capability name` → `NNNN — <Title Case Name>`
   - `Status: Draft` (leave as Draft — only maintainer review moves it forward)
   - `Authors: @your-handle` → the user's GitHub handle if known, otherwise leave the placeholder for them to fill.
   - Remove the template's instructional prose under each section heading; replace with `_TODO: …_` placeholders so the structure is visible but the content is obviously unfinished.

4. **Add minimal seed content.** Pre-fill the **Summary** with the one-sentence description from step 1, and pre-fill the **Motivation** section's first sentence with "This capability matters because …" so the author has a runway.

5. **Update the index.** Edit `docs/specs/README.md` and `docs/ROADMAP.md` to link the new capability under the appropriate section. If unsure which roadmap milestone it belongs to, leave a `<!-- TODO: place in milestone -->` comment.

6. **Report back.** Tell the user:
   - The path of the file you created.
   - That `Status` is `Draft` and what it takes to move it to `Accepted` (resolve all Open Questions, plus maintainer review).
   - The path of the index files you updated.

## Conventions to preserve

- Numbers are 4-digit, zero-padded.
- Filenames are kebab-case; titles are Title Case.
- Specs live only under `docs/specs/capabilities/` — never elsewhere.
- The template at `docs/specs/capabilities/_template.md` is the source of truth for the section structure. If the template changes, this skill keeps working without modification.

## Verification before reporting done

- [ ] The new file exists and parses as valid Markdown.
- [ ] The number you picked is unique.
- [ ] The index in `docs/specs/README.md` was updated.
- [ ] The roadmap was updated *or* a TODO comment was left explaining why placement was deferred.
