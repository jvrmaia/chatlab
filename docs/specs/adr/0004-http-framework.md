# 0004 — HTTP framework

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** @jvrmaia

## Context

chatlab exposes an HTTP surface (defined in [`docs/specs/api/openapi.yaml`](../api/openapi.yaml)) for the developer's chat agent to call into. We need to choose a Node.js HTTP framework. Constraints:

- **TypeScript-first.** The project is TS by [ADR 0002](./0002-language-and-runtime.md); typed handlers are non-negotiable.
- **Familiar.** Most chat-agent developers already know Express. A familiar framework lowers the barrier to reading and patching chatlab.
- **Stable API.** The framework should not be churning while the project is.
- **Middleware ecosystem.** We need body parsing, file uploads (for media), CORS for the bundled UI, and request logging without writing them ourselves.

## Decision

We use **Express** (4.x or current stable line) as the HTTP framework. TypeScript types come from `@types/express`.

- Routers are organized per resource (workspaces, chats, agents, feedback, media) under `src/http/routers/`.
- A thin error-handling middleware converts thrown domain errors into the JSON error envelope defined in [`docs/specs/api/openapi.yaml`](../api/openapi.yaml).
- File uploads go through `multer` (or its TS-native equivalent at the time of implementation).
- The Web UI's static assets are mounted on the same Express app via `express.static`.

This decision **does not** cover WebSocket transport — that remains open and will be settled in a follow-up ADR alongside the Web UI WebSocket spec.

## Consequences

- **Positive:** familiar to the target audience. Patches and forks are accessible.
- **Positive:** mature middleware ecosystem covers our needs without invention.
- **Positive:** Express composes well with WebSocket libraries (`ws`, Socket.IO) sharing the same HTTP server, keeping our deployment simple.
- **Negative:** Express is older-style — async error propagation requires either `express-async-errors` or hand-wrapped handlers. We accept the small ergonomic cost.
- **Negative:** Express 5 has been "near release" for years. We pin to 4.x for now; an ADR will revisit if and when 5.x is materially better.

## Alternatives considered

- **Fastify** — modern, faster, JSON-schema-first. Rejected because the speed advantage is irrelevant for a developer-machine emulator and the schema-first style would clash with our spec-first workflow (we'd be defining contracts in two places).
- **Hono** — light, modern, edge-friendly. Rejected: edge-runtime story is not a goal of ours, and the ecosystem is younger.
- **Native `node:http`** — rejected. Rebuilding routing and middleware in-house is busywork and bug surface.
- **NestJS** — rejected. Heavyweight for a project that doesn't need DI / decorators / opinionated structure.
