:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# 5. Avaliações e export

A razão de ser do chatlab é tornar a iteração no agente rápida. Iteração sem feedback é só digitação — você não teria sinal de quais respostas funcionaram e quais não. A v1.x dá duas affordances:

- **Avaliações por mensagem** (👍 / 👎 + comentário opcional) nos balões do assistente.
- **Anotações por conversa** — uma nota livre em Markdown sobre a conversa como um todo.

As duas exportáveis em JSONL prontas pra um pipeline de RLHF / DPO / SFT.

## Avaliando uma resposta

Cada balão do assistente carrega botões 👍 / 👎:

- Clique 👍 pra marcar uma resposta boa.
- Clique 👎 pra marcar uma ruim. Adicione um comentário opcional ≤ 280 chars.
- Clique no mesmo affordance duas vezes pra limpar.
- Clique no oposto pra substituir.

Mensagens de usuário **não** têm affordances de rating — elas são entradas, não saídas.

## Anotação por conversa

Abaixo da view da conversa tem um faixa `📝 notas da conversa`. Clique pra expandir. O painel tem duas tabs:

- **Editar** — textarea Markdown ≤ 16 KB, auto-save no blur.
- **Pré-visualizar** — renderiza o mesmo GFM que os balões de chat fazem (tabelas, fenced code, task lists, links). Trocar pra Preview com mudanças não salvas auto-salva primeiro, então o que você vê é o que está persistido.

Use isso pro contexto que a avaliação não consegue carregar: `"usuário ficou reformulando — agente ignorou o id do pedido"`, `"cenário happy-path"`, `"o agente devia ter pedido o CPF mais cedo"`. A anotação aparece no export JSONL ao lado de cada mensagem avaliada nesta conversa.

## Export

> Defina `TOKEN=dev-token` (caminho npm — auth permissiva) ou `TOKEN="$CHATLAB_REQUIRE_TOKEN"` (caminho Docker) antes de rodar esses exemplos.

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:4480/v1/feedback/export > corpus.jsonl
```

Cada linha é uma mensagem do assistente avaliada + o prompt que disparou ela + o tema da conversa + a anotação + um campo `agent_version: "<provider>:<model>"` auto-populado a partir do agente da conversa. `schema_version: 1`.

Filtre por tempo, rating, ou chat:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:4480/v1/feedback/export?rating=down&since=2026-04-01T00:00:00Z" > down.jsonl
```

## O que NÃO está no export

- Chaves de API (nunca).
- Avaliações limpas (deletadas, não retidas como null).
- Mensagens de usuário que não têm uma resposta de assistente avaliada adjacente.
- Dados de token / custo (fora de escopo pra v1.0).

## E daqui pra frente

[6. Indo mais longe](/user-guide/going-further) — API programática, cantos escondidos, features adiadas.
