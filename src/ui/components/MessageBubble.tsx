import type { JSX } from "react";
import { useTranslation } from "react-i18next";
import { mediaDownloadUrl, type UiFeedback, type UiMessage } from "../api.js";
import { useLocaleFormat } from "../i18n/format.js";
import { Icon } from "./Icon.js";
import { MarkdownContent } from "./MarkdownContent.js";

interface Props {
  message: UiMessage;
  feedback: UiFeedback | null;
  onRate: (messageId: string, next: "up" | "down" | null) => void;
}

export function MessageBubble({ message, feedback, onRate }: Props) {
  const { t } = useTranslation();
  const { formatTime } = useLocaleFormat();
  const isAssistant = message.role === "assistant";
  const failed = message.status === "failed";

  function tap(next: "up" | "down"): void {
    const cur = feedback?.rating ?? null;
    onRate(message.id, cur === next ? null : next);
  }

  const bubbleClass = failed
    ? "bb bb--failed"
    : isAssistant
      ? "bb bb--agent"
      : "bb bb--user";

  return (
    <div className={`flex flex-col px-3 py-1 ${isAssistant ? "items-start" : "items-end"}`}>
      <div className={bubbleClass}>
        {failed ? (
          <div>
            <div className="font-medium">{t("chatView.agentFailed")}</div>
            <div className="mt-1 font-mono text-xs">{message.error ?? t("chatView.unknownError")}</div>
          </div>
        ) : (
          <>
            {message.attachments && message.attachments.length > 0 && (
              <div className="mb-1 space-y-1">
                {message.attachments.map((a) => (
                  <Attachment key={a.media_id} attachment={a} />
                ))}
              </div>
            )}
            {message.content && <MarkdownContent content={message.content} />}
          </>
        )}
        <div className="mt-1 text-right font-mono text-[11px] text-ink-3">
          {formatTime(message.created_at)}
        </div>
      </div>
      {isAssistant && !failed && (
        <div className="mt-1 flex gap-1">
          <button
            type="button"
            aria-label={feedback?.rating === "up" ? t("feedback.removePositive") : t("feedback.rateGood")}
            onClick={() => tap("up")}
            className={`btn btn--icon btn--sm ${
              feedback?.rating === "up" ? "btn--accent" : "btn--ghost"
            }`}
          >
            <Icon name="thumbsUp" size={14} />
          </button>
          <button
            type="button"
            aria-label={feedback?.rating === "down" ? t("feedback.removeNegative") : t("feedback.rateBad")}
            onClick={() => tap("down")}
            className={`btn btn--icon btn--sm ${
              feedback?.rating === "down" ? "btn--danger" : "btn--ghost"
            }`}
          >
            <Icon name="thumbsDown" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function Attachment({
  attachment,
}: {
  attachment: { media_id: string; mime_type: string; filename?: string };
}): JSX.Element {
  const { t } = useTranslation();
  if (attachment.mime_type.startsWith("image/")) {
    return (
      <img
        src={mediaDownloadUrl(attachment.media_id)}
        alt={attachment.filename ?? t("chatView.imageAlt")}
        className="rounded-md max-h-64"
      />
    );
  }
  if (attachment.mime_type.startsWith("audio/")) {
    return (
      <audio controls src={mediaDownloadUrl(attachment.media_id)} className="max-w-full" />
    );
  }
  if (attachment.mime_type.startsWith("video/")) {
    return (
      <video controls src={mediaDownloadUrl(attachment.media_id)} className="rounded-md max-h-64" />
    );
  }
  return (
    <a
      href={mediaDownloadUrl(attachment.media_id)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 underline text-accent-700"
    >
      <Icon name="paperclip" size={14} />
      {attachment.filename ?? t("chatView.documentAlt")}
    </a>
  );
}
