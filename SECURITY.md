# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| ≥ 1.1.0 | Yes — active security fixes |
| 1.0.x | End-of-life — upgrade to 1.1.0 |
| < 1.0.0 | Not supported |

## Reporting a vulnerability

**Please do not file public issues for security problems.**

Instead, send a private report by either:

- Opening a [GitHub private security advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository, **or**
- Emailing the maintainer: `maia.jvrm@gmail.com`

Please include:

- A description of the issue and its impact
- Steps to reproduce (a minimal proof-of-concept is ideal)
- The version / commit SHA you tested against
- Any suggested fix or mitigation

## What to expect

- Acknowledgement within **7 days**.
- A first-pass triage and severity assessment within **14 days**.
- Coordinated disclosure: we agree on a fix and a public-disclosure date with the reporter before publishing.

## Scope

This project is a **local development tool**. It is intentionally not designed to face the public internet — that is out of scope for our threat model. Issues we *do* care about include:

- Code execution via crafted message payloads
- Path traversal in media-handling endpoints
- Dependency supply-chain issues
- Insecure defaults that would surprise a developer running chatlab on `localhost`

If you find something that looks bad but does not fit the categories above, report it anyway — we'd rather hear about it.

## Bind-safety

To prevent accidental exposure on Docker bridges, ngrok / Tailscale tunnels, or `0.0.0.0` binds, chatlab **refuses to start** when **both** of the following hold:

- `CHATLAB_HOST` resolves to anything other than `127.0.0.1`, `localhost`, or `::1`.
- `CHATLAB_REQUIRE_TOKEN` is unset or empty.

In that case the process exits with **code 78** (`EX_CONFIG`) and prints:

```
chatlab: refusing to bind to <host> without CHATLAB_REQUIRE_TOKEN.
  Either set CHATLAB_HOST=127.0.0.1 (default) or export
  CHATLAB_REQUIRE_TOKEN=<your-shared-secret>.
```

This rule is enforced **before** the HTTP listener opens, so no port is ever bound during a misconfiguration. To intentionally run a public-facing demo (not recommended), set both variables explicitly.

## At-rest encryption

Provider API keys (the `api_key` field on every Agent profile) are encrypted at rest with **AES-256-GCM**. Reads decrypt transparently; the masking layer (`***last4` in HTTP responses) and the JSONL feedback export already excluded the field, and that hasn't changed.

The master key is resolved in this order:

1. **`CHATLAB_MASTER_KEY` env var** — base64 of exactly 32 bytes. The right wiring for CI, Docker secrets, Kubernetes `Secret` mounts.
2. **`$CHATLAB_HOME/master.key` file** — 32 raw bytes, mode `0600`, auto-generated on first boot if absent.

OS-keychain integration (macOS Keychain, Linux Secret Service, Windows Credential Manager) is a future enhancement; v1.0 sticks to file + env to avoid native deps.

**Rotation.** The format carries a version marker (`enc:v1:<iv>:<ct>:<tag>`). Rotation is "decrypt with old → re-encrypt with new" per agent — see the [cookbook recipe](./docs/cookbook.md#rotate-the-master-key-re-encrypt-all-stored-api-keys).

**Failure mode.** Lose the master key, lose the cleartext. Storage adapters fail-soft on decrypt errors (return the ciphertext as-is, don't crash) so you always have a recovery path through "delete the agent profile, re-create with the same `api_key`". Plaintext-legacy rows from before the encryption rollout are still readable; every subsequent write encrypts them.

The encryption boundary is per-cell; conversation contents (messages, feedback, annotations) are **not** encrypted at rest — full-disk encryption on the host (FileVault / LUKS / BitLocker) is still the right control for those. See [`docs/legal/data-handling.md`](./docs/legal/data-handling.md) for the full data-class breakdown.

## Data handling

chatlab stores chats, messages, media, ratings, and annotations locally — see [`docs/legal/data-handling.md`](./docs/legal/data-handling.md) for the LGPD/GDPR posture, retention defaults, and the DPA template for teams adopting chatlab commercially.

## Automated scanning on PRs

Per [ADR 0012](./docs/specs/adr/0012-security-and-dependency-scanning.md), the project runs:

- **CodeQL** SAST on every PR to `main` and weekly cron.
- **Gitleaks** secret scan on every PR to `main`.
- **OSV-Scanner** dependency vulnerability scan on PRs touching manifests, plus a **daily cron at 05:00 UTC**.
- **Dependabot** opens daily PRs with version bumps (npm + GitHub Actions ecosystems).

Findings publish to the **Security tab** of this repository. Maintainers triage from there.
