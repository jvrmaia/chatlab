:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# Distribuição: NPM

> **Nome do pacote:** o nome `chatlab` (sem escopo) no npm já estava ocupado por um pacote sem relação, então o chatlab é publicado como **`@jvrmaia/chatlab`**. O binário CLI continua `chatlab` — depois do install, você digita `chatlab` independente do nome escopado do pacote.

A distribuição NPM mira em devs Node-shop que já têm uma toolchain JavaScript/TypeScript e querem o caminho de menor fricção pra subir o chatlab.

## Início rápido

```bash
# Rode sem instalar
npx @jvrmaia/chatlab

# Ou instale globalmente — o bin continua `chatlab`
npm install -g @jvrmaia/chatlab
chatlab
```

## Início rápido (hoje, do código-fonte)

```bash
git clone https://github.com/jvrmaia/chatlab.git
cd chatlab
npm install
npm run build
npm start
```

Por default, o chatlab:

- Escuta em `http://127.0.0.1:4480` pra API HTTP
- Serve a UI Web em `http://127.0.0.1:4480/ui`
- Armazena dados em `~/.chatlab/data/` — sqlite por default pro workspace `default` auto-criado
- Não dispara webhooks (sem superfície built-in de webhook na v1.x)

## Configuração

| Env var | Flag CLI | Default | Propósito |
| --- | --- | --- | --- |
| `CHATLAB_PORT` | `--port` | `4480` | Porta HTTP / WebSocket / UI |
| `CHATLAB_HOST` | `--host` | `127.0.0.1` | Endereço de bind |
| `CHATLAB_HOME` | `--home` | `~/.chatlab` | Registry de workspaces + data dir |
| `CHATLAB_WORKSPACE_ID` | `--workspace` | (`active_id` do registry) | Ativa um workspace específico no boot |
| `CHATLAB_LOG_LEVEL` | `--log-level` | `info` | Um de `silent`, `error`, `warn`, `info`, `debug` |
| `CHATLAB_REQUIRE_TOKEN` | `--require-token` | unset | Exige um token Bearer específico. Obrigatório quando `CHATLAB_HOST` é não-localhost — veja [bind-safety em `SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#bind-safety). |
| `CHATLAB_FEEDBACK_RETENTION_DAYS` | — | `90` | Quantos dias linhas de feedback + anotações são mantidas antes do delete automático (timer de 24 h). `0` desativa retention. |
| `CHATLAB_MASTER_KEY` | — | auto-gerada | Base64 de 32 bytes usados pra criptografar chaves de API em repouso (AES-256-GCM). Quando vazia, o chatlab gera `$CHATLAB_HOME/master.key` (mode 0600) no primeiro boot e reusa. Override pra CI / Docker secrets. **Perdeu a key, perdeu o cleartext.** Veja [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#at-rest-encryption). |

## Bind-safety

Se você setar `CHATLAB_HOST` pra qualquer coisa diferente de `127.0.0.1` / `localhost` / `::1` **sem** também setar `CHATLAB_REQUIRE_TOKEN`, o chatlab se recusa a iniciar (exit code `78`). Veja [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#bind-safety).

## API programática

`chatlab` é um pacote npm normal. Você pode importar em um processo Node.js e subir uma instância do chatlab in-process — sem `npm start` separado. É o que `test/http/_harness.ts` faz pra subir chatlab por arquivo de teste.

### Start/stop mínimo

```ts
import { startChatlab } from "@jvrmaia/chatlab";

const cl = await startChatlab({ port: 0 });   // 0 = porta efêmera
console.log(cl.url);                           // -> http://127.0.0.1:51234

// dirija com fetch() contra cl.url ...

await cl.stop();
```

`startChatlab` aceita as mesmas opções que o CLI aceita como flags / env vars:

| Opção | Env var equivalente | Default |
| --- | --- | --- |
| `host` | `CHATLAB_HOST` | `127.0.0.1` |
| `port` | `CHATLAB_PORT` | `4480` (`0` escolhe efêmera) |
| `home` | `CHATLAB_HOME` | `~/.chatlab` |
| `requireToken` | `CHATLAB_REQUIRE_TOKEN` | unset |
| `logLevel` | `CHATLAB_LOG_LEVEL` | `info` |

O objeto retornado expõe:

- **`cl.url`** — a URL base resolvida (`http://<host>:<port>`).
- **`cl.config`** — o objeto de config totalmente resolvido (útil quando você passou `port: 0` e precisa ler a porta real).
- **`cl.core`** — a instância `Core` rodando (event emitter + dono do storage; usos avançados).
- **`cl.stop()`** — fecha o listener HTTP, o WS gateway, o storage adapter ativo; resolve quando o shutdown termina.

### Script completo: configurar agente e rodar uma conversa

```ts
import { startChatlab } from "@jvrmaia/chatlab";

const cl = await startChatlab({ port: 0 });
const headers = {
  Authorization: "Bearer dev",
  "Content-Type": "application/json",
};

try {
  // 1. Configura um agente no workspace default.
  const agent = await fetch(`${cl.url}/v1/agents`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Local llama3",
      provider: "ollama",
      model: "llama3",
      system_prompt: "Responda em uma frase.",
    }),
  }).then((r) => r.json());

  // 2. Abre uma conversa com esse agente em um tema.
  const chat = await fetch(`${cl.url}/v1/chats`, {
    method: "POST",
    headers,
    body: JSON.stringify({ agent_id: agent.id, theme: "smoke test" }),
  }).then((r) => r.json());

  // 3. Envia uma mensagem do usuário. A resposta HTTP é a mensagem do usuário
  //    persistida; a resposta do assistente chega assíncrona, transmitida
  //    via WS e persistida no log de mensagens da conversa.
  await fetch(`${cl.url}/v1/chats/${chat.id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: "Olá" }),
  });

  // 4. Faz polling pela resposta do assistente.
  const start = Date.now();
  let reply: { content: string } | undefined;
  while (Date.now() - start < 10_000) {
    const msgs: { role: string; content: string }[] = await fetch(
      `${cl.url}/v1/chats/${chat.id}/messages`,
      { headers },
    ).then((r) => r.json());
    reply = msgs.find((m) => m.role === "assistant") as typeof reply;
    if (reply) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log("Resposta do assistente:", reply?.content ?? "(timeout)");
} finally {
  await cl.stop();
}
```

Rode de qualquer script Node 22. Equivalentes do mundo real que funcionam igual: uma spec Vitest, uma fixture Playwright, um CLI próprio que envelopa o chatlab atrás de um subcomando.

### Inscrever em eventos em vez de polling

```ts
const ws = new WebSocket(cl.url.replace(/^http/, "ws") + "/ws", {
  headers: { Authorization: "Bearer dev" },
});

