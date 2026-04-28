# NNNN — Capability name: test specification

> Template for test specs. Copy this file into `capabilities/NNNN-<kebab>.test.md` or `cross-cutting/<topic>.test.md` and fill in.

## Capability under test

Link to the capability spec / ADR / API operation under test.

## Behaviors covered

Mapping table from Behavior bullets in the capability spec → test IDs in this file. Every `MUST` / `SHOULD` / `MAY` bullet must appear here.

| Behavior bullet (paraphrased) | Test scenarios |
| --- | --- |
| chatlab MUST … | `XX-01`, `XX-02` |
| chatlab SHOULD … | `XX-03` |

## Test pyramid breakdown

Per [ADR 0010](../adr/0010-test-strategy.md). Adjust shape per capability.

- **Unit + integration** (Vitest): list test IDs run from `test/`
- **Screenshot capture** (Playwright `docs:capture`): list test IDs that drive the UI to a known state for screenshots — non-asserting

## Preconditions

What state must exist before any scenario in this file runs.

- chatlab running on `http://localhost:4480` with default config (or specify deltas).
- Personas / fixtures referenced inline.

## Test scenarios

### XX-01 — Title (HAPPY PATH)

- **Type:** Unit | Integration | Screenshot
- **Persona:** Bruno | Camila | Diego (per [`personas.md`](../../personas.md))
- **Covers:** capability behavior bullet(s); openapi operations
- **Setup:** any per-scenario state beyond Preconditions
- **Steps:**
  1. …
  2. …
- **Expected:**
  - Assertion 1
  - Assertion 2

### XX-02 — Title (ERROR / EDGE CASE)

(same shape)

## Error codes exercised

| HTTP status | Triggered by | Test ID |
| --- | --- | --- |
| `404` | XX-NN | XX-NN |

## Verification matrix (coverage proof)

Coverage proof — completed before the capability flips to `Status: Implemented`.

| Verification checkbox in capability spec | Test ID |
| --- | --- |
| - [ ] Scenario X | XX-NN |
