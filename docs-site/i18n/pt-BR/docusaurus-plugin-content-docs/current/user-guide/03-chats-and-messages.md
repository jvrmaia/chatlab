:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# 3. Conversas e mensagens

Uma **conversa** é uma interação entre você (role `user`) e um agente escolhido (role `assistant`), fixada em um **tema** em texto livre. Cada conversa carrega seu próprio UUID e histórico de mensagens — contexto nunca vaza entre conversas.

## Criando uma conversa

Clique em **Conversas** no topo, depois **+** na barra lateral. Um form inline pequeno abre:

- **Dropdown de agente** — todos os agentes do workspace ativo. Escolha um.
- **Tema** — tópico em texto livre (ex.: `"Aprendendo Python"`). Até 280 chars.

Clique em **Criar**. A conversa aparece na barra lateral e é selecionada automaticamente.

## Enviando mensagens

Digite no composer no rodapé + tecle **Enter** (ou clique em **Enviar**). O balão do usuário aparece imediatamente. Em alguns segundos o balão do assistente vem em seguida.

O que aconteceu por baixo dos panos:

1. `POST /v1/chats/{id}/messages` persistiu a mensagem do usuário + emitiu `chat.user-message-appended`.
2. O AgentRunner pegou o evento, consultou o `agent_id` da conversa, montou um array de mensagens (system prompt + tema + últimas N mensagens), e chamou o provedor.
3. A resposta foi persistida como mensagem `assistant` + emitiu `chat.assistant-replied`.
4. O WS gateway transmitiu os eventos; a UI fez re-fetch e renderizou.

## Markdown nas mensagens

Os balões de usuário e assistente renderizam o conteúdo como **GitHub-flavored Markdown**. Isso quer dizer que `**negrito**`, `_itálico_`, blocos de código com fence (```` ```python ````), `código` inline, listas, task lists (`- [x]`), tabelas, blockquotes, e autolinks todos renderizam. Fences com três backticks são particularmente úteis quando você está testando um agente que retorna código — o resultado fica legível em vez de escapado.

HTML cru dentro das mensagens é **descartado** pelo renderer (sem `<script>`, sem `<iframe>`, sem `<img>` também) — só features seguras do Markdown passam. Links abrem em nova aba.

## Quando algo dá errado

Se a chave de API do agente está errada (ou o provedor está fora, ou você foi rate-limited), o balão do assistente aparece com borda vermelha e o erro visível inline. A conversa fica aberta — corrija a chave em **Admin → Agentes → Editar** e a próxima mensagem dá certo.

Mensagens que falham persistem com `status: "failed"` e a mensagem de erro no campo `error`. Elas não quebram o runner — mensagens subsequentes funcionam normalmente.

## Anexos

O ícone 📎 no composer (ou drag-and-drop) permite anexar um arquivo. O arquivo faz upload via `POST /v1/media`, recebe um UUID, e viaja junto na próxima mensagem de usuário como entrada em `attachments[]`.

Atenção: na v1.0 o runner **não** encaminha anexos pro provedor LLM — encaminhamento multimodal está adiado pra v1.1. O anexo fica armazenado ao lado da mensagem mas o provedor só vê o conteúdo texto. Você ainda consegue testar fluxos UX de "usuário fez upload de um screenshot"; só vai precisar colar uma transcrição manual por enquanto.

## E daqui pra frente

[4. Múltiplas conversas, múltiplos temas](/user-guide/multiple-chats).
