import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocaleFormat } from "../i18n/format.js";
import { Icon } from "./Icon.js";

interface Props {
  events: unknown[];
}

type Level = "info" | "ok" | "warn" | "err";

interface ParsedEvent {
  raw: unknown;
  level: Level;
  type: string;
  meta: string;
  ts: string;
}

function parseEvent(e: unknown, formatTimeWithSeconds: (d: Date | string | number) => string): ParsedEvent {
  const ts = formatTimeWithSeconds(new Date());
  if (typeof e !== "object" || e === null) {
    return { raw: e, level: "info", type: String(e), meta: "", ts };
  }
  const obj = e as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : "event";
  let level: Level = "info";
  if (type.endsWith(".replied") || type.endsWith(".created")) level = "ok";
  if (type.includes("failed") || type.includes("error")) level = "err";
  if (type.includes("warn")) level = "warn";
  const meta = Object.entries(obj)
    .filter(([k]) => k !== "type")
    .slice(0, 1)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  return { raw: e, level, type, meta, ts };
}

export function DevDrawer({ events }: Props) {
  const { t } = useTranslation();
  const { formatTimeWithSeconds } = useLocaleFormat();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <aside className="flex flex-col border-l border-line-soft bg-surface" style={{ width: 32 }}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn btn--ghost btn--icon btn--sm"
          style={{ width: 32, borderRadius: 0 }}
          title={t("devDrawer.showAria")}
          aria-label={t("devDrawer.showAria")}
        >
          <Icon name="terminal" size={14} />
        </button>
      </aside>
    );
  }

  const parsed = events.slice(-100).reverse().map((e) => parseEvent(e, formatTimeWithSeconds));

  return (
    <aside
      className="flex flex-col border-l border-line-soft bg-surface"
      style={{ width: "var(--col-logs)" }}
    >
      <header className="flex items-center justify-between border-b border-line-soft px-3 py-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <Icon name="terminal" size={14} /> {t("devDrawer.title")}
          <span className="badge">{events.length}</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="btn btn--ghost btn--icon btn--sm"
          aria-label={t("devDrawer.hideAria")}
          title={t("devDrawer.hide")}
        >
          <Icon name="x" size={14} />
        </button>
      </header>
      <div className="scroll-area flex-1 px-2 py-2" role="log" aria-live="polite" aria-relevant="additions">
        {parsed.length === 0 ? (
          <div className="px-2 py-4 font-mono text-xs text-ink-3">{t("devDrawer.empty")}</div>
        ) : (
          parsed.map((e, i) => (
            <div key={i} className={`log log--${e.level}`}>
              <span className="log__t">{e.ts}</span>
              <span className="log__l">{e.level}</span>
              <span className="log__m" title={e.type}>
                {e.type}
              </span>
              <span className="log__x">{e.meta}</span>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
