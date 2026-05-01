:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# Início rápido

Cinco minutos entre clonar o repositório e "configurei um agente, abri uma conversa, mandei uma mensagem, avaliei a resposta".

> Quer o passo a passo longo, com screenshots? Leia o [Guia do usuário](/user-guide/README). Esta página é a versão de 5 minutos.

## 0. Pré-requisitos

| Ferramenta | Versão | Verificação |
| --- | --- | --- |
| Node.js | **22 LTS** | `node --version` |
| npm | já vem com o Node | `npm --version` |
| git | qualquer versão recente | `git --version` |
| curl | qualquer versão recente | `curl --version` |
| (opcional) Ollama | rodando em `localhost:11434` | `curl localhost:11434` |

## 1. Clonar + build

```bash
git clone https://github.com/jvrmaia/chatlab.git
cd chatlab
npm install
npm run build
npm start
```

Banner:

```
chatlab listening on http://127.0.0.1:4480
  workspace: default (sqlite)
  data dir : /Users/voce/.chatlab/data
  auth     : permissive (any non-empty bearer)
  retention: 90 days
  ui       : http://127.0.0.1:4480/ui
```

A primeira execução cria automaticamente `~/.chatlab/workspaces.json` + `~/.chatlab/data/<uuid>.db` para o workspace `default`.

## 2. Configurar um agente

Abra <http://127.0.0.1:4480/ui> → **Admin** → **Agentes** → **+ Novo agente**. Escolha um provedor (ex.: `ollama` para uso offline, ou `openai`/`anthropic` etc. com chave de API). O campo `model` vem com o modelo recomendado do provedor. Salve.

Ou via curl:

```bash
export CL=http://127.0.0.1:4480
export TOKEN=dev-token

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

## 3. Sondar o agente

O botão **Sondar** no formulário de edição envia um prompt de teste e mostra a resposta inline. Útil pra confirmar que a chave de API funciona antes de iniciar uma conversa real.

Ou via curl:

```bash
curl -X POST $CL/v1/agents/$AGENT_ID/probe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "Olá" }'
# -> { "content": "Olá! Como posso ajudar?" }
```

## 4. Iniciar uma conversa

Clique em **Conversas** no topo, depois **+** na barra lateral. Escolha o agente + um **tema** em texto livre (ex.: `"Aprendendo Python"`). A conversa abre; o composer fica no rodapé.

Ou via curl:

```bash
curl -X POST $CL/v1/chats \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "agent_id": "'$AGENT_ID'", "theme": "Aprendendo Python" }'
```

## 5. Enviar uma mensagem + receber a resposta

Digite no composer + tecle Enter. Em ~2 s aparece um balão do assistente.

Ou via curl:

```bash
curl -X POST $CL/v1/chats/$CHAT_ID/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "content": "Como começo a aprender?" }'
# a resposta HTTP é a mensagem do usuário persistida; a resposta do assistente
# chega de forma assíncrona. Faça polling na lista de mensagens pra ver:

curl -H "Authorization: Bearer $TOKEN" \
  $CL/v1/chats/$CHAT_ID/messages | jq '.data[-1]'
```

## 6. Avaliar a resposta

Clique 👍 ou 👎 em qualquer balão do assistente. Pra limpar uma avaliação, clique duas vezes no mesmo botão.

Ou via curl:

```bash
curl -X POST $CL/v1/messages/$MSG_ID/feedback \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "rating": "up", "comment": "boa primeira tentativa" }'
```

## 7. Exportar o corpus

Quando estiver pronto pra alimentar os dados num notebook:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  $CL/v1/feedback/export > corpus.jsonl
```

Cada linha carrega `schema_version: 1`, o `theme` da conversa, a mensagem avaliada do assistente + o prompt que a disparou, a avaliação, o comentário opcional, e qualquer anotação no nível da conversa. Veja a [capability 0004](/specs/capabilities/feedback-and-export) pro schema completo.

## E daqui pra frente

- A referência completa de cada endpoint: [`recipes.md`](/recipes).
- O passo a passo narrativo com screenshots: [`user-guide/README.md`](/user-guide/README).
- O contrato: [`specs/api/openapi.yaml`](/specs/api/).
- O porquê: [`specs/capabilities/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/capabilities) e [`specs/adr/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/adr).
