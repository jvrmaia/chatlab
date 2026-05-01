:::info Tradução automática (AI)
Esta página foi traduzida inicialmente com auxílio de IA. Sugestões de melhoria são bem-vindas via PR.
:::

# Guia do usuário

Um passo a passo narrativo do chatlab v1.x, do início ao fim.

Se quer a versão de 5 minutos sem comentários, leia o [`quickstart.md`](/quickstart).

## Jornada

1. [Instalar o chatlab](/user-guide/install) — do código-fonte hoje; npm + Docker quando publicado.
2. [Configurar seu primeiro workspace + agente](/user-guide/workspaces-and-agents) — seletor de workspace, escolha de provedor, chaves de API.
3. [Abrir uma conversa com um tema](/user-guide/chats-and-messages) — escolha um agente, defina um tema, digite mensagens.
4. [Múltiplas conversas, múltiplos temas](/user-guide/multiple-chats) — segregação de contexto em ação.
5. [Avaliações e export](/user-guide/feedback-and-export) — avalie respostas, escreva notas, exporte JSONL.
6. [Indo mais longe](/user-guide/going-further) — API programática, anexos de mídia, features adiadas.

## O que você não precisa

- Uma conta WhatsApp, um telefone, um QR code, uma aprovação de Meta business.
- Um serviço de agente já deployado.
- Conexão de rede (com Ollama local).

## O que este guia assume

- Node.js 22 na sua máquina.
- Conforto com `curl` + um terminal (`jq` ajuda mas é opcional).
- Familiaridade básica com o provedor LLM que você quer usar (OpenAI / Anthropic / etc.).

## Onde mora a fonte da verdade

- [`docs/specs/api/openapi.yaml`](/specs/api/) — cada endpoint, shape, código de erro.
- [`docs/specs/capabilities/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/capabilities) — seis specs numeradas descrevendo o que o chatlab faz.
- [`docs/specs/adr/`](https://github.com/jvrmaia/chatlab/tree/main/docs/specs/adr) — decisões arquiteturais duradouras.

Quando este guia está errado, esses arquivos estão certos.
