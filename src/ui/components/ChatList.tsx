import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createChat, type UiAgent, type UiChat } from "../api.js";
import { Icon } from "./Icon.js";

interface Props {
  chats: UiChat[];
  agents: UiAgent[];
  selectedId: string | null;
  onSelect: (chatId: string) => void;
  onCreated: (chat: UiChat) => void;
}

export function ChatList({ chats, agents, selectedId, onSelect, onCreated }: Props) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const [agentId, setAgentId] = useState<string>("");
  const [theme, setTheme] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (!agentId || !theme.trim()) {
      setErr(t("chatList.validation"));
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const chat = await createChat({ agent_id: agentId, theme: theme.trim() });
      onCreated(chat);
      setCreating(false);
      setAgentId("");
      setTheme("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function nameForAgent(id: string): string {
    return agents.find((a) => a.id === id)?.name ?? t("chatList.deletedAgent");
  }

  return (
    <aside
      className="flex flex-col border-r border-line-soft bg-surface"
      style={{ width: "var(--col-list)" }}
    >
      <header className="flex items-center justify-between border-b border-line-soft px-3 py-3">
        <div>
          <div className="font-semibold text-ink-1">{t("chatList.title")}</div>
          <div className="font-mono text-xs text-ink-3">
            {agents.length === 0 ? t("chatList.noAgents") : t("chatList.activeCount", { count: chats.length })}
          </div>
        </div>
        <button
          type="button"
          aria-label={t("chatList.newChat")}
          title={t("chatList.newChat")}
          disabled={agents.length === 0}
          onClick={() => setCreating(!creating)}
          className="btn btn--primary btn--icon btn--sm"
        >
          <Icon name={creating ? "x" : "plus"} size={14} />
        </button>
      </header>

      {creating && (
        <div className="space-y-3 border-b border-line-soft bg-sunken p-3">
          <div className="field">
            <span className="field__label">{t("chatList.agent")}</span>
            <select
              className="select"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">{t("chatList.pickAgent")}</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.provider}/{a.model}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <span className="field__label">{t("chatList.theme")}</span>
            <input
              className="input"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder={t("chatList.themePlaceholder")}
              maxLength={280}
            />
          </div>
          {err && <span className="badge badge--danger">{err}</span>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy}
              className="btn btn--primary btn--sm"
            >
              {busy ? t("common.loading") : t("common.create")}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setErr(null);
              }}
              className="btn btn--secondary btn--sm"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      <div className="scroll-area flex-1" role="list" aria-label={t("chatList.ariaList")}>
        {chats.length === 0 && !creating ? (
          <div role="listitem" className="p-3 text-xs text-ink-3">
            {t("chatList.emptyHintBefore")}<strong>+</strong>{t("chatList.emptyHintAfter")}
          </div>
        ) : (
          chats.map((chat) => {
            const isSelected = selectedId === chat.id;
            return (
              <button
                key={chat.id}
                type="button"
                role="listitem"
                aria-current={isSelected ? "true" : undefined}
                onClick={() => onSelect(chat.id)}
                className={`w-full border-b border-line-soft px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? "bg-accent-50 text-accent-700"
                    : "hover:bg-sunken"
                }`}
              >
                <div className="truncate text-sm font-medium">{chat.theme}</div>
                <div className="truncate font-mono text-[11px] text-ink-3">
                  {nameForAgent(chat.agent_id)}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
