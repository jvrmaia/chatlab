:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# 6. Indo mais longe

Você instalou o chatlab, configurou um workspace + agente, abriu conversas com temas, trocou mensagens, avaliou respostas e exportou um corpus. E daqui pra onde?

## API programática (Node)

Suba o chatlab in-process pra testes de integração:

```ts
import { startChatlab } from "@jvrmaia/chatlab";

const cl = await startChatlab({ port: 0 });   // porta efêmera
console.log(cl.url);                            // -> http://127.0.0.1:51234

// dirija com fetch() contra cl.url ...

await cl.stop();
```

O `Core` exportado fica em `cl.core` pra trabalho avançado de harness. Você também pode passar `agentFetcher: typeof fetch` pra mockar respostas do provedor sem mexer no `fetch` global:

```ts
const cl = await startChatlab({
  port: 0,
  agentFetcher: async () => new Response(JSON.stringify({ choices: [...] }), { status: 200 }),
});
```

É exatamente assim que os testes de integração do chatlab funcionam — veja `test/agents/runner.test.ts`.

## Controle programático de workspace

```ts
import { WorkspaceRegistry } from "@jvrmaia/chatlab";

const registry = new WorkspaceRegistry({ home: "/tmp/my-chatlab-home" });
await registry.init();

const ws = registry.create({ nickname: "cenario-1", storage_type: "memory" });
registry.setActive(ws.id);
```

O registry é só um arquivo JSON com semântica de escrita atômica. Útil pra seedar fixtures em testes E2E.

## O que a v1.0 do chatlab não faz

Estas são adiadas — veja [`docs/ROADMAP.md`](https://github.com/jvrmaia/chatlab/blob/main/docs/ROADMAP.md):

- **Respostas em streaming (SSE)** — o runner faz buffer da resposta completa do provedor.
- **Encaminhamento multimodal** — anexos são armazenados mas não enviados ao LLM.
- **Chamada de tool / função.**
- **Conversas multi-usuário / multi-agente** (testes em mesa-redonda).
- **Tracking de token / custo.**
- **Adapters de plataforma** (Telegram, Slack, Discord, WhatsApp Cloud API). Vindo em v1.2+.
- **Site de docs navegável** — [https://jvrmaia.github.io/chatlab/](https://jvrmaia.github.io/chatlab/) ([ADR 0009](https://github.com/jvrmaia/chatlab/blob/main/docs/specs/adr/0009-github-pages-documentation-site.md)); rode local com `npm run docs:dev` da raiz do repo.

## O que o chatlab não é

- Não é um SaaS hospedado — roda totalmente no seu laptop. Veja [ADR 0011](https://github.com/jvrmaia/chatlab/blob/main/docs/specs/adr/0011-hosted-instance-deferred.md).
- Não é um loop de fine-tuning — o chatlab produz o corpus; o que você faz com ele é o seu loop.
- Não é uma plataforma de chat na qual end-users se cadastram — é uma ferramenta de desenvolvedor pra construir agentes que mirem em plataformas reais.

## Você terminou

A referência pra tudo que você possa precisar:

- [`recipes.md`](/recipes) — curl pra cada endpoint.
- [`specs/api/openapi.yaml`](/api/) — contrato HTTP formal.
- [`specs/capabilities/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/capabilities) — o que o chatlab faz, por quê.
- [`specs/adr/`](/specs/adr/) — decisões arquiteturais duradouras.
- [`ARCHITECTURE.md`](/ARCHITECTURE) — como as peças se encaixam.
