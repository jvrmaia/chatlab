# 0001 — Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** @jvrmaia

## Context

`chatlab` is open-source and expects to outlive its initial author's day-to-day involvement. Architectural decisions made in conversation or in commit messages decay quickly: the "why" gets lost, and contributors arriving six months later either re-litigate the same questions or build on top of choices they don't fully understand.

We need a lightweight, durable mechanism to record decisions where the **rationale** matters as much as the outcome.

## Decision

We adopt **Architecture Decision Records (ADRs)** in the [MADR-lite](https://adr.github.io/madr/) flavor — Context, Decision, Consequences — stored in [`docs/specs/adr/`](./), numbered `NNNN-kebab-name.md`.

ADRs are **append-only**. To revisit a decision, write a new ADR that supersedes the old one and update the old ADR's `Status:` field to `Superseded by NNNN`.

The [`new-adr`](https://github.com/jvrmaia/chatlab/blob/main/.claude/skills/new-adr/SKILL.md) Claude Code skill scaffolds new ADRs from the template.

## Consequences

- **Positive:** durable rationale survives contributor turnover. Reviewers have a single place to point newcomers when explaining why something is the way it is.
- **Positive:** the act of writing an ADR forces clearer thinking before a decision is made.
- **Negative:** small overhead — every non-trivial decision now has paperwork.
- **Neutral:** old ADRs remain in the repo forever. That's the point.

## Alternatives considered

- **Wiki / external docs site** — rejected because docs that live outside the repo drift from the code that implements the decision.
- **Commit messages only** — rejected because finding "why did we do X" via `git log` is slow and depends on the discoverer knowing what to grep for.
- **Inline comments in code** — rejected because architectural decisions often span many files and don't have a natural home in any one of them.
