:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# Distribuição: do código-fonte

> **Status:** disponível hoje (v1.0.0-rc.1). Este é o caminho recomendado até que os artefatos npm + Docker estejam publicados.

Este é o caminho pra **contributors** e pra usuários que querem patchar o chatlab antes de rodar. Pra usuários iniciantes querendo um passo a passo guiado de 5 minutos, veja [`docs/quickstart.md`](/quickstart).

## Pré-requisitos

| Ferramenta | Versão | Notas |
| --- | --- | --- |
| Node.js | **22 LTS** (ou o que estiver em [`.nvmrc`](https://github.com/jvrmaia/chatlab/blob/main/.nvmrc)) | `nvm` e `fnm` pegam automaticamente quando você `cd` no projeto. |
| `npm` | já vem com o Node | — |
| `git` | qualquer versão recente | — |
| Toolchain de build nativo | — | macOS: `xcode-select --install`. Linux: `apt-get install -y python3 build-essential`. Windows: WSL2 fortemente recomendado. Necessário porque `better-sqlite3` faz build de um binding nativo. |

## Clone & install

```bash
git clone https://github.com/jvrmaia/chatlab.git
cd chatlab
npm install
```

O install puxa ~363 pacotes (~80 MB), faz build de dois módulos nativos. Deve terminar em 30-60s num laptop recente.

## Build

```bash
npm run build
```

Isso roda:
- `tsc -p tsconfig.json` → emite `dist/server/`
- `vite build` → emite `dist/ui/` (o bundle React + Tailwind do navegador)

Saída do build vai pra `dist/` e está no gitignore.

## Run

```bash
npm start
```

O chatlab escuta em `http://127.0.0.1:4480` por default e serve a UI em `/ui`. Override via as env vars em [`npm.md`](/distribution/npm) (que se aplicam identicamente ao from-source).

`Ctrl+C` sai limpo (trata `SIGINT` + `SIGTERM`).

## Workflow de desenvolvimento

| Script | Propósito |
| --- | --- |
| `npm run typecheck` | Check só de TypeScript, servidor + UI (sem emit) |
| `npm run build` | Build completo: servidor + UI |
| `npm run build:server` | Só `tsc` pro servidor |
| `npm run build:ui` | Só `vite build` pra UI |
| `npm start` | Roda o servidor compilado |
| `npm run dev` | Servidor em modo watch via `tsx` (sem build) |
| `npm run dev:ui` | Vite dev server pra UI na porta 5173, com proxy pro servidor na 4480 |
| `npm test` | Roda a suíte Vitest (90 testes, ~2s) |
| `npm run test:watch` | Vitest em modo watch |

## Hot-reload UI development

Em dois terminais:

```bash
# Terminal 1: backend do emulador na 4480
npm run dev

# Terminal 2: Vite dev server pra UI na 5173 (proxy pra API + WS na 4480)
npm run dev:ui
```

Abra http://localhost:5173 — mudanças na UI fazem hot-reload, mudanças no servidor reiniciam via `tsx watch`. O proxy do Vite reescreve `/v1`, `/healthz`, `/readyz`, e `/ws` pro backend.

## Layout do repositório

```
src/                           Código-fonte (Node + TypeScript)
├── index.ts                   API programática (`startChatlab`)
├── cli.ts                     Entrypoint do CLI
├── config.ts                  parsing de env + CLI + bind-safety
├── lib/                       helpers de id + clock
├── types/                     types de domínio + agente + feedback
├── storage/                   StorageAdapter + memory + sqlite + duckdb
├── workspaces/                WorkspaceRegistry (persistência via JSON)
├── core/                      classe Core — donadora do estado global
├── agents/                    Adapters de provedor LLM + factory + AgentRunner
├── http/                      Servidor Express + auth + envelope de erro + routers
├── ws/                        WebSocket gateway
└── ui/                        SPA React + Tailwind + Vite

test/                          Suítes Vitest
├── http/_harness.ts           Harness de teste — boota chatlab em porta aleatória
├── http/                      Testes por router
├── storage/                   Bateria de adapters de storage
├── agents/                    Testes de provedor + runner
├── workspaces/                Testes do registry
└── ws/                        Testes de WebSocket

docs/                          Fonte da documentação
dist/                          Saída do build (gitignored)
node_modules/                  Dependências (gitignored)
```

## Contribuindo

Veja [`CONTRIBUTING.md`](https://github.com/jvrmaia/chatlab/blob/main/CONTRIBUTING.md) pra branching, estilo de commit e expectativas de review. As contribuições mais úteis hoje (por [ROADMAP.md](https://github.com/jvrmaia/chatlab/blob/main/docs/ROADMAP.md)):

- Adicionar cenários reais de E2E Playwright além da spec de captura de screenshots — `docs/_capture/` já tem o Playwright cabeado; a v1.1 expande isso pro tier de E2E adiado conforme [ADR 0010](https://github.com/jvrmaia/chatlab/blob/main/docs/specs/adr/0010-test-strategy.md).
- Pegar qualquer item da v1.1 do [`ROADMAP.md`](https://github.com/jvrmaia/chatlab/blob/main/docs/ROADMAP.md) — encaminhamento multimodal, respostas em streaming, tool calling, duplicação de workspace, etc.
