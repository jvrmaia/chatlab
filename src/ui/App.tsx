import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activateWorkspace,
  clearFeedback,
  listAgents,
  listChats,
  listChatFeedback,
  listMessages,
  listWorkspaces,
  openWs,
  sendUserMessage,
  setFeedback,
  uploadMedia,
  type UiAgent,
  type UiAttachment,
  type UiChat,
  type UiFeedback,
  type UiMessage,
  type UiWorkspace,
} from "./api.js";
import { AdminPanel } from "./components/admin/AdminPanel.js";
import { ChatList } from "./components/ChatList.js";
import { ChatView } from "./components/ChatView.js";
import { DevDrawer } from "./components/DevDrawer.js";
import { ThemeToggle } from "./components/ThemeToggle.js";
import { PrivacyBanner } from "./components/PrivacyBanner.js";

const SELECTED_CHAT_KEY = "chatlab.selectedChatId";

type TopTab = "chats" | "admin";

export function App() {
  const [topTab, setTopTab] = useState<TopTab>("chats");
  const [workspaces, setWorkspaces] = useState<UiWorkspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>("");
  const [agents, setAgents] = useState<UiAgent[]>([]);
  const [chats, setChats] = useState<UiChat[]>([]);
  const [selectedChatId, setSelectedChatIdRaw] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SELECTED_CHAT_KEY);
    } catch {
      return null;
    }
  });
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Map<string, UiFeedback>>(new Map());
  const [events, setEvents] = useState<unknown[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);
  const selectedChatRef = useRef<string | null>(selectedChatId);

  function setSelectedChatId(id: string | null): void {
    selectedChatRef.current = id;
    setSelectedChatIdRaw(id);
    try {
      if (id) localStorage.setItem(SELECTED_CHAT_KEY, id);
      else localStorage.removeItem(SELECTED_CHAT_KEY);
    } catch {
      // localStorage unavailable
    }
  }

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );
  const selectedAgent = useMemo(
    () => (selectedChat ? agents.find((a) => a.id === selectedChat.agent_id) ?? null : null),
    [agents, selectedChat],
  );

  // Initial bootstrap: load workspaces, then their agents + chats.
  useEffect(() => {
    void (async () => {
      try {
        const ws = await listWorkspaces();
        setWorkspaces(ws.data);
        setActiveWorkspaceId(ws.active_id);
        setAgents(await listAgents());
        const fetchedChats = await listChats();
        setChats(fetchedChats);
        if (selectedChatId && !fetchedChats.some((c) => c.id === selectedChatId)) {
          setSelectedChatId(null);
        }
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Load messages + feedback when chat changes.
  useEffect(() => {
    if (!selectedChatId) {
      setMessages([]);
      setFeedbackByMessageId(new Map());
      return;
    }
    void listMessages(selectedChatId)
      .then(setMessages)
      .catch((e) => console.error(e));
    void listChatFeedback(selectedChatId)
      .then((items) => {
        const m = new Map<string, UiFeedback>();
        for (const f of items) m.set(f.message_id, f);
        setFeedbackByMessageId(m);
      })
      .catch((e) => console.error(e));
  }, [selectedChatId]);

  // WebSocket: open + reconnect with backoff, dispatch events to UI state.
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let attempt = 0;
    let cancelled = false;

    const connect = (): void => {
      if (cancelled) return;
      setWsStatus("connecting");
      ws = openWs();
      ws.addEventListener("open", () => {
        attempt = 0;
        setWsStatus("open");
      });
      ws.addEventListener("close", () => {
        setWsStatus("closed");
        if (cancelled) return;
        const delay = Math.min(30_000, 500 * Math.pow(2, attempt++));
        reconnectTimer = window.setTimeout(connect, delay);
      });
      ws.addEventListener("message", (event) => {
        let payload: { type?: string; [k: string]: unknown };
        try {
          payload = JSON.parse(event.data as string);
        } catch {
          return;
        }
        setEvents((es) => [...es, payload]);

        if (payload.type === "workspace.activated") {
          bump();
          return;
        }
        if (
          payload.type === "chat.created" ||
          payload.type === "chat.deleted"
        ) {
          void listChats().then(setChats).catch(() => undefined);
          return;
        }
        if (
          payload.type === "chat.user-message-appended" ||
          payload.type === "chat.assistant-replied" ||
          payload.type === "agent.failed"
        ) {
          const msg = (payload as { message?: UiMessage }).message;
          if (msg && msg.chat_id === selectedChatRef.current) {
            void listMessages(msg.chat_id).then(setMessages).catch(() => undefined);
          }
          // refresh chat list ordering
          void listChats().then(setChats).catch(() => undefined);
          return;
        }
      });
    };

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  async function handleSend(text: string): Promise<void> {
    if (!selectedChatId) return;
    try {
      const userMsg = await sendUserMessage(selectedChatId, text);
      setMessages((ms) => [...ms, userMsg]);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSendFile(file: File): Promise<void> {
    if (!selectedChatId) return;
    try {
      const type = guessMediaType(file);
      const { id } = await uploadMedia(file, type);
      const attachment: UiAttachment = {
        media_id: id,
        mime_type: file.type,
        ...(file.name ? { filename: file.name } : {}),
      };
      const userMsg = await sendUserMessage(selectedChatId, file.name ?? "(attachment)", [attachment]);
      setMessages((ms) => [...ms, userMsg]);
    } catch (e) {
      console.error(e);
    }
  }

  const handleRate = useCallback(
    async (messageId: string, next: "up" | "down" | null): Promise<void> => {
      try {
        if (next === null) {
          await clearFeedback(messageId);
          setFeedbackByMessageId((m) => {
            const updated = new Map(m);
            updated.delete(messageId);
            return updated;
          });
        } else {
          const fb = await setFeedback(messageId, next);
          setFeedbackByMessageId((m) => new Map(m).set(messageId, fb));
        }
      } catch (e) {
        console.error(e);
      }
    },
    [],
  );

  async function handleSwitchWorkspace(id: string): Promise<void> {
    try {
      await activateWorkspace(id);
      setSelectedChatId(null);
      bump();
    } catch (e) {
      console.error(e);
      window.alert(`Failed to switch workspace: ${(e as Error).message}`);
    }
  }

  return (
    <div className="flex h-full flex-col bg-canvas text-ink-1 font-sans">
      <header
        className="flex items-center gap-4 border-b border-line-soft bg-surface px-4"
        style={{ height: "var(--topbar-h)" }}
      >
        <span className="logo">
          <span className="logo__mark" aria-hidden="true" />
          chatlab
        </span>
        <select
          value={activeWorkspaceId}
          onChange={(e) => void handleSwitchWorkspace(e.target.value)}
          className="select"
          style={{ height: 32, width: "auto", paddingRight: 32 }}
          aria-label="Active workspace"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.nickname} ({w.storage_type})
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <div className="tabs">
          {(["chats", "admin"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className="tab"
              aria-selected={topTab === t}
              onClick={() => setTopTab(t)}
            >
              {t === "chats" ? "Chats" : "Admin"}
            </button>
          ))}
        </div>
        <ThemeToggle />
      </header>
      <PrivacyBanner agents={agents} />
      {wsStatus !== "open" && (
        <div className="flex justify-center py-1">
          <span
            className={
              wsStatus === "closed" ? "badge badge--warn" : "badge"
            }
          >
            {wsStatus === "connecting"
              ? "connecting to chatlab…"
              : "connection lost — reconnecting…"}
          </span>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        {topTab === "chats" ? (
          <>
            <ChatList
              chats={chats}
              agents={agents}
              selectedId={selectedChatId}
              onSelect={(id) => setSelectedChatId(id)}
              onCreated={(c) => {
                setChats((cs) => [c, ...cs]);
                setSelectedChatId(c.id);
              }}
            />
            {selectedChat ? (
              <ChatView
                chat={selectedChat}
                agent={selectedAgent}
                messages={messages}
                feedbackByMessageId={feedbackByMessageId}
                onSend={(t) => void handleSend(t)}
                onSendFile={handleSendFile}
                onRate={(id, n) => void handleRate(id, n)}
              />
            ) : (
              <main className="flex-1 flex items-center justify-center bg-canvas text-ink-2">
                <div className="text-center max-w-sm px-6">
                  <p className="text-lg">Select a chat to start.</p>
                  <p className="mt-2 font-mono text-xs text-ink-3">
                    {agents.length === 0
                      ? "no chats yet — go to admin → agents to configure your first agent"
                      : "no chats yet — click + in the sidebar to start one"}
                  </p>
                </div>
              </main>
            )}
            <DevDrawer events={events} />
          </>
        ) : (
          <AdminPanel refreshKey={refreshKey} bump={bump} />
        )}
      </div>
    </div>
  );
}

function guessMediaType(file: File): string {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}
