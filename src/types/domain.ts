/**
 * chatlab core domain — workspace-scoped types.
 *
 * See capability specs 0001..0006 under `docs/specs/capabilities/`.
 */

export type WorkspaceId = string;
export type ChatId = string;
export type MessageId = string;
export type AgentId = string;

export type StorageType = "memory" | "sqlite" | "duckdb";

export interface Workspace {
  id: WorkspaceId;
  nickname: string;
  storage_type: StorageType;
  storage_path?: string;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: ChatId;
  workspace_id: WorkspaceId;
  agent_id: AgentId;
  theme: string;
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  media_id: string;
  mime_type: string;
  filename?: string;
}

export type MessageRole = "user" | "assistant";
export type MessageStatus = "ok" | "failed";

export interface Message {
  id: MessageId;
  chat_id: ChatId;
  role: MessageRole;
  content: string;
  attachments?: Attachment[];
  status: MessageStatus;
  error?: string;
  created_at: string;
}