ws.on("message", (raw) => {
  const event = JSON.parse(raw.toString()) as { type: string };
  if (event.type === "chat.assistant-replied") {
    console.log("recebeu resposta:", event);
  }
});
```

A superfície completa (tipos de evento, payloads) mora em `src/core/core.ts` — `CoreEvent` é a union.

### Dirigir o `Core` direto sem HTTP

Pra loops de harness muito apertados, você pode pular as round-trips HTTP completamente e chamar o storage adapter ativo:

```ts
const core = cl.core;
const adapter = await core.getActiveAdapter();

const chat = await adapter.chats.create({
  agent_id: "...",
  theme: "fixture",
});
await adapter.messages.append(chat.id, { role: "user", content: "seed" });
```

Isso pula a camada de auth e o shape OpenAPI — exposto pra testes, não pra código de aplicação. A superfície completa de exports está em [`src/index.ts`](https://github.com/jvrmaia/chatlab/blob/main/src/index.ts).

## Versionamento

A v1.0 é a primeira release sob o nome `chatlab`. Releases tagueadas publicam no npm sob a dist-tag `latest` (estável) ou `next` (pré-release).

## Versões de Node suportadas

Aquilo que estiver em [`.nvmrc`](https://github.com/jvrmaia/chatlab/blob/main/.nvmrc) na hora da release. Atualmente Node **22 LTS**.
