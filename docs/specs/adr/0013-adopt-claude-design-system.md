# 0013 — Adopt the chatlab design system

- **Status:** Accepted
- **Date:** 2026-04-30
- **Deciders:** @jvrmaia

## Context

[ADR 0005](./0005-web-ui-framework.md) chose React + Tailwind + Vite for the browser UI without committing to a particular visual language. As the UI grew, the codebase reflected that gap:

- `src/ui/tailwind.config.ts` extended Tailwind with ad-hoc theme additions and unused color tokens.
- Every component styled itself with inline Tailwind utility classes drawn from a four-palette grab-bag (`emerald-*`, `slate-*`, `rose-*`, `amber-*`). No tokens, no primitives.
- No theming. No dark mode. No density variants. No icon set.

A finished design system was authored externally and committed to the repo as `docs/_design/`:

- `tokens.css` — OKLCH-based warm-neutral palette (`h=90`) + desaturated sage accent (`h=165`, `c=0.08`), IBM Plex Sans/Mono typography, an 8pt spacing scale, radii, soft layered shadows, motion easing/durations, and layout vars (`--col-rail`, `--col-list`, `--col-logs`, `--topbar-h`, `--inputbar-h`). Light is default; dark is `:root[data-theme="dark"]`; densities are `:root[data-density="compact|cozy|comfy"]`.
- `components.css` — vanilla-CSS primitives: `.btn` (4 variants × 3 sizes + icon), `.input`/`.textarea`/`.select`/`.field`, `.badge` (5 semantic variants), `.card` (header/title/subtitle/body), `.dot`, `.kbd`, `.tabs`/`.tab`, `.scroll-area`, `.icon`.
- `icons.js` — 38 lucide-style stroke icons.
- `Design System.html` — reference page rendering the system at parity.

The design system is finished and authoritative. The decision is *how* to integrate it without abandoning the working Tailwind toolchain or accidentally creating two sources of visual truth.

## Decision

Adopt `docs/_design/` as the canonical design system for the chatlab UI, integrated via a **token-bridged hybrid** approach.

Concretely:

1. **`tokens.css` and `components.css` are imported verbatim** in `src/ui/styles.css`, before the `@tailwind` directives. They are not forked, not rewritten as `@apply` recipes, and not duplicated.
2. **Tailwind is rewired to read CSS variables.** `src/ui/tailwind.config.ts` extends `colors`, `fontFamily`, `fontSize`, `lineHeight`, `spacing`, `borderRadius`, `boxShadow`, `transitionDuration`, and `transitionTimingFunction` to point at `var(--token)` names. So `bg-canvas`, `text-ink-1`, `bg-accent-600`, `font-mono`, `shadow-md`, etc., resolve to the same tokens that drive the primitive classes — guaranteed parity.
3. **`darkMode: ['selector', ':root[data-theme="dark"]']`** flips the variant on the same attribute the tokens key off of.
4. **Components mix utilities and primitives** under one rule: when an element *is* a button / input / card / badge / bubble / tab, it uses the primitive class (`.btn`, `.input`, `.card`, `.badge`, `.bb`, `.tab`); for layout (flex, grid, gap, sizing) it uses Tailwind utilities. Adding `bg-accent-600` on top of `.btn--primary` is forbidden — that's two sources of truth.
5. **`icons.js` is ported to a typed React `<Icon>` component** at `src/ui/components/Icon.tsx`. The icon name is a discriminated union (`keyof typeof PATHS`) so typos fail at compile time. No new runtime dependency.
6. **Theme + density are user-controllable.** A `<ThemeToggle>` lives in the header (`src/ui/App.tsx`); selections persist in `localStorage` (`chatlab.theme`, `chatlab.density`); a tiny inline `<script>` in `index.html` reads them and sets `data-theme`/`data-density` on `<html>` *before* React mounts to avoid a flash of wrong theme. Initial fallback uses `prefers-color-scheme: dark` + `cozy`.
7. **`<DevDrawer>` follows the global theme**, removing its previously hardcoded dark surface. The "log feel" is carried by `font-mono` and dedicated `.log` rows — not by forcing a dark surface inside a light shell.
8. **Decorative emojis stay forbidden** (per CLAUDE.md), but the existing UI-affordance carve-out remains: 👍/👎 (feedback), 📎 (attach), 📝 (notes) — these glyphs are user-visible characters, not icons.

ADR 0005 is **amended, not superseded.** React/Tailwind/Vite stay; the design system layer is additive.

## Consequences

- **Positive:**
  - One source of visual truth. Both primitive classes and Tailwind utilities resolve to the same CSS variables; designers can edit tokens without code changes propagating.
  - Dark mode and three densities arrive "free" — flipping `data-theme` / `data-density` on `<html>` is enough.
  - No new runtime dependency. The 38 icons we use ship inline as ~1 KB of path data; we did not adopt `lucide-react`.
  - Type-safe icon names; bad icons fail at `tsc`, not at runtime.
  - Visual fidelity is verifiable: open `docs/_design/Design System.html` next to the running app.
- **Negative:**
  - Tailwind's `bg-color/40` opacity-modifier syntax does not compose with `var(--token)`-defined colors. Workarounds: use the predefined `*-bg` tokens (`--success-bg`, `--accent-50`) for translucent surfaces, or accept solid colors. No real-world component currently needs the modifier.
  - The Tailwind spacing scale is collapsed to the design tokens (`sp-1` through `sp-10`); Tailwind's default `0.5`/`1.5`/`2.5` half-steps disappear. None of the current components used them.
  - The legacy palette is removed in one pass — anyone with an in-flight branch styling against `emerald-*`/`slate-*`/`rose-*`/`amber-*` must rebase.
- **Neutral but worth noting:**
  - The design system is treated as a vendored artifact: `docs/_design/` is the canonical location. Editing `components.css` should be deliberate; the conventional escape hatch is to add small app-only extensions at the bottom of `src/ui/styles.css` (used here for `.log`/`.av` rows that the chat shell needs but the design system frames as out-of-scope primitives).
  - The Playwright capture pipeline (`npm run docs:capture`) will produce a large screenshot diff on first run. That diff is by design.

## Alternatives considered

- **Pure Tailwind, port `components.css` to `@apply` recipes.** Rejected. The primitives in `components.css` are already polished, focus-state-correct, and self-documenting; reauthoring them as `@apply` doubles the maintenance surface and makes OKLCH + multi-step focus rings ugly. Tailwind's `@apply` is for one-off shortcuts, not for hosting a design system.
- **Drop Tailwind entirely; vanilla CSS only.** Rejected. The repo's existing layout style is utility-first and readers expect it. Replacing nine components' worth of `flex`/`grid`/`gap` with bespoke classes is busywork without payoff.
- **Adopt shadcn/ui + Radix.** Rejected. Conflicts with ADR 0005's "no heavy component library" stance, brings a large dependency tree, and we already have the styled primitives we need.
- **Add `lucide-react` for icons.** Rejected. ~1 MB unminified for 38 known icons we already own; the typed inline port is ~50 lines.

## References

- `docs/_design/tokens.css`, `docs/_design/components.css`, `docs/_design/icons.js`, `docs/_design/Design System.html`.
- [ADR 0005 — Web UI framework](./0005-web-ui-framework.md) (amended).
