# 0002 — Language and runtime

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** @jvrmaia

## Context

The emulator needs a single primary language and runtime. Two distribution channels are explicitly in scope (NPM and Docker, see [ADR 0003](./0003-distribution-channels.md)), so the runtime must be one that fits the NPM channel naturally — i.e. Node.js. Within that, the language choice is JavaScript or TypeScript.

The audience is developers building chat agents. They are likely to read the emulator's source (to debug issues, to extend it for their use case, or to copy patterns into their own code), so source-code clarity matters.

The project will define a non-trivial public contract: HTTP requests/responses, WebSocket frames, webhook payloads. Type definitions for that contract are valuable both internally and as exported types for TypeScript consumers.

## Decision

The emulator is written in **TypeScript** targeting **Node.js 22 LTS** (current LTS at the time of writing).

- `tsconfig.json` is configured strictly: `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`.
- Module resolution is `NodeNext`; `package.json` declares `"type": "module"`.
- Node version is pinned via `.nvmrc` and the `engines` field in `package.json`.
- The published NPM package ships compiled JavaScript in `dist/` with `.d.ts` declarations, so JS-only consumers don't need a TypeScript toolchain.

## Consequences

- **Positive:** the public contract has machine-checkable types, which doubles as documentation and catches a class of bugs at compile time.
- **Positive:** TypeScript is the default for new Node projects in 2026 — most contributors will already have it installed.
- **Positive:** the typed surface lets us export typed clients later (for tests against the emulator) without retrofitting.
- **Negative:** a build step is required. We accept that overhead.
- **Negative:** Node-only restricts the contributor pool. Mitigated by the Docker channel, which lets non-Node teams *use* the emulator without contributing to it.

## Alternatives considered

- **JavaScript (no TypeScript)** — rejected. The contract surface is too large to maintain accurately without types; we'd end up writing JSDoc that approximates TypeScript anyway.
- **Go** — rejected. Single static binary is attractive, but it removes the natural NPM channel and shrinks the contributor pool we expect (chat-agent developers are disproportionately JS/TS).
- **Rust** — rejected for the same reasons as Go, plus a steeper contribution curve.
- **Python** — rejected. Pip is not a great match for "drop into any project as a dev dependency". Async ergonomics are also weaker than Node's for a real-time emulator.
- **Deno / Bun** — rejected as a primary runtime (we want the broadest ecosystem fit), but kept as candidates for tooling scripts.
