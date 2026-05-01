:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# 2. Workspaces e agentes

A primeira vez que você bota o chatlab no ar, ele cria um workspace chamado `default` com backend sqlite. Já é o suficiente pra começar. Mas se você vai rodar vários cenários em paralelo — "demo do support-bot" vs "experimento ousado" vs "analytics DuckDB" — vai querer mais workspaces.

## O seletor de workspace

A marca `chatlab` no canto superior esquerdo fica ao lado de um dropdown que lista todos os workspaces. Clicar troca o adapter ativo para o storage daquele workspace. A lista de conversas, lista de agentes e tudo mais é recarregado dos dados do novo workspace — nada do estado anterior vaza.

## Criando um workspace

Vá em **Admin → Workspaces → + Novo workspace**. Escolha um apelido e um backend de storage:

| Backend | Caso de uso |
| --- | --- |
| `memory` | Efêmero. Restart do processo apaga tudo. Use pra testes ou demos rápidas. |
| `sqlite` | Em arquivo, rápido pra carga de escrita normal. Default. |
| `duckdb` | Em arquivo, otimizado pra queries analíticas. Use se você vai rodar agregados sobre o corpus de feedback. |

Clique em **Criar**, depois **ativar** na linha. O seletor de workspace no topo atualiza.

Pra excluir um workspace, digite o apelido dele no prompt — o chatlab se recusa a excluir sem confirmação digitada, já que o arquivo de dados vai junto.

## Configurando um agente

Um **agente** é uma conexão configurada — pra um LLM hospedado **ou** pro agente **que você está construindo**. Agentes são escopados ao workspace: o que você cria em `experiment-1` não aparece em `default`. Sete provedores vêm out of the box:

| Provedor | Modelo default | Precisa de chave de API | Notas |
| --- | --- | --- | --- |
| `openai` | `gpt-4o` | sim | |
| `anthropic` | `claude-sonnet-4-6` | sim | |
| `deepseek` | `deepseek-chat` | sim | |
| `gemini` | `gemini-2.5-flash` | sim | |
| `maritaca` | `sabia-3` | sim | |
| `ollama` | `llama3` | não | Local — roda em `localhost:11434`. |
| `custom` | `my-agent` | opcional | **Seu agente em desenvolvimento.** Qualquer endpoint OpenAI-compat. Veja [`docs/providers.md#custom-your-agent-under-development`](https://github.com/jvrmaia/chatlab/blob/main/docs/providers.md). |

Vá em **Admin → Agentes → + Novo agente**. Preencha nome + provedor + (modelo — auto-preenchido com o default do provedor) + chave de API + system prompt opcional + janela de contexto opcional (default 20).

O campo de API key do form é `<input type="password">`. Depois de salvar, a chave é **criptografada em repouso** (AES-256-GCM, master key em `$CHATLAB_HOME/master.key` mode 0600 — veja [`SECURITY.md`](https://github.com/jvrmaia/chatlab/blob/main/SECURITY.md#at-rest-encryption)), mascarada (`***last4`) em toda resposta HTTP, e nunca aparece no export JSONL de feedback.

## Sondando o agente

O botão **Sondar** no form de edição envia um prompt de uma execução só e mostra a resposta inline. Use isso pra confirmar que a chave de API funciona antes de iniciar uma conversa real. Uma chave errada faz o erro original do upstream aparecer inline (`ZZ_AGENT_PROVIDER_ERROR` + o status original).

## E daqui pra frente

[3. Abrir uma conversa com um tema](/user-guide/chats-and-messages).
