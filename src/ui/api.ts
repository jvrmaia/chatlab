/**
 * UI HTTP client. Bearer token is injected by the server into window.__CHATLAB_TOKEN__
 * at serve time (strict mode) or falls back to "ui-dev-token" (permissive / Vite dev).
 * All endpoints operate on the *active* workspace unless they're explicitly
 * workspace-management endpoints.
 */

const TOKEN = (window as { __CHATLAB_TOKEN__?: string }).__CHATLAB_TOKEN__ ?? "ui-dev-token";

export type StorageType = "memory" | "sqlite" | "duckdb";

export interface UiWorkspace {
  id: string;
  nickname: string;
  storage_type: StorageType;
  storage_path?: string;
  created_at: string;
  updated_at: string;
}

export type UiAgentProvider =
  | "openai"
  | "anthropic"
  | "deepseek"
  | "gemini"
  | "maritaca"
  | "ollama"
  | "custom";

export interface UiAgent {
  id: string;
  workspace_id: string;
  name: string;
  provider: UiAgentProvider;
  model: string;
  api_key?: string;
  base_url?: string;
  system_prompt?: string;
  context_window: number;
  created_at: string;
  updated_at: string;
}

export interface UiAgentCreate {
  name: string;
  provider: UiAgentProvider;
  model: string;
  api_key?: string;
  base_url?: string;
  system_prompt?: string;
  context_window?: number;
}

export interface UiChat {
  id: string;
  workspace_id: string;
  agent_id: string;
  theme: string;
  created_at: string;
  updated_at: string;
}

export interface UiAttachment {
  media_id: string;
  mime_type: string;
  filename?: string;
}

export interface UiMessage {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: UiAttachment[];
  status: "ok" | "failed";
  error?: string;
  created_at: string;
}

export interface UiFeedback {
  message_id: string;
  rating: "up" | "down";
  comment?: string;
  rated_at: string;
  agent_version?: string;
  failure_category?: string;
  flagged_for_review?: boolean;
}

export interface UiAnnotation {
  chat_id: string;
  body: string;
  updated_at: string | null;
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    let msg = `${method} ${path} -> ${res.status}`;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) msg += ` : ${j.error.message}`;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// -------------------- workspaces --------------------

export async function listWorkspaces(): Promise<{ data: UiWorkspace[]; active_id: string }> {
  return api("GET", "/v1/workspaces");
}

export async function getActiveWorkspace(): Promise<UiWorkspace> {
  return api("GET", "/v1/workspaces/active");
}

export async function createWorkspace(input: {
  nickname: string;
  storage_type: StorageType;
}): Promise<UiWorkspace> {
  return api("POST", "/v1/workspaces", input);
}

export async function activateWorkspace(id: string): Promise<UiWorkspace> {
  return api("POST", `/v1/workspaces/${encodeURIComponent(id)}/activate`);
}

export async function deleteWorkspace(id: string): Promise<{ removed_id: string; active: UiWorkspace }> {
  return api("DELETE", `/v1/workspaces/${encodeURIComponent(id)}?confirm=true`);
}

// -------------------- agents --------------------

export const UI_PROVIDER_DEFAULTS: Record<
  UiAgentProvider,
  { base_url: string; model: string; requires_api_key: boolean }
> = {
  openai: { base_url: "https://api.openai.com/v1", model: "gpt-4o", requires_api_key: true },
  anthropic: {
    base_url: "https://api.anthropic.com",
    model: "claude-sonnet-4-6",
    requires_api_key: true,
  },
  deepseek: { base_url: "https://api.deepseek.com", model: "deepseek-chat", requires_api_key: true },
  gemini: {
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    requires_api_key: true,
  },
  maritaca: { base_url: "https://chat.maritaca.ai/api", model: "sabia-3", requires_api_key: true },
  ollama: { base_url: "http://localhost:11434/v1", model: "llama3", requires_api_key: false },
  custom: { base_url: "http://localhost:8000/v1", model: "my-agent", requires_api_key: false },
};

export async function listAgents(): Promise<UiAgent[]> {
  const r = await api<{ data: UiAgent[] }>("GET", "/v1/agents");
  return r.data;
}

export async function createAgent(input: UiAgentCreate): Promise<UiAgent> {
  return api("POST", "/v1/agents", input);
}

export async function updateAgent(id: string, patch: Partial<UiAgentCreate>): Promise<UiAgent> {
  return api("PATCH", `/v1/agents/${encodeURIComponent(id)}`, patch);
}

export async function deleteAgent(id: string): Promise<void> {
  await api("DELETE", `/v1/agents/${encodeURIComponent(id)}`);
}

export async function probeAgent(id: string, prompt: string): Promise<{ content: string }> {
  return api("POST", `/v1/agents/${encodeURIComponent(id)}/probe`, { prompt });
}

// -------------------- chats --------------------

export async function listChats(): Promise<UiChat[]> {
  const r = await api<{ data: UiChat[] }>("GET", "/v1/chats");
  return r.data;
}

export async function createChat(input: { agent_id: string; theme: string }): Promise<UiChat> {
  return api("POST", "/v1/chats", input);
}

export async function deleteChat(id: string): Promise<void> {
  await api("DELETE", `/v1/chats/${encodeURIComponent(id)}`);
}

export async function listMessages(chatId: string): Promise<UiMessage[]> {
  const r = await api<{ data: UiMessage[] }>(
    "GET",
    `/v1/chats/${encodeURIComponent(chatId)}/messages`,
  );
  return r.data;
}

export async function sendUserMessage(
  chatId: string,
  content: string,
  attachments: UiAttachment[] = [],
): Promise<UiMessage> {
  return api("POST", `/v1/chats/${encodeURIComponent(chatId)}/messages`, {
    content,
    ...(attachments.length > 0 ? { attachments } : {}),
  });
}

// -------------------- feedback + annotations --------------------

export async function setFeedback(
  messageId: string,
  rating: "up" | "down",
  comment?: string,
): Promise<UiFeedback> {
  return api("POST", `/v1/messages/${encodeURIComponent(messageId)}/feedback`, {
    rating,
    ...(comment ? { comment } : {}),
  });
}

export async function clearFeedback(messageId: string): Promise<void> {
  await api("DELETE", `/v1/messages/${encodeURIComponent(messageId)}/feedback`);
}

export async function listChatFeedback(chatId: string): Promise<UiFeedback[]> {
  const r = await api<{ data: UiFeedback[] }>(
    "GET",
    `/v1/chats/${encodeURIComponent(chatId)}/feedback`,
  );
  return r.data;
}

export async function getAnnotation(chatId: string): Promise<UiAnnotation> {
  return api("GET", `/v1/chats/${encodeURIComponent(chatId)}/annotation`);
}

export async function setAnnotation(chatId: string, body: string): Promise<UiAnnotation> {
  return api("PUT", `/v1/chats/${encodeURIComponent(chatId)}/annotation`, { body });
}

// -------------------- media --------------------

export async function uploadMedia(file: File, type: string): Promise<{ id: string }> {
  const form = new FormData();
  form.append("type", type);
  form.append("file", file);
  const res = await fetch("/v1/media", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(j.error?.message ?? `upload failed (${res.status})`);
  }
  return res.json() as Promise<{ id: string }>;
}

export function mediaDownloadUrl(mediaId: string): string {
  return `/v1/media/${encodeURIComponent(mediaId)}/download`;
}

// -------------------- ws --------------------

export function openWs(): WebSocket {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${proto}//${location.host}/ws?token=${encodeURIComponent(TOKEN)}`);
}
