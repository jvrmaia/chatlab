# 0003 — Distribution channels

- **Status:** Accepted
- **Date:** 2026-04-28
- **Deciders:** @jvrmaia

## Context

`chatlab` is a developer tool. Its value is proportional to how easy it is to get running on a developer's machine. Different developers prefer different on-ramps:

- **Node-shop developers** want `npx <thing>` or a `devDependency`.
- **Polyglot teams or CI pipelines** want `docker run <image>`.
- **Contributors and integrators with custom needs** want to clone, patch, and run from source.

Picking only one channel locks out the others. Picking all three from day one risks spreading effort thin.

## Decision

We support **three distribution channels** as first-class:

1. **NPM** — primary for Node-shop developers. CLI plus programmatic API. Documented in [`docs/distribution/npm.md`](../../distribution/npm.md).
2. **Docker Hub** — image at `jvrmaia/chatlab`, multi-arch (`amd64` + `arm64`). Documented in [`docs/distribution/docker.md`](../../distribution/docker.md).
3. **Source clone** — fully supported, with a development workflow documented in [`docs/distribution/manual.md`](../../distribution/manual.md).

All three deliver **the same artifact** — a Node program built from the same source. The Docker image is a thin wrapper around the NPM package; the source-clone path runs the same code via `npm start`.

Channel rollout order is staged with the milestones (see [`ROADMAP.md`](../../ROADMAP.md)):

- **v0.1**: NPM + source-clone.
- **v0.2**: Docker Hub joins.

Configuration is **shared across channels** — environment variables work the same in all three. CLI flags exist for NPM and source-clone; Docker uses env vars exclusively.

## Consequences

- **Positive:** developers find the on-ramp that fits their workflow. No one is told "first install Node" or "first install Docker" — they pick.
- **Positive:** Docker doubles as the answer for "how do I demo this in an environment I don't control" (CI, customer's laptop, etc.).
- **Positive:** the source-clone path is what contributors use anyway, so we get it for free.
- **Negative:** publishing pipeline has to maintain two artifacts (NPM tarball + Docker image). We accept this — it's automatable.
- **Negative:** any breaking change in env-var names ripples across all three channels' docs. We agree to centralize the env var reference in [`docs/distribution/npm.md`](../../distribution/npm.md) and link from the others.

## Alternatives considered

- **NPM only** — rejected. Locks out polyglot teams and complicates CI usage.
- **Docker only** — rejected. Forces a container runtime even on developer laptops where Node would be lighter.
- **NPM + Docker, drop source-clone as "supported"** — rejected. Source-clone is what every contributor uses; explicitly supporting it is honesty, not extra work.
- **Add a Homebrew tap / apt repo / scoop bucket** — deferred. Not in scope until 1.0; revisit if there is concrete demand.
