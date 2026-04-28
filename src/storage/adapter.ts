/**
 * Per-workspace storage adapter interface. Namespaces: chat, message, agent,
 * media, feedback, annotation.
 */

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

export interface StorageAdapter {
  init(): Promise<void>;
  close(): Promise<void>;
  reset(): Promise<void>;

  chats: {
    create(args: { workspace_id: WorkspaceId; agent_id: string; theme: string }): Promise<Chat>;
    get(id: ChatId): Promise<Chat | null>;
    list(): Promise<Chat[]>;
    delete(id: ChatId): Promise<boolean>;
    touch(id: ChatId): Promise<void>;
    listByAgent(agent_id: string): Promise<Chat[]>;
  };

  messages: {
    append(args: {
      chat_id: ChatId;
      role: MessageRole;
      content: string;
      attachments?: Attachment[];
      status?: MessageStatus;
      error?: string;
      agent_version?: string;
    }): Promise<Message>;
    get(id: MessageId): Promise<Message | null>;
    listByChat(chat_id: ChatId): Promise<Message[]>;
    delete(id: MessageId): Promise<boolean>;
  };

  agents: {
    create(args: AgentCreate & { workspace_id: WorkspaceId }): Promise<Agent>;
    get(id: string): Promise<Agent | null>;
    list(): Promise<Agent[]>;
    update(id: string, patch: AgentPatch): Promise<Agent | null>;
    delete(id: string): Promise<boolean>;
  };

  media: {
    put(args: {
      id: string;
      type: MediaType;
      mime_type: string;
      size: number;
      sha256: string;
      filename?: string;
      content: Buffer;
    }): Promise<MediaRecord>;
    get(id: string): Promise<MediaRecord | null>;
    getContent(id: string): Promise<Buffer | null>;
    delete(id: string): Promise<boolean>;
  };

  feedback: {
    set(args: {
      message_id: MessageId;
      rating: FeedbackRating;
      comment?: string;
      agent_version?: string;
      failure_category?: string;
      flagged_for_review?: boolean;
    }): Promise<Feedback>;
    get(message_id: MessageId): Promise<Feedback | null>;
    delete(message_id: MessageId): Promise<boolean>;
    list(filter: {
      since?: string;
      until?: string;
      rating?: FeedbackRating;
      chat_id?: ChatId;
    }): Promise<Feedback[]>;
    sweepOlderThan(cutoffIso: string): Promise<number>;
  };

  annotations: {
    set(args: { chat_id: ChatId; body: string }): Promise<Annotation>;
    get(chat_id: ChatId): Promise<Annotation | null>;
    delete(chat_id: ChatId): Promise<boolean>;
    sweepOlderThan(cutoffIso: string): Promise<number>;
  };
}

export class StorageError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "StorageError";
  }
}
