:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# Receitas

Comandos `curl` copy-paste pra cada endpoint exposto pelo chatlab v1.x. Todos os exemplos assumem:

- chatlab rodando em `http://127.0.0.1:4480` (default)
- token Bearer `dev-token` (qualquer token não-vazio funciona, exceto se `CHATLAB_REQUIRE_TOKEN` estiver definido)

> **Convenção.** Variáveis de shell pras partes que mudam com frequência:
>
> ```bash
> export CL=http://127.0.0.1:4480
> export TOKEN=dev-token
> ```

Probes de saúde **não** exigem auth:

```bash
curl $CL/healthz   # liveness
curl $CL/readyz    # readiness
```

---

## Workspaces

### Listar + ativo

```bash
curl -H "Authorization: Bearer $TOKEN" $CL/v1/workspaces
curl -H "Authorization: Bearer $TOKEN" $CL/v1/workspaces/active
```

### Criar

```bash
curl -X POST $CL/v1/workspaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "nickname": "experimento-1", "storage_type": "sqlite" }'
```

`storage_type` é um de `memory | sqlite | duckdb`.

### Ativar / renomear

```bash
# troca o adapter ativo
curl -X POST $CL/v1/workspaces/$WS_ID/activate \
  -H "Authorization: Bearer $TOKEN"

# renomeia (storage_type/path são imutáveis)
curl -X PATCH $CL/v1/workspaces/$WS_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "nickname": "renomeado" }'
```

### Excluir

```bash
# exige ?confirm=true — remove o workspace + arquivos de dados
curl -X DELETE "$CL/v1/workspaces/$WS_ID?confirm=true" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Agentes (escopados ao workspace ativo)

### Criar — Ollama (sem chave de API, local)

```bash
curl -X POST $CL/v1/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Local llama3",
    "provider": "ollama",
    "model": "llama3",
    "system_prompt": "Você é um atendente cordial em português."
  }'
```

### Criar — OpenAI

```bash
curl -X POST $CL/v1/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenAI gpt-4o",
    "provider": "openai",
    "model": "gpt-4o",
    "api_key": "sk-...",
    "system_prompt": "Você é um assistente cordial."
  }'
```

### Criar — Anthropic

```bash
curl -X POST $CL/v1/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Claude Sonnet 4.6",
    "provider": "anthropic",
    "model": "claude-sonnet-4-6",
    "api_key": "sk-ant-..."
  }'
```

DeepSeek (`deepseek` / `deepseek-chat`), Gemini (`gemini` / `gemini-2.5-flash`), e Maritaca (`maritaca` / `sabia-3`) seguem o mesmo formato.

### Listar, atualizar, excluir

```bash
# chaves de API mascaradas
curl -H "Authorization: Bearer $TOKEN" $CL/v1/agents

# omita api_key no patch para preservá-la
curl -X PATCH $CL/v1/agents/$AGENT_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "name": "renomeado" }'

# DELETE retorna 409 se alguma conversa referencia o agente
curl -X DELETE -H "Authorization: Bearer $TOKEN" $CL/v1/agents/$AGENT_ID
```

### Probe (teste de uma execução)

```bash
curl -X POST $CL/v1/agents/$AGENT_ID/probe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "Diga olá em português." }'
# -> { "content": "Olá! ..." }
```

---

## Conversas + mensagens

### Criar uma conversa

```bash
curl -X POST $CL/v1/chats \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "agent_id": "'$AGENT_ID'", "theme": "Aprendendo Python" }'
```

### Listar + ler

```bash
curl -H "Authorization: Bearer $TOKEN" $CL/v1/chats
curl -H "Authorization: Bearer $TOKEN" $CL/v1/chats/$CHAT_ID
curl -H "Authorization: Bearer $TOKEN" $CL/v1/chats/$CHAT_ID/messages
```

### Enviar uma mensagem do usuário

```bash
curl -X POST $CL/v1/chats/$CHAT_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "content": "Como começo?" }'
```

A resposta HTTP é a mensagem do usuário persistida. A resposta do assistente chega assíncrona — faça polling em `GET .../messages` ou se inscreva via WS.

### Enviar mensagem com anexo

```bash
curl -X POST $CL/v1/chats/$CHAT_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "O que tem nessa imagem?",
    "attachments": [{ "media_id": "'$MEDIA_ID'" }]
  }'
```

(Encaminhamento multimodal pro provedor está adiado pra v1.1 — por enquanto, anexos ficam armazenados ao lado da mensagem mas não são enviados ao LLM.)

### Excluir

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" $CL/v1/chats/$CHAT_ID
```

---

## Avaliações + anotações

### Avaliar uma mensagem do assistente

```bash
curl -X POST $CL/v1/messages/$MSG_ID/feedback \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "rating": "up", "comment": "ótima resposta" }'
```

`rating` é `"up"` ou `"down"`; `comment` é opcional, ≤ 280 chars. Pra limpar:

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" $CL/v1/messages/$MSG_ID/feedback
```

### Ler todas as avaliações de uma conversa de uma vez

```bash
curl -H "Authorization: Bearer $TOKEN" $CL/v1/chats/$CHAT_ID/feedback
```

### Anotação

```bash
# leitura (retorna body: "" se nunca foi escrito)
curl -H "Authorization: Bearer $TOKEN" $CL/v1/chats/$CHAT_ID/annotation

# escrita (semântica PUT, ≤ 16 KB Markdown)
curl -X PUT $CL/v1/chats/$CHAT_ID/annotation \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "body": "usuário ficou reformulando — agente ignorou o id do pedido" }'
```

### Exportar corpus como JSONL

```bash
curl -H "Authorization: Bearer $TOKEN" $CL/v1/feedback/export > corpus.jsonl

# filtra só thumbs-down a partir de uma data:
curl -H "Authorization: Bearer $TOKEN" \
  "$CL/v1/feedback/export?rating=down&since=2026-04-01T00:00:00Z" > down.jsonl
```

Cada linha carrega `schema_version: 1`. Veja a [capability 0004](/specs/capabilities/feedback-and-export).

---

## Mídia

### Upload

```bash
curl -X POST $CL/v1/media \
  -H "Authorization: Bearer $TOKEN" \
  -F "type=image" \
  -F "file=@./screenshot.png"
# -> { "id": "..." }
```

`type` é um de `image|audio|video|document|sticker`.

### Pegar metadata + download

```bash
curl -H "Authorization: Bearer $TOKEN" $CL/v1/media/$MEDIA_ID
curl -H "Authorization: Bearer $TOKEN" $CL/v1/media/$MEDIA_ID/download > out.png
curl -X DELETE -H "Authorization: Bearer $TOKEN" $CL/v1/media/$MEDIA_ID
```

---

## API programática (Node)

Se seu código é um processo Node.js, você pode subir o chatlab in-process:

```ts
import { startChatlab } from "@jvrmaia/chatlab";

const cl = await startChatlab({ port: 0 });   // 0 = porta efêmera aleatória
console.log(cl.url);                            // -> http://127.0.0.1:51234

// dirija com fetch() contra cl.url ...

await cl.stop();
```

A instância exportada de `Core` está disponível em `cl.core` pra trabalho avançado de harness — veja [`src/index.ts`](https://github.com/jvrmaia/chatlab/blob/main/src/index.ts).
