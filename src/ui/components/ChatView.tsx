import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { UiAgent, UiChat, UiFeedback, UiMessage } from "../api.js";
import { AnnotationsPanel } from "./AnnotationsPanel.js";
import { Composer } from "./Composer.js";
import { MessageBubble } from "./MessageBubble.js";

interface Props {
  chat: UiChat;
  agent: UiAgent | null;
  messages: UiMessage[];
  feedbackByMessageId: Map<string, UiFeedback>;
  onSend: (text: string) => void;
  onSendFile: (file: File) => Promise<void>;
  onRate: (messageId: string, next: "up" | "down" | null) => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";
}

export function ChatView({
  chat,
  agent,
  messages,
  feedbackByMessageId,
  onSend,
  onSendFile,
  onRate,
}: Props) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      </div>
      <AnnotationsPanel chatId={chat.id} />
      <Composer onSend={onSend} onSendFile={onSendFile} />
    </main>
  );
}
