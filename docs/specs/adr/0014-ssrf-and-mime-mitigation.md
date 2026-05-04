# 0014 — SSRF and MIME-spoof mitigation

- **Status:** Accepted
- **Date:** 2026-05-03
- **Deciders:** @jvrmaia

## Context

Three HIGH-severity vulnerabilities were identified and fixed during the post-v1.1.0 security sprint (commit `50ff950`):

1. **WebSocket auth bypass** — `WsGateway` accepted connections before checking `requireToken`; fixed by wiring `verifyClient` with a constant-time `timingSafeEqual` check.
2. **MIME-spoof XSS** — the media-download endpoint served uploaded files with their stored MIME type and no `Content-Disposition` header; a stored file with type `text/html` would execute in the browser as a script.
3. **SSRF via agent `base_url`** — the `custom` provider accepts an operator-supplied `base_url`; without host validation any user with API access could probe internal services by setting `base_url=http://169.254.169.254/...`.

The TRB post-security-sprint review (2026-05-03) confirmed fixes (1) and (2) as complete. Fix (3) was found to be **incomplete**: the initial blocklist covered loopback (`127.x`, `::1`), known cloud IMDS endpoints (`169.254.169.254`, `100.100.100.200`, `metadata.google.internal`, `metadata.goog`), and an explicit hostname block (`localhost`), but omitted RFC-1918 private ranges and IPv6 private ranges — the primary attack surface in Docker/Kubernetes deployments where the pod network is typically `10.x`.

This ADR records the decision rationale for both mitigations so future maintainers can trace "why is this specific blocklist here?" to a recorded decision.

## Decision

### SSRF mitigation — `validateBaseUrl` (`src/http/routers/agents.ts`)

`validateBaseUrl` rejects any `base_url` whose resolved hostname matches:

| Category | Patterns blocked |
| --- | --- |
| Loopback (IPv4) | `127.0.0.0/8` (`/^127\./.test(host)`) |
| Loopback (IPv6) | `::1` |
| RFC-1918 class A | `10.0.0.0/8` (`/^10\./.test(host)`) |
| RFC-1918 class B | `172.16.0.0/12` (`/^172\.(1[6-9]|2\d|3[01])\./.test(host)`) |
| RFC-1918 class C | `192.168.0.0/16` (`/^192\.168\./.test(host)`) |
| Link-local (IPv4) | `169.254.0.0/16` (`/^169\.254\./.test(host)`) |
| Known IMDS | `100.100.100.200`, `metadata.google.internal`, `metadata.goog` |
| IPv6 ULA | `fc00::/7` (`/^f[cd]/.test(host)`) |
| IPv6 link-local | `fe80::/10` (`/^fe[89ab]/.test(host)`) |
| Unspecified | `0.0.0.0` |
| Explicit hostname | `localhost` |

The validation runs at both `POST /v1/agents` (create) and `PATCH /v1/agents/:id` (update). It returns HTTP 400 with `error_subcode: "ZZ_INVALID_BASE_URL"`.

**Why blocklist over allowlist:** the `custom` provider is explicitly designed for arbitrary local or remote endpoints that the developer is building. An allowlist of known-good hosts would break the core use case. A blocklist of known-bad IP ranges is the correct balance.

**Why regex over CIDR library:** the patterns are simple enough to be correct without a dependency. Each regex covers exactly one RFC-defined range. This avoids a third-party dependency in the hot path of every agent create/update and is easy to audit.

**Residual gaps accepted:** DNS rebinding (resolving a legitimate hostname to a private IP after validation) is not mitigated at the validation layer. A SSRF-via-rebinding attack is harder to execute in the chatlab threat model (local-first dev tool, not a hosted service). If chatlab is deployed in a shared network environment, operators should use network-level egress filtering in addition to this application-layer check.

### MIME-spoof XSS mitigation (`src/http/routers/media.ts`, `src/server.ts`)

Two complementary controls were added:

1. **`Content-Disposition: attachment`** is set on every `/v1/media/:id/download` response. This prevents the browser from rendering the file inline even if the `Content-Type` is executable (e.g., `text/html`).
2. **`X-Content-Type-Options: nosniff`** is set globally in `server.ts`. This prevents MIME-sniffing attacks where the browser ignores the declared `Content-Type` and infers a more dangerous one.
3. **`ALLOWED_MIME_BY_TYPE`** in `src/types/media.ts` restricts accepted upload types to image and audio/video MIME patterns, explicitly excluding `text/html`, `text/javascript`, `application/javascript`, and `application/x-httpd-php`.

The three controls are defense-in-depth: each independently prevents the stored-XSS vector; together they are resilient against partial bypasses.

## Consequences

- **Positive:** the SSRF blocklist covers the most material attack surface in Docker/K8s deployments (RFC-1918 pod networks). `POST /v1/agents` now returns 400 for all private-range `base_url` values.
- **Positive:** the MIME-spoof XSS path is closed at three independent layers. A future misconfiguration in one layer does not reopen the vulnerability.
- **Positive:** both mitigations are testable and are covered by regression tests: `AGT-H-09` (SSRF blocked hosts) and `MEDIA-H-*` (MIME enforcement).
- **Negative:** RFC-1918 blocking prevents chatlab from pointing a `custom` agent at a sidecar running on a private subnet. Operators in this situation must expose the agent on a public or non-RFC-1918 address, or run chatlab itself inside the same private network.
- **Neutral:** DNS rebinding is out of scope for this mitigation. Documented as a known residual gap.

## Alternatives considered

- **SSRF: reject non-HTTPS `base_url`** — rejected. Developers running local agents on `http://localhost` need HTTP. Requiring HTTPS would break the default `custom` provider template.
- **SSRF: allowlist specific hostnames** — rejected. The `custom` provider's value is arbitrary endpoint support; an allowlist is incompatible with the core use case.
- **SSRF: use a CIDR library** — rejected. The three RFC-1918 ranges are well-defined and the regex patterns are simpler and dependency-free. A library would add complexity for no material correctness gain.
- **MIME: store only the file extension and re-derive Content-Type at serve time** — rejected. Extension spoofing (uploading `evil.html` renamed to `image.png`) would bypass this. The upload-time MIME check + `Content-Disposition: attachment` is more robust.
- **MIME: strip all Content-Type headers and serve as `application/octet-stream`** — considered. Rejected because audio/video playback in the UI requires a correct `Content-Type` for the `<audio>` / `<video>` controls.
