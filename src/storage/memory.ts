import { newId } from "../lib/id.js";
import { nowIso } from "../lib/time.js";
import { decryptString, encryptString, isEncrypted } from "../lib/crypto.js";
import type {
  Attachment,
  Chat,
  ChatId,
  Message,
  MessageId,
  MessageRole,
  MessageStatus,
  WorkspaceId,
} from "../types/domain.js";
import type { Agent, AgentCreate, AgentPatch } from "../types/agent.js";
import type { Annotation, Feedback, FeedbackRating } from "../types/feedback.js";
import type { MediaRecord, MediaType } from "../types/media.js";
import type { StorageAdapter } from "./adapter.js";

export class MemoryAdapter implements StorageAdapter {
  private chatsMap = new Map<ChatId, Chat>();
  private messagesMap = new Map<MessageId, Message>();
  private agentsMap = new Map<string, Agent>();
  private mediaMeta = new Map<string, MediaRecord>();
  private mediaContent = new Map<string, Buffer>();
  private feedbackMap = new Map<MessageId, Feedback>();
  private annotationsMap = new Map<ChatId, Annotation>();

  constructor(private readonly masterKey?: Buffer) {}

  private encryptKey(plain: string | undefined): string | undefined {
    if (plain === undefined) return undefined;
    if (!this.masterKey || isEncrypted(plain)) return plain;
    return encryptString(plain, this.masterKey);
  }

  private decryptKey(stored: string | undefined): string | undefined {
    if (stored === undefined) return undefined;
    if (!this.masterKey || !isEncrypted(stored)) return stored;
    try {
      return decryptString(stored, this.masterKey);
    } catch {
      return stored;
    }
  }

  private decryptAgent(a: Agent): Agent {
    if (a.api_key === undefined) return a;
    const decrypted = this.decryptKey(a.api_key);
    if (decrypted === a.api_key) return a;
    const { api_key: _, ...rest } = a;
    void _;
    return decrypted !== undefined ? { ...rest, api_key: decrypted } : rest;
  }

  async init(): Promise<void> {}
  async close(): Promise<void> {}

  async reset(): Promise<void> {
    this.chatsMap.clear();
    this.messagesMap.clear();
    this.agentsMap.clear();
    this.mediaMeta.clear();
    this.mediaContent.clear();
    this.feedbackMap.clear();
    this.annotationsMap.clear();
  }

  chats = {
    create: async (args: {
      workspace_id: WorkspaceId;
      agent_id: string;
      theme: string;
    }): Promise<Chat> => {
      const ts = nowIso();
      const chat: Chat = {
        id: newId(),
        workspace_id: args.workspace_id,
        agent_id: args.agent_id,
        theme: args.theme,
        created_at: ts,
        updated_at: ts,
      };
      this.chatsMap.set(chat.id, chat);
      return chat;
    },
    get: async (id: ChatId): Promise<Chat | null> => this.chatsMap.get(id) ?? null,
    list: async (): Promise<Chat[]> =>
      Array.from(this.chatsMap.values()).sort((a, b) =>
        b.updated_at.localeCompare(a.updated_at),
      ),
    delete: async (id: ChatId): Promise<boolean> => {
      if (!this.chatsMap.has(id)) return false;
      this.chatsMap.delete(id);
      const messageIds: MessageId[] = [];
      for (const [mid, m] of this.messagesMap) {
        if (m.chat_id === id) messageIds.push(mid);
      }
      for (const mid of messageIds) {
        this.messagesMap.delete(mid);
        this.feedbackMap.delete(mid);
      }
      this.annotationsMap.delete(id);
      return true;
    },
    touch: async (id: ChatId): Promise<void> => {
      const chat = this.chatsMap.get(id);
      if (chat) {
        this.chatsMap.set(id, { ...chat, updated_at: nowIso() });
      }
    },
    listByAgent: async (agent_id: string): Promise<Chat[]> =>
      Array.from(this.chatsMap.values()).filter((c) => c.agent_id === agent_id),
  };

