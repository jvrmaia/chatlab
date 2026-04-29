import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
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
import type { Agent, AgentCreate, AgentPatch, AgentProvider } from "../types/agent.js";
import type { Annotation, Feedback, FeedbackRating } from "../types/feedback.js";
import type { MediaRecord, MediaType } from "../types/media.js";
import type { StorageAdapter } from "./adapter.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  theme TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chats_workspace ON chats(workspace_id);
CREATE INDEX IF NOT EXISTS idx_chats_agent ON chats(agent_id);
CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL,
  attachments TEXT,
  status TEXT NOT NULL CHECK(status IN ('ok','failed')),
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key TEXT,
  base_url TEXT,
  system_prompt TEXT,
  context_window INTEGER NOT NULL DEFAULT 20,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  filename TEXT,
  content BLOB NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  message_id TEXT PRIMARY KEY,
  rating TEXT NOT NULL CHECK(rating IN ('up','down')),
  comment TEXT,
  rated_at TEXT NOT NULL,
  agent_version TEXT,
  failure_category TEXT,
  flagged_for_review INTEGER
);

CREATE TABLE IF NOT EXISTS annotations (
  chat_id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

interface ChatRow {
  id: string;
  workspace_id: string;
  agent_id: string;
  theme: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  chat_id: string;
  role: MessageRole;
  content: string;
  attachments: string | null;
  status: MessageStatus;
  error: string | null;
  created_at: string;
}

interface AgentRow {
  id: string;
  workspace_id: string;
  name: string;
  provider: string;
  model: string;
  api_key: string | null;
  base_url: string | null;
  system_prompt: string | null;
  context_window: number;
  created_at: string;
  updated_at: string;
}

interface MediaRow {
  id: string;
  type: string;
  mime_type: string;
  size: number;
  sha256: string;
  filename: string | null;
  content: Buffer;
  created_at: string;
}

interface FeedbackRow {
  message_id: string;
  rating: FeedbackRating;
  comment: string | null;
  rated_at: string;
  agent_version: string | null;
  failure_category: string | null;
  flagged_for_review: number | null;
}

interface AnnotationRow {
  chat_id: string;
  body: string;
  updated_at: string;
}

export class SqliteAdapter implements StorageAdapter {
  private db: Database.Database;

  constructor(filePath: string, private readonly masterKey?: Buffer) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
  }

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

  async init(): Promise<void> {
    this.db.exec(SCHEMA);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async reset(): Promise<void> {
    this.db.exec(`
      DELETE FROM annotations;
      DELETE FROM feedback;
      DELETE FROM media;
      DELETE FROM agents;
      DELETE FROM messages;
      DELETE FROM chats;
    `);
  }

  // -------------------- chats --------------------

  chats = {
    create: async (args: { workspace_id: WorkspaceId; agent_id: string; theme: string }): Promise<Chat> => {
      const ts = nowIso();
      const chat: Chat = {
        id: newId(),
        workspace_id: args.workspace_id,
        agent_id: args.agent_id,
        theme: args.theme,
        created_at: ts,
        updated_at: ts,
      };
      this.db
        .prepare(
          `INSERT INTO chats (id, workspace_id, agent_id, theme, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(chat.id, chat.workspace_id, chat.agent_id, chat.theme, chat.created_at, chat.updated_at);
      return chat;
    },
    get: async (id: ChatId): Promise<Chat | null> => {
      const row = this.db.prepare(`SELECT * FROM chats WHERE id = ?`).get(id) as ChatRow | undefined;
      return row ? rowToChat(row) : null;
    },
    list: async (): Promise<Chat[]> => {
      const rows = this.db
        .prepare(`SELECT * FROM chats ORDER BY updated_at DESC`)
        .all() as ChatRow[];
      return rows.map(rowToChat);
    },
    delete: async (id: ChatId): Promise<boolean> => {
      const tx = this.db.transaction((cid: string) => {
        this.db
          .prepare(
            `DELETE FROM feedback WHERE message_id IN (SELECT id FROM messages WHERE chat_id = ?)`,
          )
          .run(cid);
        this.db.prepare(`DELETE FROM annotations WHERE chat_id = ?`).run(cid);
        this.db.prepare(`DELETE FROM messages WHERE chat_id = ?`).run(cid);
        const r = this.db.prepare(`DELETE FROM chats WHERE id = ?`).run(cid);
        return r.changes > 0;
      });
      return tx(id) as boolean;
    },
    touch: async (id: ChatId): Promise<void> => {
      this.db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`).run(nowIso(), id);
    },
    listByAgent: async (agent_id: string): Promise<Chat[]> => {
      const rows = this.db
        .prepare(`SELECT * FROM chats WHERE agent_id = ? ORDER BY updated_at DESC`)
        .all(agent_id) as ChatRow[];
      return rows.map(rowToChat);
    },
  };

  // -------------------- messages --------------------

  messages = {
    append: async (args: {
      chat_id: ChatId;
      role: MessageRole;
      content: string;
      attachments?: Attachment[];
      status?: MessageStatus;
      error?: string;
    }): Promise<Message> => {
      const ts = nowIso();
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
        created_at: ts,
      };
      const attachmentsJson =
        msg.attachments && msg.attachments.length > 0 ? JSON.stringify(msg.attachments) : null;
      const tx = this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO messages (id, chat_id, role, content, attachments, status, error, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            msg.id,
            msg.chat_id,
            msg.role,
            msg.content,
            attachmentsJson,
            msg.status,
            msg.error ?? null,
            msg.created_at,
          );
        this.db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`).run(ts, msg.chat_id);
      });
      tx();
      return msg;
    },
    get: async (id: MessageId): Promise<Message | null> => {
      const row = this.db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as
        | MessageRow
        | undefined;
      return row ? rowToMessage(row) : null;
    },
    listByChat: async (chat_id: ChatId): Promise<Message[]> => {
      const rows = this.db
        .prepare(`SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC`)
        .all(chat_id) as MessageRow[];
      return rows.map(rowToMessage);
    },
    delete: async (id: MessageId): Promise<boolean> => {
      const r = this.db.prepare(`DELETE FROM messages WHERE id = ?`).run(id);
      this.db.prepare(`DELETE FROM feedback WHERE message_id = ?`).run(id);
      return r.changes > 0;
    },
  };

  // -------------------- agents --------------------

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
        created_at: ts,
        updated_at: ts,
      };
      this.db
        .prepare(
          `INSERT INTO agents (id, workspace_id, name, provider, model, api_key, base_url, system_prompt, context_window, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          a.id,
          a.workspace_id,
          a.name,
          a.provider,
          a.model,
          a.api_key ?? null,
          a.base_url ?? null,
          a.system_prompt ?? null,
          a.context_window,
          a.created_at,
          a.updated_at,
        );
      return this.decryptAgent(a);
    },
    get: async (id: string): Promise<Agent | null> => {
      const row = this.db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as AgentRow | undefined;
      return row ? this.decryptAgent(rowToAgent(row)) : null;
    },
    list: async (): Promise<Agent[]> => {
      const rows = this.db
        .prepare(`SELECT * FROM agents ORDER BY created_at ASC`)
        .all() as AgentRow[];
      return rows.map((r) => this.decryptAgent(rowToAgent(r)));
    },
    update: async (id: string, patch: AgentPatch): Promise<Agent | null> => {
      const row = this.db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as AgentRow | undefined;
      if (!row) return null;
      const existing = rowToAgent(row); // api_key still stored ciphertext
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
        updated_at: nowIso(),
      };
      this.db
        .prepare(
          `UPDATE agents
             SET name = ?, provider = ?, model = ?, api_key = ?, base_url = ?, system_prompt = ?, context_window = ?, updated_at = ?
             WHERE id = ?`,
        )
        .run(
          updated.name,
          updated.provider,
          updated.model,
          updated.api_key ?? null,
          updated.base_url ?? null,
          updated.system_prompt ?? null,
          updated.context_window,
          updated.updated_at,
          id,
        );
      return this.decryptAgent(updated);
    },
    delete: async (id: string): Promise<boolean> => {
      const r = this.db.prepare(`DELETE FROM agents WHERE id = ?`).run(id);
      return r.changes > 0;
    },
  };

  // -------------------- media --------------------

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
      const ts = nowIso();
      this.db
        .prepare(
          `INSERT OR REPLACE INTO media (id, type, mime_type, size, sha256, filename, content, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          args.id,
          args.type,
          args.mime_type,
          args.size,
          args.sha256,
          args.filename ?? null,
          args.content,
          ts,
        );
      const rec: MediaRecord = {
        id: args.id,
        type: args.type,
        mime_type: args.mime_type,
        size: args.size,
        sha256: args.sha256,
        ...(args.filename ? { filename: args.filename } : {}),
        created_at: ts,
      };
      return rec;
    },
    get: async (id: string): Promise<MediaRecord | null> => {
      const row = this.db
        .prepare(
          `SELECT id, type, mime_type, size, sha256, filename, created_at FROM media WHERE id = ?`,
        )
        .get(id) as Omit<MediaRow, "content"> | undefined;
      if (!row) return null;
      return {
        id: row.id,
        type: row.type as MediaType,
        mime_type: row.mime_type,
        size: row.size,
        sha256: row.sha256,
        ...(row.filename ? { filename: row.filename } : {}),
        created_at: row.created_at,
      };
    },
    getContent: async (id: string): Promise<Buffer | null> => {
      const row = this.db.prepare(`SELECT content FROM media WHERE id = ?`).get(id) as
        | { content: Buffer }
        | undefined;
      return row?.content ?? null;
    },
    delete: async (id: string): Promise<boolean> => {
      const r = this.db.prepare(`DELETE FROM media WHERE id = ?`).run(id);
      return r.changes > 0;
    },
  };

  // -------------------- feedback --------------------

  feedback = {
    set: async (args: {
      message_id: MessageId;
      rating: FeedbackRating;
      comment?: string;
      agent_version?: string;
      failure_category?: string;
      flagged_for_review?: boolean;
    }): Promise<Feedback> => {
      const ts = nowIso();
      this.db
        .prepare(
          `INSERT OR REPLACE INTO feedback (message_id, rating, comment, rated_at, agent_version, failure_category, flagged_for_review)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          args.message_id,
          args.rating,
          args.comment ?? null,
          ts,
          args.agent_version ?? null,
          args.failure_category ?? null,
          args.flagged_for_review === undefined ? null : args.flagged_for_review ? 1 : 0,
        );
      const fb: Feedback = {
        message_id: args.message_id,
        rating: args.rating,
        ...(args.comment !== undefined ? { comment: args.comment } : {}),
        rated_at: ts,
        ...(args.agent_version !== undefined ? { agent_version: args.agent_version } : {}),
        ...(args.failure_category !== undefined ? { failure_category: args.failure_category } : {}),
        ...(args.flagged_for_review !== undefined
          ? { flagged_for_review: args.flagged_for_review }
          : {}),
      };
      return fb;
    },
    get: async (message_id: MessageId): Promise<Feedback | null> => {
      const row = this.db.prepare(`SELECT * FROM feedback WHERE message_id = ?`).get(message_id) as
        | FeedbackRow
        | undefined;
      return row ? rowToFeedback(row) : null;
    },
    delete: async (message_id: MessageId): Promise<boolean> => {
      const r = this.db.prepare(`DELETE FROM feedback WHERE message_id = ?`).run(message_id);
      return r.changes > 0;
    },
    list: async (filter: {
      since?: string;
      until?: string;
      rating?: FeedbackRating;
      chat_id?: ChatId;
    }): Promise<Feedback[]> => {
      const conditions: string[] = [];
      const params: unknown[] = [];
      if (filter.since) {
        conditions.push(`f.rated_at >= ?`);
        params.push(filter.since);
      }
      if (filter.until) {
        conditions.push(`f.rated_at <= ?`);
        params.push(filter.until);
      }
      if (filter.rating) {
        conditions.push(`f.rating = ?`);
        params.push(filter.rating);
      }
      if (filter.chat_id) {
        conditions.push(`f.message_id IN (SELECT id FROM messages WHERE chat_id = ?)`);
        params.push(filter.chat_id);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const rows = this.db
        .prepare(`SELECT f.* FROM feedback f ${where} ORDER BY f.rated_at ASC`)
        .all(...params) as FeedbackRow[];
      return rows.map(rowToFeedback);
    },
    sweepOlderThan: async (cutoffIso: string): Promise<number> => {
      const r = this.db.prepare(`DELETE FROM feedback WHERE rated_at < ?`).run(cutoffIso);
      return r.changes;
    },
  };

  // -------------------- annotations --------------------

  annotations = {
    set: async (args: { chat_id: ChatId; body: string }): Promise<Annotation> => {
      const ts = nowIso();
      this.db
        .prepare(
          `INSERT INTO annotations (chat_id, body, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(chat_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
        )
        .run(args.chat_id, args.body, ts);
      return { chat_id: args.chat_id, body: args.body, updated_at: ts };
    },
    get: async (chat_id: ChatId): Promise<Annotation | null> => {
      const row = this.db.prepare(`SELECT * FROM annotations WHERE chat_id = ?`).get(chat_id) as
        | AnnotationRow
        | undefined;
      return row ? { chat_id: row.chat_id, body: row.body, updated_at: row.updated_at } : null;
    },
    delete: async (chat_id: ChatId): Promise<boolean> => {
      const r = this.db.prepare(`DELETE FROM annotations WHERE chat_id = ?`).run(chat_id);
      return r.changes > 0;
    },
    sweepOlderThan: async (cutoffIso: string): Promise<number> => {
      const r = this.db.prepare(`DELETE FROM annotations WHERE updated_at < ?`).run(cutoffIso);
      return r.changes;
    },
  };
}

function rowToChat(row: ChatRow): Chat {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    agent_id: row.agent_id,
    theme: row.theme,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): Message {
  const attachments = row.attachments
    ? (JSON.parse(row.attachments) as Attachment[])
    : undefined;
  const out: Message = {
    id: row.id,
    chat_id: row.chat_id,
    role: row.role,
    content: row.content,
    status: row.status,
    created_at: row.created_at,
  };
  if (attachments && attachments.length > 0) out.attachments = attachments;
  if (row.error) out.error = row.error;
  return out;
}

function rowToAgent(row: AgentRow): Agent {
  const out: Agent = {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    provider: row.provider as AgentProvider,
    model: row.model,
    context_window: row.context_window,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (row.api_key !== null) out.api_key = row.api_key;
  if (row.base_url !== null) out.base_url = row.base_url;
  if (row.system_prompt !== null) out.system_prompt = row.system_prompt;
  return out;
}

function rowToFeedback(row: FeedbackRow): Feedback {
  const out: Feedback = {
    message_id: row.message_id,
    rating: row.rating,
    rated_at: row.rated_at,
  };
  if (row.comment !== null) out.comment = row.comment;
  if (row.agent_version !== null) out.agent_version = row.agent_version;
  if (row.failure_category !== null) out.failure_category = row.failure_category;
  if (row.flagged_for_review !== null) out.flagged_for_review = row.flagged_for_review === 1;
  return out;
}
