# Distribution: cross-cutting test specification

## Anchored in

- [`docs/distribution/npm.md`](../../../distribution/npm.md)
- [`docs/distribution/docker.md`](../../../distribution/docker.md)
- [`docs/distribution/manual.md`](../../../distribution/manual.md)
- [ADR 0003](../../adr/0003-distribution-channels.md)

## Concerns under test

| Channel | Test scenarios |
| --- | --- |
| **NPM** — `npx @jvrmaia/chatlab` | `DST-01`, `DST-02`, `DST-03` |
| **Docker** — `docker run jvrmaia/chatlab` | `DST-04`, `DST-05`, `DST-06`, `DST-07` |
| **From source** — `git clone && npm install && npm start` | `DST-08`, `DST-09` |
| **Cross-channel parity** — same env vars, same behavior | `DST-10` |

## Test pyramid

All scenarios here are **deployment-tier** — they run on a release-candidate workflow (`workflow_dispatch` + tag-push) before publishing artifacts. None block per-PR runs except `DST-08` (source-clone smoke).

## OS matrix

Where relevant, scenarios run across **macOS** (latest), **Ubuntu** (22.04), and **Windows** (latest WSL2). Scenarios where OS is irrelevant note `OS: any`.

## Test scenarios

### DST-01 — `npx @jvrmaia/chatlab` cold-installs and runs
- **OS matrix:** macOS, Ubuntu, Windows-WSL2
- **Setup:** clean `~/.npm`; Node from `.nvmrc` installed.
- **Steps:** `npx -y @jvrmaia/chatlab@<rc-version>`.
- **Expected:**
  - Listens on `:4480` within 10 s of cold install.
  - `/healthz` returns `200`.
  - Cold run consumes < 200 MB RSS at idle.

### DST-02 — Programmatic API (in-process startChatlab)
- **OS:** any
- **Steps:** import `startChatlab` from `@jvrmaia/chatlab` in a script; spin up; assert running; stop.
- **Expected:** matches the documented surface in `npm.md§Programmatic API`.

### DST-03 — All env vars documented in `npm.md` actually take effect
- **OS:** any
- **Steps:** for each of `CHATLAB_PORT`, `CHATLAB_HOST`, `CHATLAB_HOME`, `CHATLAB_WORKSPACE_ID`, `CHATLAB_LOG_LEVEL`, `CHATLAB_REQUIRE_TOKEN`, `CHATLAB_FEEDBACK_RETENTION_DAYS`, set the value and verify behavior changes.
- **Expected:** every env var has a corresponding observable effect; the doc table doesn't ship with phantom switches.

### DST-04 — `docker run` cold pulls and runs (amd64)
- **OS:** Linux runner with Docker.
- **Steps:** `docker run --rm -p 4480:4480 jvrmaia/chatlab:<rc-tag>` on amd64.
- **Expected:** container starts; `/healthz` 200 within 10 s.

### DST-05 — `docker run` works on arm64
- **Setup:** Linux runner with `qemu-user-static` configured (or native arm64 runner).
- **Steps:** as DST-04 but with `--platform linux/arm64`.
- **Expected:** identical behavior — multi-arch image must work without extra config.

### DST-06 — Volume-mounted persistence survives container restart
- **Steps:**
  1. `docker run --rm -v /tmp/chatlab-vol:/data -e CHATLAB_HOME=/data ...` create a workspace + send messages.
  2. Stop container.
  3. Start fresh container with same volume.
- **Expected:** workspace + messages persist.

### DST-07 — Bind-safety in container
- **Steps:** `docker run -e CHATLAB_HOST=0.0.0.0 ...` without `CHATLAB_REQUIRE_TOKEN`.
- **Expected:** container exits with code `78`; stderr matches `SEC-01` expectations.

### DST-08 — From-source smoke test (per-PR)
- **OS matrix:** macOS, Ubuntu, Windows-WSL2.
- **Steps:** `git clone <repo>`; `npm install`; `npm start`.
- **Expected:** matches DST-01.

### DST-09 — From-source dev workflow scripts
- **Steps:** run `npm run build`, `npm run dev`, `npm test`, `npm run typecheck` per `manual.md`.
- **Expected:** each script exits 0; `dev` watches for changes and rebuilds.

### DST-10 — Same env vars produce same behavior across channels
- **Steps:** run a small scenario suite (5 happy-path tests) against each channel using identical env vars.
- **Expected:** identical results across npm, Docker, and from-source. **No channel-specific behavior.**

## Verification matrix

Each row of the env var tables in `npm.md` and `docker.md` ties to `DST-03`. Each tag of the Docker image table ties to `DST-04` / `DST-05`. The "Same configuration shared across channels" claim in [ADR 0003 §Decision](../../adr/0003-distribution-channels.md) ties to `DST-10`.
