# Providers

chatlab ships seven provider adapters. Five are remote LLM clouds (require an API key), one runs locally (Ollama), and one is **`custom`** — pointing chatlab at the agent **you are building**.

| Provider | Default model | Default `base_url` | API key | Local? |
| --- | --- | --- | --- | --- |
| `openai` | `gpt-4o` | `https://api.openai.com/v1` | required | no |
| `anthropic` | `claude-sonnet-4-6` | `https://api.anthropic.com` | required | no |
| `deepseek` | `deepseek-chat` | `https://api.deepseek.com` | required | no |
| `gemini` | `gemini-2.5-flash` | `https://generativelanguage.googleapis.com/v1beta/openai` | required | no |
| `maritaca` | `sabia-3` | `https://chat.maritaca.ai/api` | required | no |
| `ollama` | `llama3` | `http://localhost:11434/v1` | not required | yes |
| `custom` | `my-agent` | `http://localhost:8000/v1` | not required | yes |

All of these route through one of two HTTP adapters internally — `openai-compat` (works with any OpenAI-shaped chat-completions endpoint) or `anthropic` (different request body, different auth header). You **do not** need to know which one your provider uses; the factory in `src/agents/factory.ts` picks correctly from the `provider` field.

The model strings above are the ones the UI pre-fills. Override them per agent with whatever string the upstream provider currently advertises.

---

## OpenAI

