:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# Solução de problemas

Se o chatlab fizer algo inesperado, os pontos de partida mais úteis são:

- A saída do console de `npm start`. O banner de boot informa o workspace ativo, o data dir, a porta, e o modo de auth.
- O console do navegador em `/ui`. Erros de rede e tentativas de reconexão WS aparecem ali.
- `GET /healthz` e `GET /readyz` — o último só retorna 200 quando o storage adapter ativo terminou de bootar.

Se você não encontrar seu sintoma abaixo, [abra uma issue](https://github.com/jvrmaia/chatlab/issues/new/choose) com o banner de boot + o comando que falhou.

---

## O processo se recusa a iniciar

### Exit code 78: bind-safety check

```
chatlab: refusing to bind to 0.0.0.0 without CHATLAB_REQUIRE_TOKEN.
  Either set CHATLAB_HOST=127.0.0.1 (default) or export
  CHATLAB_REQUIRE_TOKEN=<your-shared-secret>.
```

**Causa:** você definiu `CHATLAB_HOST` para um valor não-loopback (ex.: `0.0.0.0`, IP de bridge Docker, IP de tailnet) sem definir `CHATLAB_REQUIRE_TOKEN`. O chatlab se recusa a expor acesso não-autenticado na rede. Detalhes em [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#bind-safety).

**Correções (escolha uma):**

```bash
# 1. Apenas local (default)
unset CHATLAB_HOST                # ou CHATLAB_HOST=127.0.0.1
npm start

# 2. Exposto na rede com um shared secret
export CHATLAB_HOST=0.0.0.0
export CHATLAB_REQUIRE_TOKEN=$(openssl rand -hex 32)
npm start
```

### `Error: listen EADDRINUSE :::4480`

A porta está sendo usada por outro processo — geralmente um `npm start` anterior que não desligou direito.

```bash
lsof -i :4480 -P              # encontra o PID
kill <pid>                     # ou `kill -9` se travou
# alternativa: use outra porta
CHATLAB_PORT=4481 npm start
```

### `npm start` sai silencioso sem banner

A pasta `dist/` está faltando ou desatualizada. Refaça o build:

```bash
npm run build && npm start
```

Se você está mexendo em `src/`, rode o watch loop:

```bash
npm run dev
```

---

## Falhas de build nativo (`npm install`)

### `better-sqlite3` falha ao compilar

A forma mais comum é um erro do node-gyp citando headers ausentes ou `make` fora do `$PATH`.

**macOS:**
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt-get install -y python3 build-essential
```

**Windows:** WSL2 é fortemente recomendado. Builds nativos com MSVC funcionam, mas exigem Visual Studio Build Tools + Python 3 no `$PATH`; a superfície de troubleshooting nessa rota é maior do que cabe nesta página.

Depois de instalar a toolchain, reexecute do zero:

```bash
rm -rf node_modules package-lock.json
npm install
```

### `@duckdb/node-api` falha no install

O prebuild do DuckDB cobre `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64`, e Windows. Se sua plataforma estiver fora dessa lista, o install falha. Workaround: pule workspaces DuckDB — o chatlab funciona normalmente nos adapters `memory` e `sqlite`.

Você também pode limitar a suíte de testes pra ignorar DuckDB:

```bash
npm test -- --exclude 'test/storage/duckdb*'
```

---

## Requisições à API falham com 401 / 403

### 401 com `CHATLAB_REQUIRE_TOKEN` definido

Seu `Authorization: Bearer <token>` não bate com `CHATLAB_REQUIRE_TOKEN`. Verifique:

```bash
echo "$CHATLAB_REQUIRE_TOKEN"            # o que o servidor espera
curl -i -H "Authorization: Bearer $TOKEN" $CL/v1/workspaces
```

No modo **permissivo padrão** (sem `CHATLAB_REQUIRE_TOKEN`), **qualquer Bearer não-vazio** é aceito — `dev-token` funciona. O modo de falha é um header vazio, ou nenhuma linha `Authorization`.

### 403 dentro do navegador

A UI envia o token de `localStorage["chatlab.token"]`. Se você limpou o storage ou nunca configurou, a UI usa string vazia e leva 401. Abra DevTools → Application → Local Storage → defina `chatlab.token` com seu token e recarregue.

---

## Probe do agente dá timeout ou 5xx

### Provedor cloud (OpenAI / Anthropic / DeepSeek / Gemini / Maritaca)

```bash
curl -X POST $CL/v1/agents/$AGENT_ID/probe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "ping" }'
```

Se 5xx:

1. Cheque o console do chatlab — o erro original do provedor aparece lá.
2. Causas comuns: chave de API inválida, cota esgotada, nome de modelo não reconhecido pelo provedor, mismatch de região (alguns modelos do Gemini e do Anthropic são gateados por região).
3. Confirme a string do modelo com `curl https://api.<provider>.com/v1/models -H "Authorization: Bearer $KEY"` (ou o equivalente do provedor).

### Ollama

```bash
# 1) Confirma que o Ollama está no ar
curl http://localhost:11434/api/tags

# 2) Confirma que o modelo está baixado
ollama list | grep llama3

# 3) Confirma que ele responde
ollama run llama3 "olá"
```

Se `ollama list` estiver vazio, faça `ollama pull llama3` (ou o nome do modelo que o agente usa).

Se o Ollama roda em um host fora do default, o `base_url` do agente precisa bater. O default é `http://localhost:11434/v1` — note o `/v1` final, que é o shim OpenAI-compat do Ollama, **não** o path nativo `/api/...`.

---

## Armazenamento e persistência

### Onde estão meus dados?

```bash
echo "$CHATLAB_HOME"                                  # default: ~/.chatlab
ls -la "${CHATLAB_HOME:-$HOME/.chatlab}/"
```

Layout:

```
~/.chatlab/
├── workspaces.json              # registry: apelidos, ids, marcador active
└── data/
    ├── <workspace-uuid-A>.db        # workspace sqlite
    └── <workspace-uuid-B>.duckdb    # workspace duckdb
```

Workspaces `memory` não têm arquivo em disco — restart perde tudo dentro deles.

### `DELETE /v1/workspaces/{id}` retorna 400

O endpoint exige `?confirm=true` — recusar a ação destrutiva é o default. A flag também remove o arquivo `.db` / `.duckdb` em disco.

```bash
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$CL/v1/workspaces/$WS_ID?confirm=true"
```

### Upload de mídia em workspace DuckDB falha ou trava

O binding de BLOB do DuckDB via `@duckdb/node-api` foi intencionalmente restrito no chatlab — veja a opção `skipMedia` em `test/storage/_battery.ts`. Se você precisa anexar mídia, crie um workspace `sqlite` pra esse cenário e mantenha um `duckdb` separado pra analytics.

---

## Master key (criptografia em repouso)

### Probe do agente começou a falhar depois que copiei meu data dir pra outra máquina

A master key em `$CHATLAB_HOME/master.key` é por máquina. Copiar os arquivos do workspace (`*.db`, `*.duckdb`) sem copiar `master.key` deixa as chaves de API dos agentes criptografadas com uma key que a nova máquina não tem. Sintomas: probe / chat bate no provedor sem chave (Ollama funciona, provedores pagos retornam 401).

Solução: copie `master.key` também (`scp` com mode 0600), ou passe a key da máquina anterior em `CHATLAB_MASTER_KEY` (base64 dos 32 bytes). Se a key antiga sumiu, edite cada agente e cole a chave de API de novo — a escrita nova criptografa com a key nova.

### Variável `CHATLAB_MASTER_KEY` rejeitada no startup

```
Error: CHATLAB_MASTER_KEY must decode to exactly 32 bytes (got <N>)
```

Gere um valor novo:

```bash
export CHATLAB_MASTER_KEY=$(openssl rand -base64 32)
```

A exigência de 32 bytes é uma precondição rígida do AES-256-GCM. Não reduza pra 16 (isso seria AES-128 e a cifra está fixa em 256).

### Quero desativar a criptografia em repouso

Não desative. A criptografia foi um GA blocker da v1.0 conforme [a TRB review](https://github.com/jvrmaia/chatlab/blob/main/docs/reviews/2026-04-30-v1.0.0-rc.1.md). O adapter de storage aceita rows legacy em texto puro na leitura (pra que cópias antigas de `~/.chatlab` migrem de forma transparente), mas toda escrita nova é criptografada.

Se você realmente tem um sandbox onde isso não importa, passe uma key fixa descartável (`CHATLAB_MASTER_KEY=$(echo -n test | sha256sum | head -c 64 | xxd -r -p | base64)` é uma test key estável) e trate o data dir como efêmero.

## Esquisitices da UI web

### Balão do assistente nunca aparece

Abra o drawer **Eventos** (ícone de terminal, canto superior direito). Se o último evento é `agent.failed`, o agente deu timeout ou 5xx — veja [probe do agente](#probe-do-agente-dá-timeout-ou-5xx) acima.

Se o último evento é `chat.user-message-appended` e nada vem depois, ou o runner está ocupado com outra conversa (raro; o runtime tem limite de inflight), ou a chamada HTTP do agente está pendurada. Cheque o console do chatlab.

### WS mostra "conexão perdida — reconectando…" repetidamente

Geralmente o processo do chatlab reiniciou. Recarregue o navegador — o auto-reconnect usa exponential backoff (0.5 s → 30 s cap) sem reload, mas um reload manual garante estado limpo.

Se o chatlab está no ar e a reconexão continua oscilando, talvez tenha um reverse proxy na frente de `/ws` que está removendo o header `Upgrade` (o modo "auto" do Cloudflare faz isso). Ative WS upgrades, ou rode a UI do chatlab direto sem o proxy.

### Toggle claro/escuro reseta a cada page load

O script de bootstrap em `index.html` lê `localStorage["chatlab.theme"]`. Se seu navegador bloqueia localStorage pra `127.0.0.1`, o script cai silenciosamente no `prefers-color-scheme` do sistema. Permita localStorage pra essa origem, ou defina `CHATLAB_HOST` como um hostname que o navegador trate normalmente.

---

## Testes falham localmente

### `1 skipped` é normal

`test/storage/duckdb.battery.test.ts` pula um caso de mídia por design — o caminho de BLOB do DuckDB é intencionalmente restrito. O benchmark opcional de storage (`test/perf/storage-bench.test.ts`) também fica skipado a não ser que `CHATLAB_TEST_PERF=1`. Espere `90 passed | 2 skipped`.

### Coverage gate falha depois da minha mudança

```
ERROR: Coverage for branches (62.4%) does not meet global threshold (65%)
```

Rode com o relatório visível pra ver qual arquivo caiu:

```bash
npm test -- --coverage
```

A última coluna do relatório lista linhas não cobertas por arquivo. Adicione um teste que exercite o caminho. Não baixe o threshold sem uma ADR — veja [ADR 0010 §3](https://github.com/jvrmaia/chatlab/blob/main/docs/specs/adr/0010-test-strategy.md).

---

## Ainda travado?

- Abra uma issue: [`github.com/jvrmaia/chatlab/issues`](https://github.com/jvrmaia/chatlab/issues). Cole o banner de boot + o comando que falhou + o erro.
- Pra um bug com sensibilidade de segurança, siga o [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md) — não poste publicamente.
