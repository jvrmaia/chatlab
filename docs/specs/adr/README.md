# Architecture Decision Records

This folder contains ADRs — short documents that record a single, durable architectural decision and the reasoning behind it. They are append-only: once an ADR is `Accepted`, it does not get edited; if the decision changes, a new ADR supersedes it.

We use **MADR-lite**: Context, Decision, Consequences, Status. See [`_template.md`](https://github.com/jvrmaia/chatlab/blob/main/docs/specs/adr/_template.md).

## When to write an ADR

Write one when you are about to make a decision that:

- Will be costly to reverse later.
- Will affect contributors who weren't in the discussion.
- Has multiple defensible answers and you want to capture *why* this one won.

Don't write an ADR for choices that are obvious, easily reversible, or would be derived from reading the code anyway.

## Index

| # | Title | Status |
| --- | --- | --- |
| 0001 | [Record architecture decisions](./0001-record-architecture-decisions.md) | Accepted |
| 0002 | [Language and runtime](./0002-language-and-runtime.md) | Accepted |
| 0003 | [Distribution channels](./0003-distribution-channels.md) | Accepted |
| 0004 | [HTTP framework](./0004-http-framework.md) | Accepted |
| 0005 | [Web UI framework](./0005-web-ui-framework.md) | Accepted |
| 0006 | [Persistence engines](./0006-persistence-engines.md) | Accepted |
| 0007 | [Feedback corpus model and export contract](./0007-feedback-corpus-model.md) | Accepted |
| 0008 | [Mermaid for diagrams](./0008-mermaid-for-diagrams.md) | Accepted |
| 0009 | [GitHub Pages documentation site](./0009-github-pages-documentation-site.md) | Accepted |
| 0010 | [Test strategy](./0010-test-strategy.md) | Accepted |
| 0011 | [Hosted instance (Deferred)](./0011-hosted-instance-deferred.md) | Deferred |
| 0012 | [Security and dependency scanning](./0012-security-and-dependency-scanning.md) | Accepted |
| 0013 | [Adopt the chatlab design system](./0013-adopt-claude-design-system.md) | Accepted |

## How to write a new one

1. Copy [`_template.md`](https://github.com/jvrmaia/chatlab/blob/main/docs/specs/adr/_template.md) to a new file `NNNN-kebab-name.md` with the next free number.
2. Fill it in. Aim for one page; the value is in the rationale, not the prose.
3. Open a PR. Once merged, update the index above.

The [`new-adr`](https://github.com/jvrmaia/chatlab/blob/main/.claude/skills/new-adr/SKILL.md) Claude Code skill does steps 1-2 for you.
