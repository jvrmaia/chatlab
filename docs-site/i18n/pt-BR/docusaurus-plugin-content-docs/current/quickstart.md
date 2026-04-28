:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# Início rápido

Cinco minutos entre clonar o repositório e "configurei um agente, abri uma conversa, mandei uma mensagem, avaliei a resposta".

> Quer o passo a passo longo, com screenshots? Leia o [Guia do usuário](/user-guide/). Esta página é a versão de 5 minutos.

## 0. Pré-requisitos

**Caminho npm (passos 1 → 7)**

| Ferramenta | Versão | Verificação |
| --- | --- | --- |
| Node.js | **22 LTS** | `node --version` |
| npm | já vem com o Node | `npm --version` |
| git | qualquer versão recente | `git --version` |
| curl | qualquer versão recente | `curl --version` |
| (opcional) Ollama | rodando em `localhost:11434` | `curl localhost:11434` |

**Caminho Docker (passo 1-D → 7)** — use no lugar do caminho npm acima

| Ferramenta | Versão | Verificação |
| --- | --- | --- |
| Docker | **24+** | `docker --version` |
| git | qualquer versão recente | `git --version` |
| curl | qualquer versão recente | `curl --version` |
| jq | qualquer versão recente | `jq --version` |
| (opcional) Ollama | rodando em `localhost:11434` | `curl localhost:11434` |

