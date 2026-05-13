# 0017 — LLM integration layer: build vs adopt SDK

- **Status:** Accepted
- **Date:** 2026-05-12
- **Deciders:** @jvrmaia

## Context

chatlab integrates with seven LLM providers: OpenAI, DeepSeek, Gemini, Maritaca, Ollama, `custom` (any OpenAI-compatible endpoint), and Anthropic. The current integration layer is hand-written in two files:

| File | Covers | Lines |
| --- | --- | --- |
| `src/agents/openai-compat.ts` | All six OpenAI-compat providers (including `custom`) | 111 |
| `src/agents/anthropic.ts` | Anthropic | 141 |

Both files implement `LlmProvider` — a two-method interface (`chat` + `chatStream`) defined in `src/agents/provider.ts`. Each uses `fetch` directly, parses SSE with a `ReadableStreamDefaultReader`, and extracts content from the provider's response envelope.

The v0.4.0 roadmap adds **multimodal forwarding** (image content parts in the message array) and **tool / function calling** (tool schemas in the request, tool-use blocks in the response). These features are what force a decision about the integration layer:

- **Multimodal**: `LlmMessage.content` changes from `string` to `string | ContentPart[]`. OpenAI and Anthropic use different schemas for image content parts.
- **Tool calling**: OpenAI sends `tools: [...]` + parses `tool_calls` in the delta; Anthropic sends a different `tools` schema + parses `tool_use` content blocks. Both also differ from each other on streaming.

Without a decision recorded here, the project would drift toward one of several paths by default, each with different long-term costs.

### The `custom` provider constraint

The `custom` provider is the **core value proposition** of chatlab — it points at the OpenAI-compatible endpoint the developer is building. Any integration approach that adds headers, rewrites the request body, or wraps the response in ways outside the developer's control would undermine this core use case. The `custom` provider's wire format must remain transparent.

## Decision

**We continue building the integration layer ourselves for OpenAI-compat providers (including `custom`), and adopt `@anthropic-ai/sdk` for the Anthropic provider when tool calling or multimodal is implemented in v0.4.0.**

### Part 1: OpenAI-compat — continue DIY

The six OpenAI-compat providers (OpenAI, DeepSeek, Gemini, Maritaca, Ollama, and `custom`) stay on the hand-written `openai-compat.ts` implementation. Reasons:

1. **`custom` provider transparency.** The OpenAI SDK would add a `User-Agent` header and could apply request transforms. We cannot guarantee our wire format is unchanged. With `fetch` directly, what we send is exactly what the spec says we send.
2. **Current scope is small.** `openai-compat.ts` is 111 lines covering non-streaming and SSE streaming. Adding multimodal content parts (image URLs in the message array) and tool schemas is a well-understood extension to the same JSON body — estimated +50–80 lines, not a rewrite.
3. **No provider-specific SDK maintenance.** The OpenAI Node SDK version, its peer deps, and its type definitions would become dependencies to manage and keep current. For a feature set of two methods (`chat` + `chatStream`), that maintenance is not worth the benefit.

### Part 2: Anthropic — adopt `@anthropic-ai/sdk` at v0.4.0

When implementing tool calling for Anthropic, replace `src/agents/anthropic.ts` with an implementation backed by `@anthropic-ai/sdk`. Reasons:

1. **Anthropic's message format is unique.** It does not follow the OpenAI schema: system messages are top-level, content is an array of typed blocks (`text`, `image`, `tool_use`, `tool_result`), streaming uses `content_block_delta` events with a `type` field rather than OpenAI's `delta.content`. This is a growing maintenance surface.
2. **Tool use in particular.** Anthropic tool-use responses interleave `tool_use` and `text` content blocks. Parsing this correctly in streaming requires tracking `input_json_delta` fragments and reassembling them. The official SDK does this correctly and is maintained by Anthropic.
3. **`custom` constraint does not apply.** Anthropic is a named, stable provider — not a developer-supplied endpoint. An SDK wrapping a known API is appropriate here.
4. **The SDK is ESM-compatible and TypeScript-first** — consistent with [ADR 0002](./0002-language-and-runtime.md).

