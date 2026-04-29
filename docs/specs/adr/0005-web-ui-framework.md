# 0005 — Web UI framework

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** @jvrmaia

## Context

Capability spec [`0006-web-ui`](../capabilities/0006-web-ui.md) calls for a browser-side companion that visually mimics WhatsApp Web closely enough that a human can drive any chat as "the user". One of its Open Questions was: which frontend stack?

Constraints:

- **TypeScript-first** (per [ADR 0002](./0002-language-and-runtime.md)).
- **Familiar to the target audience** (chat-agent developers — disproportionately React-experienced).
- **Component-rich.** A WhatsApp-like UI has dozens of small, reusable components (chat row, message bubble, status tick, typing indicator, composer, member panel, dev drawer, …). The framework should make that ergonomic.
- **Sane styling story.** WhatsApp's UI is layout-heavy; we need utility-class density without hand-rolling a design system.
- **Bundleable as static assets** that the Express server can serve from `/ui` without a separate dev process at runtime.

## Decision

The Web UI is built with **React 18+** and styled with **Tailwind CSS**.

- The UI source lives under `src/ui/` and builds to static assets in `dist/ui/` consumed via `express.static` (see [ADR 0004](./0004-http-framework.md)).
- Build tool: **Vite** for the UI build. It produces the static bundle the Express server serves.
- TypeScript everywhere, including the UI. JSX → TSX.
- Tailwind config is colocated with the UI source (`src/ui/tailwind.config.ts`).
- We deliberately avoid pulling in a heavy component library (Material UI, Chakra, Ant) — the UI is small, opinionated, and benefits from the matching-WhatsApp-pixel-by-pixel control that Tailwind primitives give.
- For state, default to **React's built-in primitives** (`useState`, `useReducer`, `useContext`). Only adopt a state library (Zustand, Jotai, Redux Toolkit) if we hit a concrete pain — and via a follow-up ADR.

This decision **does not** lock in a routing library, a forms library, or a query-cache library. Those are deferred until we have a concrete need.

## Consequences

- **Positive:** React + Tailwind is the most familiar stack to our target audience; contributions are easy to attract.
- **Positive:** Vite gives fast dev cycles and a clean static-asset output for the Express server to serve.
- **Positive:** Tailwind's utility model maps well to "match a specific design system" — we're imitating WhatsApp Web, not designing a new one.
- **Negative:** the published NPM package's footprint grows because the UI is bundled in. Mitigation: Vite tree-shakes; we measure and revisit if the install size becomes a developer complaint.
- **Negative:** React's runtime cost is non-trivial. For our scale (≤1k chats, ≤10k messages in dev) it's a non-issue.
- **Neutral:** non-React contributors face a learning curve. Acceptable given the audience.

## Alternatives considered

- **Solid / Svelte / Preact** — rejected. Each is technically attractive (smaller bundle, faster runtime) but each shrinks the contributor pool we expect.
- **Vanilla web components / no framework** — rejected. The component count is too high; we'd reinvent props / state-flow / list reconciliation.
- **Next.js / Remix** — rejected. Both assume an SSR / file-routed application served by Node — overkill for a static-asset bundle that lives behind Express.
- **Plain CSS / CSS modules / vanilla-extract** instead of Tailwind — rejected. The "match a known visual" task is exactly Tailwind's strong suit.
- **Tailwind + a component library on top (shadcn/ui, etc.)** — kept as a possible future addition, not a current decision. We start with raw Tailwind and pull in shadcn-style primitives only if we end up rebuilding the same primitives by hand.
