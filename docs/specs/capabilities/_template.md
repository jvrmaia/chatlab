# NNNN — Capability name

- **Status:** Draft
- **Authors:** @your-handle
- **Related ADRs:** _none yet_
- **Depends on:** _list of capability specs that must exist first, or "none"_

## Summary

One paragraph. What does this capability do, observed from the outside? Plain English; avoid implementation language.

## Motivation

Why does this capability matter for someone building a chat agent? What can they do with it that they couldn't before? If this capability is purely "we need it to be faithful to WhatsApp", say so.

## User stories

Bullet list. Concrete, scenario-shaped statements.

- As a **chat-agent developer**, I want to … so that ….
- As a **human tester driving the Web UI**, I want to … so that ….

## Behavior

What the emulator must do, item by item. Each item should be testable. Reference the API surface in [`../api/`](../api/) instead of redefining it here.

- chatlab MUST …
- chatlab SHOULD …
- chatlab MAY …

Use [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119) keywords — uppercased — when you need to be unambiguous about requirement strength.

## Out of scope

Things a reader might reasonably expect this capability to cover, but which are **not** part of it. Link to the spec that does cover them, or note them as future work.

## Open questions

Numbered list of things that aren't resolved yet. Each open question must be resolved before the spec moves to `Status: Accepted`.

1. ?
2. ?

## Verification

How a reviewer can convince themselves the implementation matches the spec. Usually a list of scenarios to run through the HTTP API and the Web UI.

- [ ] Scenario 1: …
- [ ] Scenario 2: …

## Acceptance

Required to flip `Status: Draft → Implemented`. Reviewers cross-check that each line points at something concrete that would fail if the feature were reverted.

- **Vitest test ID(s):** e.g. `WS-01`, `WS-02` in `test/storage/_battery.ts` — list at least one regression-protective spec.
- **OpenAPI operation(s):** the operation IDs in [`openapi.yaml`](../api/openapi.yaml) that this capability adds or modifies (or `none` if it has no HTTP surface).
- **User Guide section:** the URL of the docs page (under `docs/user-guide/` or `docs/`) that walks a reader through this capability end-to-end.