### Part 3: SSE parsing extraction (independent of SDK choice)

`openai-compat.ts` and `anthropic.ts` currently both contain ~30 lines of identical SSE reader machinery (`ReadableStreamDefaultReader` → `TextDecoder` → split on `\n` → filter `data: ` lines). This is infrastructure duplicated across both files.

This shared machinery should be extracted to `src/lib/sse.ts` as a generator function:

```typescript
export async function* parseSseLines(body: ReadableStream<Uint8Array>): AsyncIterable<string>
```

Each provider's `chatStream` then consumes it and applies its own content-extraction logic. This extraction is independent of the SDK decision and should land before v0.4.0 regardless.

### Triggers for revisiting this decision

This ADR should be superseded if any of the following occur:

1. A **third non-OpenAI-compat provider** (e.g. Google Gemini's native API, Cohere, Mistral native) is added — at that point, the DIY surface may justify a unified SDK.
2. The OpenAI-compat implementation grows past **300 lines** with multimodal + tool calling — an indicator that DIY is not paying off.
3. A published, stable provider-agnostic TypeScript SDK with first-class support for `custom` OpenAI-compat endpoints reaches ecosystem maturity (currently, Vercel AI SDK is the closest candidate but ties providers to specific adapters and would complicate the `custom` provider).

## Consequences

- **Positive:** `custom` provider transparency is guaranteed. The wire format is plain `fetch` with no intermediary.
- **Positive:** `openai-compat.ts` stays small. Multimodal + tool calling extensions are additive JSON changes, not architectural ones.
- **Positive:** `@anthropic-ai/sdk` offloads the complex streaming reassembly (tool-use input fragments, SSE event sequencing) to the library's maintainer for the one provider that justifies it.
- **Positive:** one new dependency (`@anthropic-ai/sdk`) rather than a multi-provider SDK that would pull in adapters for providers we already handle ourselves.
- **Negative:** two patterns in the codebase — DIY for openai-compat, SDK for Anthropic. A new contributor reading `anthropic.ts` and `openai-compat.ts` in parallel will notice the asymmetry. Mitigated by this ADR and inline code comments explaining the split.
- **Negative:** `@anthropic-ai/sdk` adds a runtime dependency and its update cycle to track. Mitigated by Dependabot (per [ADR 0012](./0012-security-and-dependency-scanning.md)).
- **Neutral:** the SSE extraction (`src/lib/sse.ts`) reduces duplication regardless of SDK choice, and should land in v0.3.x as a prerequisite cleanup.

## Alternatives considered

- **Adopt the OpenAI Node SDK for all six OpenAI-compat providers.** Rejected. The `custom` provider is an operator-supplied endpoint; the SDK adds a `User-Agent` header and may apply request normalization. Transparent `fetch` is the right tool for an endpoint we don't control.
- **Adopt Vercel AI SDK (`ai` + `@ai-sdk/*` adapters) for all providers.** Rejected. The unified API is appealing, but `@ai-sdk/openai` requires instantiating provider objects with typed config — it does not model the "any OpenAI-compat URL" pattern cleanly. The `custom` provider would either be an afterthought or require custom glue that defeats the point of adopting the SDK.
- **Keep Anthropic DIY through v0.4.0.** Considered. The current `anthropic.ts` at 141 lines is manageable. Rejected specifically for tool calling: the `input_json_delta` fragment reassembly in streaming is error-prone to implement correctly, and is exactly the problem the official SDK solves.
- **Build a shared SSE parser library rather than extracting to `src/lib/sse.ts`.** Rejected. The existing duplication is two files in the same codebase; extracting to a local module is the right scope. Publishing a separate package would add release overhead for no external audience.
