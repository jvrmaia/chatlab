---
name: add-llm-provider
description: Wire a new LLM provider into chatlab end-to-end (type union, factory, OpenAPI enums, UI defaults + dropdown, providers.md, README + project-overview counts). Use when the user says "add a new provider", "support <name>", "wire up the X provider".
---

# add-llm-provider

Add a new provider adapter to chatlab. The wire format is OpenAI-compatible by default (so most providers route through the existing `openai-compat` adapter); only Anthropic-shape adapters need a new HTTP client.

## When to use

- The user wants to add a provider that ships in the next release (e.g. Mistral La Plateforme, Together AI, Groq, x-ai, …).
- The user added an internal-corporate provider with an OpenAI-compat surface and wants it as a first-class option in the UI dropdown.

Do **not** use this skill if the user just wants to point at a custom endpoint **for development** — that's the `custom` provider already in v1.0. Adding a new entry only makes sense when the provider is durable and has a stable name.

## Inputs to confirm before editing

Ask the user (single message, all at once):

1. **Slug** (kebab, e.g. `mistral`, `together`, `groq`).
2. **Display name** for docs (e.g. "Mistral La Plateforme").
3. **Default `base_url`** (the OpenAI-compat endpoint, with `/v1` if applicable).
4. **Default model** (whatever model string the provider's docs lead with).
5. **Requires API key?** — almost always `true` for cloud providers, `false` for local-only.
6. **HTTP shape** — OpenAI-compat (the common case) or Anthropic-shape (rare, only if the provider literally requires the `system`-as-top-level-field + `x-api-key` header layout).

Halt and ask if the user can't answer (3) or (4) confidently — guessing leads to silent 404s downstream.

## Steps (touch every file, in this order)

### 1. Type system

`src/types/agent.ts`:

- Add the slug to the `AgentProvider` union (alphabetical-ish — preserve the existing order grouping).
- Add the slug to the `AGENT_PROVIDERS` const array (same position).
- Add a row to `PROVIDER_DEFAULTS`:
  ```ts
  <slug>: { base_url: "<...>", model: "<...>", requires_api_key: true | false },
  ```

### 2. Adapter routing

`src/agents/factory.ts`:

- If OpenAI-compat: **no change needed**. The factory falls through to `openAiCompat` for everything except `anthropic`.
- If Anthropic-shape: extend the `if (name === "anthropic")` to `if (name === "anthropic" || name === "<slug>")`. (This is rare. Don't add a new adapter file unless the request body genuinely diverges.)

### 3. OpenAPI

`docs/specs/api/openapi.yaml`:

- There are 3 enums listing providers (search for `enum: [openai, anthropic, deepseek, gemini, maritaca, ollama, custom]`).
- Add the new slug to each — preserve order. Example: `enum: [openai, anthropic, deepseek, gemini, maritaca, ollama, custom, <slug>]`.
- Run `npx -y -p @redocly/cli@2.30.3 redocly lint docs/specs/api/openapi.yaml` to confirm valid.

### 4. UI

`src/ui/api.ts`:

- Add the slug to the `UiAgentProvider` union (mirror `AgentProvider`).
- Add the row to `UI_PROVIDER_DEFAULTS` (mirror `PROVIDER_DEFAULTS`).

`src/ui/components/admin/AgentsList.tsx`:

- Add the slug to the `PROVIDERS: UiAgentProvider[]` array (the dropdown source).

### 5. User-facing docs

`docs/providers.md`:

- Add a row to the top table (provider / default model / default base_url / API key / Local? / notes).
- Add a `## <Display Name>` section between existing provider sections, mirroring the OpenAI / Anthropic shape:
  - Where to get a key.
  - Common models.
  - Quirks (auth header, rate limits, regional gating, BR-PT bias if relevant).
  - One curl example creating the agent.
- Update the "Picking a default for development" table if the new provider serves a niche the existing list doesn't (cheapest, fastest, multimodal, etc.).

`README.md` and `docs/project-overview.md`:

- Bump the provider count: "seven providers" → "eight providers". Update the parenthetical list of LLM clients if the new one isn't a `custom`-flavor.
- Capability matrix in README: bump `(7 providers, …)` → `(8 providers, …)`.

`CLAUDE.md`:

- Update the parenthetical list in the "What this project is" paragraph.

`docs/ROADMAP.md`:

- Update the `0002-agents` bullet's count.

`docs/user-guide/02-workspaces-and-agents.md`:

- Add a row to the providers table.
- Update the "Seven providers" / "Eight providers" lead-in.

`docs/specs/capabilities/0002-agents.md`:

- Update the type-literal in Summary.
- Update the count in the "Seven providers… two HTTP adapters" sentence.

`CHANGELOG.md`:

- Add a `### Providers` entry under `## [Unreleased]` describing the new provider one-liner.

### 6. Acceptance test (optional but recommended)

If the new provider has any quirk worth covering (custom auth header, non-standard error envelope), add a Vitest spec under `test/agents/<slug>.test.ts` that hits the adapter with a stubbed `fetch` and asserts the request shape.

## Verification before reporting done

- [ ] `npm run typecheck` clean.
- [ ] `npm test` clean (87+ passing; the existing `runner.test.ts` exercises the adapter via the factory).
- [ ] `npx -y -p @redocly/cli@2.30.3 redocly lint docs/specs/api/openapi.yaml` clean.
- [ ] `npm run build` clean.
- [ ] `npm run docs:build` clean (`onBrokenLinks: 'throw'`).
- [ ] The new slug appears in the UI dropdown after `npm start` → Admin → Agents → New agent.
- [ ] Manual probe via `POST /v1/agents/{id}/probe` returns a non-error response (when given a real API key).

## Conventions to preserve

- **Defaults are advisory.** Users override `base_url` / `model` on every agent; the defaults are just what the form pre-fills.
- **Provider slugs are stable.** Once shipped, never rename — JSONL exports persist `agent_version: <slug>:<model>` and downstream pipelines slice by slug.
- **API key masking is universal.** The HTTP layer's `publicAgent`/`maskApiKey` already covers every provider; don't bypass.
- **At-rest encryption is universal.** `api_key` columns are encrypted regardless of provider — see `SECURITY.md#at-rest-encryption`.
