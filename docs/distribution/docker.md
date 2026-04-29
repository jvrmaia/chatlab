# Distribution: Docker

> **Status:** Image not yet published to Docker Hub. The Dockerfile is in the repo and works today via `docker build`.

The Docker distribution targets:

- **Polyglot teams** whose agent isn't written in Node.js.
- **CI pipelines** that prefer running services as containers.
- **Reproducible demos** where "run this one command" is the bar.

## Quick start (today, build locally)

```bash
git clone https://github.com/jvrmaia/chatlab.git
cd chatlab
docker build -t chatlab:dev .
docker run --rm -p 4480:4480 chatlab:dev
```

Then open `http://localhost:4480/ui`.

## Quick start (after Docker Hub publish)

```bash
docker run --rm -p 4480:4480 jvrmaia/chatlab:latest
```

## Image

| Property | Value |
| --- | --- |
| Registry | Docker Hub |
| Repository | `jvrmaia/chatlab` (planned) |
| Base | `node:22-bookworm-slim`. Alpine was rejected because Alpine + native modules (`better-sqlite3`, `@duckdb/node-api`) is a recurring source of musl/glibc bugs. |
| Architectures | `linux/amd64`, `linux/arm64` |
| Default exposed port | `4480` |
| Default user | non-root |

Tags published per release:

- `latest` — latest stable release
- `next` — pre-release builds
- `vX.Y.Z` — exact version
- `vX.Y` — latest patch in a minor line
- `vX` — latest in a major line

## Configuration

All configuration goes through environment variables — the same ones documented in [`npm.md`](./npm.md). For example:

```bash
docker run --rm \
  -p 4480:4480 \
  -e CHATLAB_HOME=/data \
  -e CHATLAB_REQUIRE_TOKEN=hunter2 \
  -v "$PWD/chatlab-data:/data" \
  chatlab:dev
```

Notes:

- The container's default workspace home is `/data`. Mount a host directory there to persist workspaces (and per-workspace SQLite/DuckDB files) across container restarts.
- The container defaults to `CHATLAB_HOST=0.0.0.0`, `CHATLAB_PORT=4480`. Because the host is non-loopback, the bind-safety check requires `CHATLAB_REQUIRE_TOKEN` to be set — set it explicitly.

Secure example:

```bash
docker run --rm -p 4480:4480 \
  -e CHATLAB_REQUIRE_TOKEN=hunter2 \
  chatlab:dev
```

## docker-compose

A working example lives at [`docs/distribution/compose.example.yml`](https://github.com/jvrmaia/chatlab/blob/main/docs/distribution/compose.example.yml) plus the matching [`Caddyfile.example`](https://github.com/jvrmaia/chatlab/blob/main/docs/distribution/Caddyfile.example). It runs chatlab behind a Caddy reverse proxy with automatic Let's Encrypt TLS:

```bash
export CHATLAB_DOMAIN=chatlab.example.com
export CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)
docker compose -f docs/distribution/compose.example.yml up -d
```

Caddy provisions the cert on first request to your domain and proxies all traffic — including the `/ws` upgrade — to the chatlab container on the internal Compose network. Use only when DNS for `$CHATLAB_DOMAIN` is already pointing at the host.

## Health & readiness

The container exposes:

- `GET /healthz` — process is alive
- `GET /readyz` — accepting traffic (HTTP listener up, storage initialized)

Both return `200 OK` when healthy. Suitable for Kubernetes liveness/readiness probes.

## Smoke test the container

Once running:

```bash
# Health probes — no auth required
curl http://localhost:4480/healthz

# List workspaces — needs the configured token
curl -H "Authorization: Bearer hunter2" \
  http://localhost:4480/v1/workspaces
```

Open <http://localhost:4480/ui> to interact with the UI.

## Multi-arch builds (publishing)

Released images are multi-arch (`linux/amd64` + `linux/arm64`). The release workflow uses `docker buildx`:

```bash
docker buildx create --name chatlab --driver docker-container --use
docker buildx inspect --bootstrap

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t jvrmaia/chatlab:1.0.0-rc.1 \
  -t jvrmaia/chatlab:next \
  --push .
```

This is wired up in `.github/workflows/release.yml` and runs from a clean GitHub Actions runner per release (no carry-over caches between releases). Native module quirks for `better-sqlite3` and `@duckdb/node-api` are why we run on `bookworm-slim` rather than Alpine — see the table above.

## Bind-safety

Same rules as the npm path: `CHATLAB_HOST` other than `127.0.0.1` requires `CHATLAB_REQUIRE_TOKEN`. The container exits with code 78 if both conditions fail. See [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#bind-safety).
