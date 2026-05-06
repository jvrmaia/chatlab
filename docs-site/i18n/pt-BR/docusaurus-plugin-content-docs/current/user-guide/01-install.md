:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# 1. Instalar o chatlab

| Modo | Comando | Quando escolher |
| --- | --- | --- |
| **Do código-fonte** | `git clone … && npm install && npm run build && npm start` | Você quer `main` ou quer mexer no chatlab. |
| **NPM** | `npx @jvrmaia/chatlab` (ou `npm i -g @jvrmaia/chatlab`) | Menor fricção pra testar; idêntico em qualquer host Node. |
| **Docker** | `docker run -e CHATLAB_REQUIRE_TOKEN=… jvrmaia/chatlab:latest` | Container reproduzível, times poliglotas, CI. |

O nome `chatlab` no npm já estava ocupado por um pacote sem relação, então o chatlab é escopado — mas o **binário CLI continua `chatlab`** depois do install.

## Do código-fonte

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

## O que o banner está te dizendo

- **`workspace: default (sqlite)`** — o chatlab fez bootstrap automático de um workspace chamado `default` apoiado em um arquivo sqlite em `~/.chatlab/data/<uuid>.db`. Você pode criar mais workspaces com outros backends de storage pela UI.
- **`auth: permissive`** — qualquer `Authorization: Bearer <token>` não-vazio é aceito. Defina `CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)` pro modo strict.
- **`retention: 90 days`** — avaliações + anotações fazem sweep das rows antigas no startup + diariamente. Defina `CHATLAB_FEEDBACK_RETENTION_DAYS=30` (ou `0` pra desativar).

## Docker

O container faz bind em `0.0.0.0` por padrão, o que aciona o bind-safety — o processo
sai com exit code 78 antes de abrir qualquer porta se `CHATLAB_REQUIRE_TOKEN` não estiver
definido. Gere um token primeiro:

```bash
export CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)
echo "$CHATLAB_REQUIRE_TOKEN"   # salve isso — é o bearer de todas as chamadas de API
docker run --rm -p 4480:4480 \
  -e CHATLAB_REQUIRE_TOKEN="$CHATLAB_REQUIRE_TOKEN" \
  jvrmaia/chatlab:latest
```

Banner (Docker):

```
chatlab listening on http://0.0.0.0:4480
  workspace: default (sqlite)
  data dir : /data
  auth     : enforced (CHATLAB_REQUIRE_TOKEN set)
  retention: 90 days
  ui       : http://0.0.0.0:4480/ui
```

Para armazenamento persistente, `docker compose`, bind mounts SQLite, bootstrap de workspace
DuckDB e `CHATLAB_MASTER_KEY` (necessário sem volume persistente), veja
[Distribuição: Docker](/distribution/docker).

## Parando o chatlab

`Ctrl+C` no mesmo terminal. WS, HTTP, runner e storage desligam de forma limpa. Com Docker, use `docker stop <container>` ou `Ctrl+C` se estiver rodando em foreground.

## E daqui pra frente

[2. Configure seu primeiro workspace + agente](/user-guide/workspaces-and-agents).
