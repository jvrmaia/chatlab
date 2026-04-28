# 0008 — Mermaid for diagrams

- **Status:** Accepted
- **Date:** 2026-04-29
- **Deciders:** @jvrmaia

## Context

The project's documentation already includes diagrams (component sketch in [`ARCHITECTURE.md`](../../ARCHITECTURE.md), data flow, capability dependency graph) and will accumulate more as specs and ADRs grow. We need a single, durable convention for **how diagrams live in the repository** so contributors don't pick whatever they reach for first and the docs stay consistent.

Constraints that shape the choice:

- **Diff-friendly.** Diagrams change. PRs should show *what* changed — binary images don't.
- **Zero install.** Newcomers and CI bots should render diagrams without running anything special.
- **Renders where readers actually read.** The primary surface is GitHub's Markdown viewer; secondary surfaces are VS Code, the eventual Docusaurus / similar site.
- **Expressive enough.** We need flowcharts, sequence diagrams, ER-style component graphs — not pixel art.
- **Stays in `docs/`.** No external rendering pipeline, no CI step that exports SVGs.

## Decision

We adopt **Mermaid** as the standard for diagrams in this repository.

- Diagrams live **inline** in Markdown files, in fenced blocks tagged ` ```mermaid ` … ` ``` `. No external `.mmd` / `.puml` files, no checked-in PNG/SVG exports.
- GitHub renders Mermaid in Markdown natively; VS Code with the Markdown Preview Mermaid Support extension does the same. No build step required.
- ASCII art diagrams are **deprecated**. New diagrams must be Mermaid; existing ASCII diagrams are converted opportunistically when the surrounding text is touched.
- For the rare case Mermaid cannot express a diagram cleanly (architectural exception only), commit a plain SVG under `docs/assets/diagrams/` and link it. Open an ADR to record the exception so it doesn't become a precedent.
- The `docs-reviewer` Claude Code subagent flags non-Mermaid diagrams during review.

## Consequences

- **Positive:** diagrams version-control as text. Reviewers see the diff in the PR and can reason about what moved.
- **Positive:** zero install for contributors. Anyone with a Markdown editor can edit the source and a GitHub PR view to verify the render.
- **Positive:** consistent visual style across all diagrams in the project.
- **Positive:** Mermaid covers everything we need today (`flowchart`, `sequenceDiagram`, `classDiagram`, `erDiagram`, `gantt`, `stateDiagram`, `journey`).
- **Negative:** Mermaid's auto-layout is sometimes ugly for dense graphs. Mitigation: the SVG escape hatch exists for the rare case.
- **Negative:** not every Markdown renderer supports Mermaid. Notably, the npm registry's README renderer renders the fenced block as code, not as an image. Mitigation: the README's diagrams stay minimal; rich diagrams live under `docs/`.
- **Negative:** Mermaid syntax is not as expressive as PlantUML for sequence diagrams. Acceptable — the diagrams we need are not edge cases.

## Alternatives considered

- **ASCII art (status quo)** — rejected. Hard to maintain, looks crude, no semantic meaning; readers can't tell at a glance what the boxes represent.
- **PlantUML** — rejected. Requires a Java runtime or a hosted server; does not render natively in GitHub Markdown.
- **Draw.io / diagrams.net** — rejected. Editing is in a UI, output is verbose XML or a binary `.drawio` file. Diff hostile.
- **Excalidraw** — rejected for the same reason: pretty output, but the source is a JSON blob that doesn't review well.
- **Structurizr (C4 model)** — rejected. Powerful but overkill for a small project; tooling expects a hosted instance or a separate build step.
- **Plain SVG checked into the repo** — rejected as the **default** (kept as a documented escape hatch for cases Mermaid can't handle).
- **Hosted diagrams (e.g. Whimsical, Lucidchart, Miro)** — rejected. External dependency, no offline rendering, license concerns.