  messages = {
    append: async (args: {
      chat_id: ChatId;
      role: MessageRole;
      content: string;
      attachments?: Attachment[];
      status?: MessageStatus;
      error?: string;
      agent_version?: string;
    }): Promise<Message> => {
      const msg: Message = {
        id: newId(),
        chat_id: args.chat_id,
        role: args.role,
        content: args.content,
        ...(args.attachments && args.attachments.length > 0
          ? { attachments: args.attachments }
          : {}),
        status: args.status ?? "ok",
        ...(args.error !== undefined ? { error: args.error } : {}),
        ...(args.agent_version !== undefined ? { agent_version: args.agent_version } : {}),
        created_at: nowIso(),
      };
      this.messagesMap.set(msg.id, msg);
      const chat = this.chatsMap.get(args.chat_id);
      if (chat) {
        this.chatsMap.set(chat.id, { ...chat, updated_at: msg.created_at });
      }
      return msg;
    },
    get: async (id: MessageId): Promise<Message | null> => this.messagesMap.get(id) ?? null,
    listByChat: async (chat_id: ChatId): Promise<Message[]> =>
      Array.from(this.messagesMap.values())
        .filter((m) => m.chat_id === chat_id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    delete: async (id: MessageId): Promise<boolean> => {
      if (!this.messagesMap.has(id)) return false;
      this.messagesMap.delete(id);
      this.feedbackMap.delete(id);
      return true;
    },
  };

  agents = {
    create: async (args: AgentCreate & { workspace_id: WorkspaceId }): Promise<Agent> => {
      const ts = nowIso();
      const encKey = this.encryptKey(args.api_key);
      const a: Agent = {
        id: args.id ?? newId(),
        workspace_id: args.workspace_id,
        name: args.name,
        provider: args.provider,
        model: args.model,
        ...(encKey !== undefined ? { api_key: encKey } : {}),
        ...(args.base_url !== undefined ? { base_url: args.base_url } : {}),
        ...(args.system_prompt !== undefined ? { system_prompt: args.system_prompt } : {}),
        context_window: args.context_window,
        ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
        created_at: ts,
        updated_at: ts,
      };
      this.agentsMap.set(a.id, a);
      return this.decryptAgent(a);
    },
    get: async (id: string): Promise<Agent | null> => {
      const a = this.agentsMap.get(id);
      return a ? this.decryptAgent(a) : null;
    },
    list: async (): Promise<Agent[]> =>
      Array.from(this.agentsMap.values())
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((a) => this.decryptAgent(a)),
    update: async (id: string, patch: AgentPatch): Promise<Agent | null> => {
      const existing = this.agentsMap.get(id);
      if (!existing) return null;
      const newKey =
        patch.api_key !== undefined && patch.api_key.length > 0
          ? this.encryptKey(patch.api_key)
          : undefined;
      const updated: Agent = {
        ...existing,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
        ...(patch.model !== undefined ? { model: patch.model } : {}),
        ...(newKey !== undefined ? { api_key: newKey } : {}),
        ...(patch.base_url !== undefined ? { base_url: patch.base_url } : {}),
        ...(patch.system_prompt !== undefined ? { system_prompt: patch.system_prompt } : {}),
        ...(patch.context_window !== undefined ? { context_window: patch.context_window } : {}),
        ...(patch.temperature !== undefined ? { temperature: patch.temperature } : {}),
        updated_at: nowIso(),
      };
      this.agentsMap.set(id, updated);
      return this.decryptAgent(updated);
    },
    delete: async (id: string): Promise<boolean> => {
      if (!this.agentsMap.has(id)) return false;
      this.agentsMap.delete(id);
      return true;
    },
  };

  media = {
    put: async (args: {
      id: string;
      type: MediaType;
      mime_type: string;
      size: number;
      sha256: string;
      filename?: string;
      content: Buffer;
    }): Promise<MediaRecord> => {
      const rec: MediaRecord = {
        id: args.id,
        type: args.type,
        mime_type: args.mime_type,
        size: args.size,
        sha256: args.sha256,
        ...(args.filename ? { filename: args.filename } : {}),
        created_at: nowIso(),
      };
      this.mediaMeta.set(args.id, rec);
      this.mediaContent.set(args.id, args.content);
      return rec;
    },
    get: async (id: string): Promise<MediaRecord | null> => this.mediaMeta.get(id) ?? null,
    getContent: async (id: string): Promise<Buffer | null> => this.mediaContent.get(id) ?? null,
    delete: async (id: string): Promise<boolean> => {
      if (!this.mediaMeta.has(id)) return false;
      this.mediaMeta.delete(id);
      this.mediaContent.delete(id);
      return true;
    },
  };

  feedback = {
    set: async (args: {
      message_id: MessageId;
      rating: FeedbackRating;
      comment?: string;
      agent_version?: string;
      failure_category?: string;
      flagged_for_review?: boolean;
    }): Promise<Feedback> => {
      const fb: Feedback = {
        message_id: args.message_id,
        rating: args.rating,
        ...(args.comment !== undefined ? { comment: args.comment } : {}),
        rated_at: nowIso(),
        ...(args.agent_version !== undefined ? { agent_version: args.agent_version } : {}),
        ...(args.failure_category !== undefined ? { failure_category: args.failure_category } : {}),
        ...(args.flagged_for_review !== undefined
          ? { flagged_for_review: args.flagged_for_review }
          : {}),
      };
      this.feedbackMap.set(args.message_id, fb);
      return fb;
    },
    get: async (message_id: MessageId): Promise<Feedback | null> =>
      this.feedbackMap.get(message_id) ?? null,
    delete: async (message_id: MessageId): Promise<boolean> => this.feedbackMap.delete(message_id),
    list: async (filter: {
      since?: string;
      until?: string;
      rating?: FeedbackRating;
      chat_id?: ChatId;
    }): Promise<Feedback[]> => {
      let out = Array.from(this.feedbackMap.values());
      if (filter.since) out = out.filter((f) => f.rated_at >= filter.since!);
      if (filter.until) out = out.filter((f) => f.rated_at <= filter.until!);
      if (filter.rating) out = out.filter((f) => f.rating === filter.rating);
      if (filter.chat_id) {
        const chatId = filter.chat_id;
        out = out.filter((f) => {
          const m = this.messagesMap.get(f.message_id);
          return m?.chat_id === chatId;
        });
      }
      return out;
    },
    sweepOlderThan: async (cutoffIso: string): Promise<number> => {
      let removed = 0;
      for (const [id, fb] of this.feedbackMap) {
        if (fb.rated_at < cutoffIso) {
          this.feedbackMap.delete(id);
          removed++;
        }
      }
      return removed;
    },
  };

  annotations = {
    set: async (args: { chat_id: ChatId; body: string }): Promise<Annotation> => {
      const ann: Annotation = {
        chat_id: args.chat_id,
        body: args.body,
        updated_at: nowIso(),
      };
      this.annotationsMap.set(args.chat_id, ann);
      return ann;
    },
    get: async (chat_id: ChatId): Promise<Annotation | null> =>
      this.annotationsMap.get(chat_id) ?? null,
    delete: async (chat_id: ChatId): Promise<boolean> => this.annotationsMap.delete(chat_id),
    sweepOlderThan: async (cutoffIso: string): Promise<number> => {
      let removed = 0;
      for (const [id, ann] of this.annotationsMap) {
        if (ann.updated_at < cutoffIso) {
          this.annotationsMap.delete(id);
          removed++;
        }
      }
      return removed;
    },
  };
}
