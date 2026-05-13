import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { UiAgent, UiChat, UiFeedback, UiMessage } from "../api.js";
import { AnnotationsPanel } from "./AnnotationsPanel.js";
import { Composer } from "./Composer.js";
import { MarkdownContent } from "./MarkdownContent.js";
import { MessageBubble } from "./MessageBubble.js";

interface Props {
  chat: UiChat;
  agent: UiAgent | null;
  messages: UiMessage[];
  pendingAssistantContent: string | null;
  feedbackByMessageId: Map<string, UiFeedback>;
  onSend: (text: string) => void;
  onSendFile: (file: File) => Promise<void>;
  onRate: (messageId: string, next: "up" | "down" | null) => void;
}

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";
}

export function ChatView({
  chat,
  agent,
  messages,
  pendingAssistantContent,
  feedbackByMessageId,
  onSend,
  onSendFile,
  onRate,
}: Props) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  const tokenTotals = useMemo(() => {
    let prompt = 0;
    let completion = 0;
    let hasData = false;
    for (const m of messages) {
      if (m.role === "assistant") {
        if (m.prompt_tokens != null) { prompt += m.prompt_tokens; hasData = true; }
        if (m.completion_tokens != null) completion += m.completion_tokens;
      }
    }
    return hasData ? { prompt, completion } : null;
  }, [messages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingAssistantContent]);

  return (
    <main className="flex flex-1 flex-col bg-canvas min-w-0">
      <header className="flex items-center gap-3 border-b border-line-soft bg-surface px-4 py-3">
        <span className="av" aria-hidden="true">
          {agent ? initials(agent.name) : "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{chat.theme}</div>
          <div className="flex items-center gap-2 truncate font-mono text-xs text-ink-3">
            <span>{agent?.name ?? t("chatView.deletedAgent")}</span>
            {agent && (
              <>
                <span className="badge badge--info">{agent.model}</span>
                <span className="badge">{agent.provider}</span>
              </>
            )}
            {tokenTotals && (
              <span
                className="badge"
                aria-label={t("chatView.totalTokens")}
                title={t("chatView.totalTokens")}
              >
                {t("chatView.totalTokensValue", {
                  prompt: fmtTokens(tokenTotals.prompt),
                  completion: fmtTokens(tokenTotals.completion),
                })}
              </span>
            )}
          </div>
        </div>
      </header>
      <div ref={scrollRef} className="scroll-area flex-1 py-2">
        {messages.length === 0 ? (
          <div className="mt-12 text-center text-sm text-ink-3">
            {t("chatView.emptyHint")}
          </div>
        ) : (
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              feedback={feedbackByMessageId.get(m.id) ?? null}
              onRate={onRate}
            />
          ))
        )}
        {pendingAssistantContent !== null && (
          <div className="flex flex-col px-3 py-1 items-start">
            <div className="bb bb--agent">
              {pendingAssistantContent
                ? <MarkdownContent content={pendingAssistantContent} />
                : <span className="animate-pulse text-ink-3">…</span>}
            </div>
          </div>
        )}
      </div>
      <AnnotationsPanel chatId={chat.id} />
      <Composer onSend={onSend} onSendFile={onSendFile} />
    </main>
  );
}