**Where to get a key:** [`platform.openai.com/api-keys`](https://platform.openai.com/api-keys).

**Common models:** `gpt-4o`, `gpt-4o-mini`, `o1-preview`, `o3-mini`. The list moves; use whatever the OpenAI docs currently advertise.

**Quirks:**

- Reasoning models (`o*`) accept the same chat-completions shape but charge for hidden reasoning tokens — expect higher per-call cost than `gpt-4o`.
- The default `base_url` works for the OpenAI cloud. If you front it with a proxy (Helicone, LiteLLM), set `base_url` accordingly.

```bash
curl -X POST $CL/v1/agents -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenAI gpt-4o",
    "provider": "openai",
    "model": "gpt-4o",
    "api_key": "sk-...",
    "system_prompt": "You are a friendly assistant."
  }'
```

---

## Anthropic

**Where to get a key:** [`console.anthropic.com/settings/keys`](https://console.anthropic.com/settings/keys).

**Common models:** `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`. Anthropic publishes a versioned list at [`docs.anthropic.com/en/docs/about-claude/models`](https://docs.anthropic.com/en/docs/about-claude/models).

**Quirks:**

- Anthropic's HTTP shape differs from OpenAI's: the `system` prompt is a top-level field, not a message. chatlab's `anthropic` adapter handles the split automatically — you just put your system text in `system_prompt` and the adapter routes it correctly.
- Anthropic's auth header is `x-api-key`, not `Authorization: Bearer`. Again, handled by the adapter.

```bash
curl -X POST $CL/v1/agents -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Claude Sonnet 4.6",
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "api_key": "sk-ant-..."
  }'
```

---

## DeepSeek

**Where to get a key:** [`platform.deepseek.com/api_keys`](https://platform.deepseek.com/api_keys).

**Common models:** `deepseek-chat`, `deepseek-reasoner`.

**Quirks:**

- Endpoint is OpenAI-compatible — chatlab uses the `openai-compat` adapter under the hood. No special handling needed.
- Pricing is roughly an order of magnitude below the OpenAI/Anthropic equivalents at time of writing — useful for high-volume tests where cost matters.

```bash
curl -X POST $CL/v1/agents -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "DeepSeek Chat",
    "provider": "deepseek",
    "model": "deepseek-chat",
    "api_key": "sk-..."
  }'
```

---

## Gemini

**Where to get a key:** [`aistudio.google.com/app/apikey`](https://aistudio.google.com/app/apikey).

**Common models:** `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`.

**Quirks:**

- chatlab points at Google's **OpenAI-compat shim** (`generativelanguage.googleapis.com/v1beta/openai`), not the native Gemini REST API. The shim accepts a standard OpenAI chat-completions body and a Bearer token, so the `openai-compat` adapter just works.
- The native Gemini API (`/v1beta/models/{model}:generateContent`) has a different shape and is **not** what chatlab calls.

```bash
curl -X POST $CL/v1/agents -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Gemini Flash",
    "provider": "gemini",
    "model": "gemini-2.5-flash",
    "api_key": "AIza..."
  }'
```

---

## Maritaca

**Where to get a key:** [`plataforma.maritaca.ai`](https://plataforma.maritaca.ai/) — sign in, then create a key under "API Keys".

**Common models:** `sabia-3`, `sabiazinho-3`.

**Quirks:**

- Brazilian-Portuguese-tuned. If your test corpus is BR-PT, the same prompt typically produces tighter, more idiomatic output than a generic English-tuned model translating into Portuguese.
- The endpoint is OpenAI-compatible — chatlab uses `openai-compat`.

```bash
curl -X POST $CL/v1/agents -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sabiá-3",
    "provider": "maritaca",
    "model": "sabia-3",
    "api_key": "100000...",
    "system_prompt": "Responda em português brasileiro, com tom cordial e direto."
  }'
```

---

## Ollama (local, free)

Ollama runs models on your laptop. No API key, no per-token cost, no network round-trip — fastest inner loop while iterating on prompts.

### One-time setup

1. Install Ollama from [`ollama.com/download`](https://ollama.com/download). It runs as a background service on `http://localhost:11434`.
2. Pull a model:

   ```bash
   ollama pull llama3
   ```

   Smaller alternatives that still answer questions reasonably: `phi3`, `gemma2:2b`, `qwen2:0.5b`. Browse [`ollama.com/library`](https://ollama.com/library).
3. Confirm Ollama is listening:

   ```bash
   curl http://localhost:11434/api/tags
   ```

### Wire it up to chatlab

```bash
curl -X POST $CL/v1/agents -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Local llama3",
    "provider": "ollama",
    "model": "llama3",
    "system_prompt": "Você é um atendente cordial em português brasileiro."
  }'
```

`api_key` is omitted — Ollama doesn't authenticate. If `CHATLAB_REQUIRE_TOKEN` is set, the chatlab Bearer is still required (it gates the chatlab API, not the upstream).

### Pointing at a remote Ollama

Override `base_url` if Ollama runs on a different host (Docker bridge, lab box):

```bash
curl -X POST $CL/v1/agents -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lab llama3",
    "provider": "ollama",
    "model": "llama3:70b",
    "base_url": "http://lab-ollama:11434/v1"
  }'
```

### Switching models without recreating the agent

```bash
curl -X PATCH $CL/v1/agents/$AGENT_ID -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "model": "llama3.1" }'
```

The chats already attached to the agent keep working; the next reply uses the new model. The exported feedback row carries `agent_version: "ollama:llama3.1"`, so a downstream pipeline can slice "before vs after the model swap" cleanly.

---

## Custom (your agent under development)

This is the case chatlab exists for: you're **building** a chat agent and you want to test it from the same workbench you use to compare it against `gpt-4o`, `claude-sonnet-4-6`, or `llama3`. Pick `custom`, point at your agent's HTTP endpoint, and chatlab routes user messages to it just like any other provider.

### Contract

`custom` uses chatlab's `openai-compat` HTTP adapter. Your agent must expose **one POST endpoint** that speaks the OpenAI chat-completions shape:

```http
POST <base_url>/chat/completions
Authorization: Bearer <api_key>     # optional — only sent when you set api_key on the agent
Content-Type: application/json

{
  "model": "my-agent",
  "messages": [
    { "role": "system",    "content": "You are a friendly support agent." },
    { "role": "user",      "content": "Olá" },
    { "role": "assistant", "content": "Oi! Como posso ajudar?" },
    { "role": "user",      "content": "Quero meu dinheiro de volta." }
  ]
}
```

Your agent replies with:

```json
{
  "choices": [
    {
      "message": { "role": "assistant", "content": "Claro — me passe o número do pedido." }
    }
  ]
}
```

That's the entire contract. Streaming, tool calls, and multimodal attachments are out of scope for v1.0 (deferred to v1.1) — your agent should ignore those fields gracefully.

### Wire it up

```bash
curl -X POST $CL/v1/agents -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support agent (dev)",
    "provider": "custom",
    "model": "my-agent",
    "base_url": "http://localhost:8000/v1",
    "system_prompt": "Você é um atendente cordial em português brasileiro."
  }'
```

`base_url` defaults to `http://localhost:8000/v1` and `model` defaults to `my-agent` when you pick `custom` in the UI. Override both with whatever your agent advertises. `api_key` is optional — leave blank if your agent doesn't authenticate (typical for local dev), or set it to a shared secret your agent validates on `Authorization: Bearer`.

### Minimal agent for sanity-checking

A 30-line FastAPI agent that just echoes the last user message — useful to confirm chatlab → your-agent connectivity before you wire the real logic:

```python
# pip install fastapi uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
import time

app = FastAPI()

class Message(BaseModel):
    role: str
    content: str

class ChatReq(BaseModel):
    model: str
    messages: list[Message]

@app.post("/v1/chat/completions")
def chat(req: ChatReq):
    last_user = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
    return {
        "id": "chatcmpl-dev",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": req.model,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": f"echo: {last_user}"},
            "finish_reason": "stop",
        }],
    }
```

Run it with `uvicorn echo:app --port 8000` and `custom`'s defaults already point at it.

### Frameworks that already speak this contract

If your agent runs through any of these, `custom` works out of the box:

- **LangChain Server / LangServe** — exposes an OpenAI-compatible route per chain.
- **LiteLLM Proxy** — front any backend with an OpenAI-shaped surface.
- **vLLM** — `--openai` flag.
- **LocalAI / OpenLLM / Ollama** (Ollama has its own provider; included for completeness).
- Anything that proxies through **Helicone** / **OpenRouter** / **Mistral La Plateforme**'s OpenAI-compat endpoints.

When in doubt: if `curl <your-agent>/chat/completions -d '{"model":"x","messages":[{"role":"user","content":"hi"}]}'` returns a `choices[].message.content`, chatlab will work.

## Picking a default for development

| If you want… | Pick |
| --- | --- |
| **Test the agent you're building** | `custom`. This is what chatlab is for. |
| Fastest iteration loop, zero cost | `ollama` with a small model (`phi3`, `qwen2:0.5b`). |
| BR-PT idiomatic output | `maritaca/sabia-3`. |
| Best general capability, willing to pay | `openai/gpt-4o` or `anthropic/claude-sonnet-4-6`. |
| Strong reasoning, willing to pay | `openai/o1-preview` or `anthropic/claude-opus-4-7`. |
| Bulk synthetic-data generation, low cost | `deepseek/deepseek-chat`. |
| Multimodal images (when v1.1 multimodal lands) | `openai/gpt-4o`, `anthropic/claude-sonnet-4-6`, `gemini/gemini-2.5-flash`. |

If a provider you need isn't on the list, the right next step is a capability proposal that adds an adapter — see [`CONTRIBUTING.md`](https://github.com/jvrmaia/chatlab/blob/main/CONTRIBUTING.md).
