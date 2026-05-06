:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# Distribuição: Docker

A distribuição Docker mira em:

- **Times poliglotas** cujo agente não está em Node.js.
- **Pipelines de CI** que preferem rodar serviços como containers.
- **Demos reproduzíveis** onde "rode esse comando" é o nível.

## Início rápido

O `CHATLAB_HOST` padrão do container é `0.0.0.0`, o que aciona o bind-safety — o processo
sai com exit code 78 antes de abrir qualquer porta se `CHATLAB_REQUIRE_TOKEN` não estiver
definido. Gere um token primeiro e guarde o valor:

```bash
export CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)
echo "$CHATLAB_REQUIRE_TOKEN"   # salve isso — é o seu bearer token
```

Faça o pull e rode:

```bash
docker run --rm -p 4480:4480 \
  -e CHATLAB_REQUIRE_TOKEN="$CHATLAB_REQUIRE_TOKEN" \
  jvrmaia/chatlab:latest
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

Depois abra `http://localhost:4480/ui`. Use `$CHATLAB_REQUIRE_TOKEN` como bearer no
painel Admin da UI e em qualquer chamada de API.

## Início rápido (build do código-fonte)

```bash
export CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)
git clone https://github.com/jvrmaia/chatlab.git
cd chatlab
docker build -t chatlab:dev .
docker run --rm -p 4480:4480 \
  -e CHATLAB_REQUIRE_TOKEN="$CHATLAB_REQUIRE_TOKEN" \
  chatlab:dev
```

## Imagem

| Propriedade | Valor |
| --- | --- |
| Registry | Docker Hub |
| Repositório | `jvrmaia/chatlab` (planejado) |
| Base | `node:22-bookworm-slim`. Alpine foi rejeitado porque Alpine + módulos nativos (`better-sqlite3`, `@duckdb/node-api`) é uma fonte recorrente de bugs musl/glibc. |
| Arquiteturas | `linux/amd64`, `linux/arm64` |
| Porta exposta default | `4480` |
| Usuário default | non-root |

Tags publicadas por release:

- `latest` — última release estável
- `next` — builds pré-release
- `vX.Y.Z` — versão exata
- `vX.Y` — último patch em uma linha minor
- `vX` — última em uma linha major

## Configuração

Toda configuração passa por variáveis de ambiente — as mesmas documentadas em [`npm.md`](/distribution/npm). Por exemplo:

```bash
docker run --rm \
  -p 4480:4480 \
  -e CHATLAB_HOME=/data \
  -e CHATLAB_REQUIRE_TOKEN=hunter2 \
  -v "$PWD/chatlab-data:/data" \
  chatlab:dev
```

Notas:

- O home default do container é `/data`. Monte um diretório do host ali pra persistir workspaces (e os arquivos SQLite/DuckDB por workspace) entre restarts.
- O container default é `CHATLAB_HOST=0.0.0.0`, `CHATLAB_PORT=4480`. Como o host não é loopback, o bind-safety exige que `CHATLAB_REQUIRE_TOKEN` esteja definido — defina explicitamente.
- **Master key e persistência de chaves de API.** Na primeira execução o processo gera automaticamente uma master key AES-256-GCM e grava em `$CHATLAB_HOME/master.key` (ou seja, `/data/master.key`). Com volume montado em `/data` a chave persiste entre restarts — nenhuma configuração extra necessária. Sem volume (container efêmero), passe `CHATLAB_MASTER_KEY=$(openssl rand -base64 32)` como variável de ambiente; caso contrário, cada novo container gera uma chave nova e as `api_keys` dos agentes já salvos ficam ilegíveis.

Exemplo seguro:

```bash
docker run --rm -p 4480:4480 \
  -e CHATLAB_REQUIRE_TOKEN=hunter2 \
  chatlab:dev
```

## docker-compose

Um exemplo funcional fica em [`docs/distribution/compose.example.yml`](https://github.com/jvrmaia/chatlab/blob/main/docs/distribution/compose.example.yml) mais o [`Caddyfile.example`](https://github.com/jvrmaia/chatlab/blob/main/docs/distribution/Caddyfile.example) correspondente. Ele roda o chatlab atrás de um reverse proxy Caddy com TLS automático via Let's Encrypt:

```bash
export CHATLAB_DOMAIN=chatlab.example.com
export CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)
docker compose -f docs/distribution/compose.example.yml up -d
```

O Caddy provisiona o cert na primeira request pro seu domínio e faz proxy de todo tráfego — incluindo o upgrade `/ws` — pro container chatlab na rede interna do Compose. Use só quando o DNS de `$CHATLAB_DOMAIN` já aponta pro host.

## Health & readiness

O container expõe:

- `GET /healthz` — processo está vivo
- `GET /readyz` — aceitando tráfego (listener HTTP no ar, storage inicializado)

Ambos retornam `200 OK` quando saudáveis. Adequado pra liveness/readiness probes do Kubernetes.

## Smoke test do container

Com o container rodando:

```bash
# Probes de saúde — sem auth
curl http://localhost:4480/healthz

# Lista workspaces — precisa do token configurado
curl -H "Authorization: Bearer hunter2" \
  http://localhost:4480/v1/workspaces
```

Abra <http://localhost:4480/ui> pra interagir com a UI.

## Builds multi-arch (publishing)

Imagens publicadas são multi-arch (`linux/amd64` + `linux/arm64`). O workflow de release usa `docker buildx`:

```bash
docker buildx create --name chatlab --driver docker-container --use
docker buildx inspect --bootstrap

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t jvrmaia/chatlab:1.0.0-rc.1 \
  -t jvrmaia/chatlab:next \
  --push .
```

Está cabeado em `.github/workflows/release.yml` e roda num runner GitHub Actions limpo por release (sem caches carregados entre releases). Esquisitices de módulos nativos pra `better-sqlite3` e `@duckdb/node-api` são o motivo de rodarmos em `bookworm-slim` em vez de Alpine — veja a tabela acima.

## Bind-safety

Mesmas regras do caminho npm: `CHATLAB_HOST` diferente de `127.0.0.1` exige `CHATLAB_REQUIRE_TOKEN`. O container sai com exit code 78 se ambas as condições falharem. Veja [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#bind-safety).