> `jq` é usado no bootstrap do workspace DuckDB. Instale via `brew install jq` (macOS), `apt install jq` (Debian/Ubuntu) ou [jq downloads](https://jqlang.org/download/).

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

## 1-D. Caminho Docker (alternativa ao passo 1)

Pule esta seção se estiver usando o caminho npm acima.

O container faz bind em `0.0.0.0` por padrão, o que aciona o bind-safety — o processo
sai com exit code 78 antes de abrir qualquer porta se `CHATLAB_REQUIRE_TOKEN` não estiver
definido. Gere um token primeiro e guarde o valor — ele é o bearer em todas as chamadas de API:

```bash
export CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)
echo "$CHATLAB_REQUIRE_TOKEN"   # salve isso
```

Pull e execução pelo Docker Hub:

```bash
docker run --rm -p 4480:4480 \
  -e CHATLAB_REQUIRE_TOKEN="$CHATLAB_REQUIRE_TOKEN" \
  jvrmaia/chatlab:latest
```

Ou build do código-fonte:

```bash
git clone https://github.com/jvrmaia/chatlab.git
cd chatlab
docker build -t chatlab:dev .
docker run --rm -p 4480:4480 \
  -e CHATLAB_REQUIRE_TOKEN="$CHATLAB_REQUIRE_TOKEN" \
  chatlab:dev
```

Banner:

```
chatlab listening on http://0.0.0.0:4480
  workspace: default (sqlite)
  data dir : /data
  auth     : enforced (CHATLAB_REQUIRE_TOKEN set)
  retention: 90 days
  ui       : http://0.0.0.0:4480/ui
```

Abra `http://localhost:4480/ui`. Ao continuar para o passo 2, use estes exports no lugar dos padrões mostrados lá:

```bash
export CL=http://localhost:4480
export TOKEN="$CHATLAB_REQUIRE_TOKEN"
```

> **Nota sobre persistência.** O exemplo com `--rm` usa armazenamento efêmero — o banco de workspaces e a chave de criptografia de API ficam dentro do container e são perdidos ao parar. Para uma configuração persistente, use docker compose (abaixo) ou monte um volume com `docker run`.

### docker compose (persistente, recomendado)

Crie um `compose.yml` em qualquer diretório:

```yaml
services:
  chatlab:
    image: jvrmaia/chatlab:latest    # ou: build: . para usar um build local
    ports:
      - "4480:4480"
    environment:
      CHATLAB_REQUIRE_TOKEN: "${CHATLAB_REQUIRE_TOKEN}"
    volumes:
      - chatlab-data:/data
    restart: unless-stopped

volumes:
  chatlab-data:
```

Depois suba:

```bash
export CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)
echo "$CHATLAB_REQUIRE_TOKEN"   # salve isso
docker compose up -d
```

O volume nomeado `chatlab-data` persiste o banco de workspaces e a chave de criptografia de API entre restarts. Ao continuar para o passo 2:

```bash
export CL=http://localhost:4480
export TOKEN="$CHATLAB_REQUIRE_TOKEN"
```

#### Acessando o arquivo SQLite pelo host (bind mount)

O exemplo de compose acima usa um volume nomeado Docker (`chatlab-data`), que mantém os
dados dentro do storage do Docker. Se quiser acesso direto ao arquivo `.db` pelo host —
para inspeção, backup ou uso com outra ferramenta SQLite — substitua o volume nomeado por
um bind mount:

```yaml
services:
  chatlab:
    build: .
    ports:
      - "4480:4480"
    environment:
      CHATLAB_REQUIRE_TOKEN: "${CHATLAB_REQUIRE_TOKEN}"
    volumes:
      - ./chatlab-data:/data      # diretório do host em vez de volume nomeado
    restart: unless-stopped
```

Após `docker compose up -d`, o registry e os arquivos `.db` ficam visíveis no host:

```
chatlab-data/
├── workspaces.json               # registry — ID do workspace ativo
└── data/
    └── <workspace-uuid>.db       # banco SQLite, consultável diretamente
```

Abra `chatlab-data/data/<uuid>.db` com qualquer cliente SQLite. O UUID do workspace está
em `workspaces.json` no campo `storage_path`.

#### Usando DuckDB como storage

O workspace padrão usa SQLite. Para trocar para DuckDB — mais adequado para consultas analíticas sobre corpora de feedback grandes — crie e ative um workspace DuckDB uma vez após o primeiro boot:

```bash
# Cria o workspace DuckDB
WORKSPACE_ID=$(curl -s -X POST http://localhost:4480/v1/workspaces \
  -H "Authorization: Bearer $CHATLAB_REQUIRE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nickname": "analytics", "storage_type": "duckdb"}' | jq -r '.id')

# Ativa (gravado no volume — sobrevive a restarts automaticamente)
curl -s -X POST http://localhost:4480/v1/workspaces/$WORKSPACE_ID/activate \
  -H "Authorization: Bearer $CHATLAB_REQUIRE_TOKEN"
```

O arquivo de registro no volume grava `analytics (duckdb)` como workspace ativo; todos os boots subsequentes com `docker compose up` usam esse workspace sem flags extras.

> SQLite é o padrão certo para a maioria dos cenários. Prefira DuckDB quando quiser consultar o arquivo `.duckdb` diretamente (CLI do DuckDB, Python, notebook) ou quando o corpus de feedback crescer o suficiente para que agregações colunares façam diferença.

Para uma configuração de produção com TLS e reverse proxy, veja [Distribuição: Docker](/distribution/docker).

## 2. Configurar um agente

Abra <http://127.0.0.1:4480/ui> → **Admin** → **Agentes** → **+ Novo agente**. Escolha um provedor (ex.: `ollama` para uso offline, ou `openai`/`anthropic` etc. com chave de API). O campo `model` vem com o modelo recomendado do provedor. Salve.

Ou via curl:

```bash
# caminho npm — qualquer valor não-vazio funciona (auth permissiva)
export CL=http://127.0.0.1:4480
export TOKEN=dev-token
# caminho Docker — use os valores definidos no passo 1-D:
#   export CL=http://localhost:4480
#   export TOKEN="$CHATLAB_REQUIRE_TOKEN"

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
- O passo a passo narrativo com screenshots: [`user-guide/README.md`](/user-guide/).
- O contrato: [`specs/api/openapi.yaml`](/api/).
- O porquê: [`specs/capabilities/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/capabilities) e [`specs/adr/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/adr).
