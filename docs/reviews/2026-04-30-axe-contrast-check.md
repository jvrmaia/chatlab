# OKLCH contrast check — `chatlab` v1.0.0

- **Date:** 2026-04-30
- **Project:** `chatlab` v1.0.0 (release-candidate state immediately before tag)
- **Scope:** color-pair contrast ratios computed from the design tokens in [`docs/_design/tokens.css`](https://github.com/jvrmaia/chatlab/tree/main/docs/_design/tokens.css), light-theme palette only.
- **Method:** OKLCH → OKLab → linear sRGB → companded sRGB → relative luminance (WCAG 2.1) → contrast ratio. Source script: [`scripts/oklch-contrast.mjs`](https://github.com/jvrmaia/chatlab/tree/main) (one-off).

## Reviewer note

This artefact is **partial evidence** for TRB review item 7 (axe-DevTools manual sweep). Color-pair contrast is one class of accessibility finding; axe-DevTools also validates ARIA composition, keyboard navigation, focus traps, landmark structure, and several markup patterns that this report does **not** cover. Item 7 remains **Partial** in the action register until a manual axe pass against the running UI lands.

## Light-theme contrast table

WCAG 2.1 AA thresholds: **4.5:1** for body text (or 3:1 for "large text" ≥ 18 pt regular / 14 pt bold), **3:1** for non-text UI (icons, focus rings, borders that convey state).

| Foreground | Background | FG hex | BG hex | Ratio | AA Text (4.5:1) | AA UI (3:1) | Notes |
| --- | --- | --- | --- | ---: | :---: | :---: | --- |
| `--ink-1` | `--bg-canvas` | `#1c1a15` | `#fbfaf7` | 16.63 | ✓ | ✓ | primary text on canvas |
| `--ink-1` | `--bg-surface` | `#1c1a15` | `#fefdfb` | 17.07 | ✓ | ✓ | primary text on surface |
| `--ink-1` | `--bg-sunken` | `#1c1a15` | `#f6f5f1` | 15.87 | ✓ | ✓ | primary text on sunken |
| `--ink-2` | `--bg-canvas` | `#4a4842` | `#fbfaf7` | 8.84 | ✓ | ✓ | secondary text on canvas |
| `--ink-2` | `--bg-surface` | `#4a4842` | `#fefdfb` | 9.08 | ✓ | ✓ | secondary text on surface |
| `--ink-3` | `--bg-canvas` | `#74716b` | `#fbfaf7` | 4.66 | ✓ | ✓ | tertiary text / captions |
| `--ink-3` | `--bg-sunken` | `#74716b` | `#f6f5f1` | **4.45** | **AA Large only** | ✓ | tertiary text on sunken (DevDrawer log meta column, `kbd`, footer mono) |
| `--ink-4` | `--bg-canvas` | `#a19e98` | `#fbfaf7` | **2.57** | — | **✗** | placeholder / disabled (intentionally low; WCAG exempts disabled state) |
| `--accent-700` | `--accent-50` | `#135b42` | `#e6f6ee` | 7.28 | ✓ | ✓ | accent text on accent-50 (active sidebar item, `.btn--accent`) |
| `--accent-700` | `--accent-100` | `#135b42` | `#cdeede` | 6.50 | ✓ | ✓ | accent text on accent-100 |
| `--accent-ink` | `--accent-600` | `#fefdfb` | `#2f7258` | 5.67 | ✓ | ✓ | primary button label |
| `--accent-ink` | `--accent-700` | `#fefdfb` | `#135b42` | 8.00 | ✓ | ✓ | primary button hover label |
| `--bubble-user-ink` | `--bubble-user` | `#1a2e25` | `#daf2e6` | 12.23 | ✓ | ✓ | user message bubble text |
| `--bubble-agent-ink` | `--bubble-agent` | `#1c1a15` | `#fefdfb` | 17.07 | ✓ | ✓ | agent message bubble text |
| `--warn` | `--warn-bg` | `#b99056` | `#feefdc` | **2.59** | **✗** | **✗** | `.badge--warn` body text — **fails AA** |
| `--danger` | `--danger-bg` | `#b25f56` | `#ffece9` | **3.96** | **AA Large only** | ✓ | `.badge--danger` body text + failed bubble text |
| `--accent-700` | `--bg-surface` | `#135b42` | `#fefdfb` | 8.00 | ✓ | ✓ | logo wordmark tone, focus ring outline |
| `--accent-300` | `--bg-canvas` | `#7cbea1` | `#fbfaf7` | **2.06** | — | **✗** | spacing-bar viz in design-system reference page (decorative) |

## Findings

### Médio — `.badge--warn` body text fails AA (2.59:1)

`--warn: oklch(68% 0.090 75)` on `--warn-bg: oklch(96% 0.030 75)` produces 2.59:1 — below both 4.5:1 (text) and 3:1 (UI). The badge is small body text, so AA-Large fallback doesn't help.

**Use sites:** `AnnotationsPanel` "unsaved" badge; `DevDrawer` `.log--warn` rows; the WS reconnect status banner (`badge--warn` when `wsStatus === "closed"`).

**Fix options:** drop `--warn`'s L from 68% to ~55% (becomes `oklch(55% 0.090 75)`, ratio rises to ~5.4:1). Or darken text only when on warn-bg (`.badge--warn { color: oklch(45% 0.09 75); }`). The token-level fix is cleaner.

### Baixa — `.badge--danger` / failed-bubble text only AA-Large (3.96:1)

`--danger: oklch(58% 0.110 27)` on `--danger-bg: oklch(96% 0.025 27)` produces 3.96:1. This passes WCAG **AA Large** (≥ 18pt regular / 14pt bold) but the failed-bubble error message is body size (`text-xs`), and so is `.badge--danger`.

**Use sites:** `MessageBubble` failed state ("Agent failed" + monospace error); `.badge--danger` in `WorkspacesPanel` / `AgentsList`.

**Fix options:** darken `--danger` to `oklch(50% 0.110 27)` (ratio rises to ~4.9:1), or constrain the danger-bg pairing to non-body uses only (icons, borders).

### Baixa — `--ink-3 on --bg-sunken` is 0.05 below AA (4.45:1)

The DevDrawer's monospace log meta column (`.log__t`, `.log__m`, `.log__x`) uses `--ink-3` on `--bg-sunken` (the drawer body). 4.45:1 misses AA by exactly 0.05 — the kind of finding axe-DevTools flags as "review needed" rather than "must fix".

**Fix options:** drop `--ink-3` to `oklch(52% 0.010 90)` (ratio rises to ~5.1:1) or change the DevDrawer body to `--bg-canvas` (which gets the column to 4.66:1 = pass).

## Findings that look bad but aren't

- **`--ink-4` at 2.57:1 against canvas.** `--ink-4` is the placeholder / disabled token. WCAG exempts disabled-state UI from the contrast requirement (Success Criterion 1.4.3 explicitly excludes "incidental" and "logotypes"; disabled controls fall in WAI-ARIA's "incidental" interpretation). Not a finding.
- **`--accent-300` at 2.06:1 against canvas.** Used for the design-system reference page's spacing-bar visualization — purely decorative, not interactive, not conveying state. Not a finding.

## Dark theme

This pass covered light only. Dark-theme tokens in `tokens.css` are derived from the same H/C plus inverted L; running the same script with `:root[data-theme="dark"]` values would produce a parallel report. Recommendation: do this when item 7 is fully closed (combined with the manual axe pass).

## What this evidence does not cover

Items 7's full closure requires a manual axe-DevTools pass on the live UI. The pass also needs to verify:

- ARIA roles compose correctly under screen readers (NVDA / VoiceOver).
- Tab order is sensible and matches visual flow.
- No focus traps in modals / drawers.
- Keyboard shortcuts (`Esc` to close drawers, `Enter` to submit forms).
- Skip-to-content landmark (today the UI has no `<main role="main" aria-label="…">` skip target — flag for review).
- Mobile breakpoints (`--col-list: 300px` is non-responsive below 480px viewport).

These are not the kind of finding a contrast script can produce.

## Recommended action

The three findings above are **CSS-only**. Two paths:

1. **Pre-tag fix** — adjust `--warn`, `--danger`, `--ink-3` token values; rerun this script; expect all-pass; rerun screenshot capture. Adds maybe a day of design-review time.
2. **Tag with knowns** — ship `v1.0.0` documenting these as known issues in `docs/troubleshooting.md` or here, schedule the fix for `v1.0.1`. This is honest if the maintainer is constrained on the design-review side; less honest if it stays "fix in v1.x" indefinitely.

The TRB GA review (`docs/reviews/2026-04-30-v1.0.0-ga.md`) keeps item 7 as **Partial** until both this report's findings are addressed and the manual axe pass lands.
