---
sidebar_label: Visão geral
---

:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# chatlab

Uma **bancada local-first** para agentes de chat. Aponte o chatlab para o agente **que você está construindo** (o provider `custom`, qualquer endpoint OpenAI-compat) e para seis clientes LLM (OpenAI, Anthropic, DeepSeek, Gemini, Maritaca, Ollama) para comparação. Abra conversas com agentes e temas escolhidos, troque mensagens, avalie respostas, escreva notas, exporte um corpus JSONL quando estiver pronto para fazer fine-tune.

## Por que chatlab e não …

| Use chatlab quando… | Use **LangSmith** quando… | Use **Promptfoo** quando… | Use **OpenAI Playground** quando… |
| --- | --- | --- | --- |
| Você está **construindo um agente de chat** e quer testá-lo lado-a-lado com `gpt-4o`, `claude-sonnet-4-6` e `llama3` numa única bancada. O provider `custom` aponta para seu servidor de desenvolvimento; os seis clientes LLM rodam ao lado. Local-first, pronto pra exportar JSONL, sem SaaS. | Você está enviando um app LangChain e precisa de observabilidade + tracing em chains hospedado em cloud. O chatlab não rastreia chains internos — ele é uma bancada para a superfície de conversa, não para o runtime. | Você só precisa de um loop de **regression-eval** (golden set → asserções → score). O Promptfoo é ótimo nesse trabalho específico. O eval harness do chatlab está no roadmap da v1.1; use o Promptfoo até lá. | Você quer comparar um único prompt OpenAI entre `gpt-4o` e `o1` interativamente. O Playground é rápido e gratuito pra isso. O wedge do chatlab é multi-provedor + multi-workspace + corpus persistente + seu-próprio-agente. |

**O wedge:** aponte-pro-seu-agente (`custom`) + comparação multi-provedor + multi-workspace + totalmente local + pronto pra exportar JSONL. Se o primeiro não importa (você não está construindo um agente, só consumindo), uma das alternativas acima é provavelmente a melhor escolha.

Este site de documentação é gerado a partir da [árvore `docs/`](https://github.com/jvrmaia/chatlab/tree/main/docs). O **README canônico** (snippet de install, matriz de capabilities, layout do repositório) fica na raiz do repositório — abra **[README.md no GitHub](https://github.com/jvrmaia/chatlab/blob/main/README.md)**.

Continue daqui: **[Início rápido](/quickstart)**.
