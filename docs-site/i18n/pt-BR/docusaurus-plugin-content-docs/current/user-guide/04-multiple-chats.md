:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# 4. Múltiplas conversas, múltiplos temas

A manchete do chatlab v1.x: **o mesmo agente pode ter várias conversas com temas diferentes, todas perfeitamente separadas**.

## Por que isso importa

Quando você está testando um agente, vai querer perguntar sobre tópicos completamente diferentes — questões de preço, questões técnicas, casos de suporte, o que for — sem que a conversa anterior contamine a nova.

Você só cria outra conversa. Cada conversa carrega seu próprio UUID + tema. O runner monta o array de mensagens **só com o histórico daquela conversa** mais o tema como contexto de sistema. Duas conversas com o mesmo agente em temas diferentes literalmente não podem vazar uma na outra.

## Experimente

1. Crie uma conversa com tema `"Aprendendo Python"`. Envie `"Como começo?"`. O assistente responde com conselhos sobre Python.
2. Crie outra conversa com o mesmo agente + tema `"Receitas culinárias"`. Envie `"Como faço um pão?"`. O assistente responde sobre pão — sem mencionar Python.

Se você volta pra primeira conversa, o histórico está intacto. O agente não tem ideia que a segunda conversa existe.

## Quando isso importa mais

- **Comparando estratégias de prompt.** Abra duas conversas com o mesmo agente, uma com system prompt A e outra com system prompt B. Envie a mesma pergunta. Compare lado-a-lado.
- **Demos longas.** Uma conversa "demo pra equipe" com uma sequência focada de Q&A não precisa estar entulhada com mensagens descartáveis de runs de aquecimento.
- **Reprodução de bug.** Se uma sequência específica de mensagens quebra o agente, isole isso na própria conversa com tema `"reproduzir: o bug do #PR-42"`.

## E quanto a multi-agente / mesa-redonda?

Conversas têm exatamente um agente assistente na v1.0. Dois assistentes, mesa-redonda multi-usuário, etc., estão fora de escopo — veja [capability 0003 §Out of scope](https://github.com/jvrmaia/chatlab/blob/main/docs/specs/capabilities/0003-chats-and-messages.md#out-of-scope). Se você quer comparar dois agentes, rode-os em duas conversas.

## E daqui pra frente

[5. Avaliações e export](/user-guide/feedback-and-export).
