import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
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
  id VARCHAR PRIMARY KEY,
  workspace_id VARCHAR NOT NULL,
  agent_id VARCHAR NOT NULL,
  theme VARCHAR NOT NULL,
  created_at VARCHAR NOT NULL,
  updated_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR PRIMARY KEY,
  chat_id VARCHAR NOT NULL,
  role VARCHAR NOT NULL,
  content VARCHAR NOT NULL,
  attachments_json VARCHAR,
  status VARCHAR NOT NULL,
  error VARCHAR,
  created_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id VARCHAR PRIMARY KEY,
  workspace_id VARCHAR NOT NULL,
  name VARCHAR NOT NULL,
  provider VARCHAR NOT NULL,
  model VARCHAR NOT NULL,
  api_key VARCHAR,
  base_url VARCHAR,
  system_prompt VARCHAR,
  context_window INTEGER NOT NULL DEFAULT 20,
  created_at VARCHAR NOT NULL,
  updated_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS media (
  id VARCHAR PRIMARY KEY,
  type VARCHAR NOT NULL,
  mime_type VARCHAR NOT NULL,
  size BIGINT NOT NULL,
  sha256 VARCHAR NOT NULL,
  filename VARCHAR,
  content BLOB NOT NULL,
  created_at VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
  message_id VARCHAR PRIMARY KEY,
  rating VARCHAR NOT NULL,
  comment VARCHAR,
  rated_at VARCHAR NOT NULL,
  agent_version VARCHAR,
  failure_category VARCHAR,
  flagged_for_review BOOLEAN
);

CREATE TABLE IF NOT EXISTS annotations (
  chat_id VARCHAR PRIMARY KEY,
  body VARCHAR NOT NULL,
  updated_at VARCHAR NOT NULL
);
`;

export class DuckDbAdapter implements StorageAdapter {
  private dbPath: string;
  private instance: Awaited<ReturnType<typeof DuckDBInstance.create>> | null = null;
  private conn: DuckDBConnection | null = null;

  constructor(filePath: string, private readonly masterKey?: Buffer) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.dbPath = filePath;
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
    this.instance = await DuckDBInstance.create(this.dbPath);
    this.conn = await this.instance.connect();
    for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
      await this.conn.run(stmt);
    }
  }

  async close(): Promise<void> {
    this.conn?.disconnectSync();
    this.conn = null;
    this.instance = null;
  }

  async reset(): Promise<void> {
    const c = this.connection();
    for (const tbl of ["annotations", "feedback", "media", "agents", "messages", "chats"]) {
      await c.run(`DELETE FROM ${tbl}`);
    }
  }

  private connection(): DuckDBConnection {
    if (!this.conn) {
      throw new Error("DuckDB adapter not initialized. Call StorageAdapter#init() before use.");
    }
    return this.conn;
  }

  private async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.connection().run(sql, params as never);
    const rows = await result.getRowObjectsJson();
    return rows as T[];
  }

  private async exec(sql: string, params: unknown[] = []): Promise<void> {
    await this.connection().run(sql, params as never);
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
      await this.exec(
        `INSERT INTO chats (id, workspace_id, agent_id, theme, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
        [chat.id, chat.workspace_id, chat.agent_id, chat.theme, chat.created_at, chat.updated_at],
      );
      return chat;
    },
    get: async (id: ChatId): Promise<Chat | null> => {
      const rows = await this.query<Chat>(`SELECT * FROM chats WHERE id = ?`, [id]);
      return rows[0] ?? null;
    },
    list: async (): Promise<Chat[]> => {
      return this.query<Chat>(`SELECT * FROM chats ORDER BY updated_at DESC`);
    },
    delete: async (id: ChatId): Promise<boolean> => {
      const before = await this.query<{ id: string }>(`SELECT id FROM chats WHERE id = ?`, [id]);
      if (before.length === 0) return false;
      await this.exec(
        `DELETE FROM feedback WHERE message_id IN (SELECT id FROM messages WHERE chat_id = ?)`,
        [id],
      );
      await this.exec(`DELETE FROM annotations WHERE chat_id = ?`, [id]);
      await this.exec(`DELETE FROM messages WHERE chat_id = ?`, [id]);
      await this.exec(`DELETE FROM chats WHERE id = ?`, [id]);
      return true;
    },
    touch: async (id: ChatId): Promise<void> => {
      await this.exec(`UPDATE chats SET updated_at = ? WHERE id = ?`, [nowIso(), id]);
    },
    listByAgent: async (agent_id: string): Promise<Chat[]> => {
      return this.query<Chat>(
        `SELECT * FROM chats WHERE agent_id = ? ORDER BY updated_at DESC`,
        [agent_id],
      );
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
      const id = newId();
      const attachments_json =
        args.attachments && args.attachments.length > 0 ? JSON.stringify(args.attachments) : null;
      const status: MessageStatus = args.status ?? "ok";
      await this.exec(
        `INSERT INTO messages (id, chat_id, role, content, attachments_json, status, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, args.chat_id, args.role, args.content, attachments_json, status, args.error ?? null, ts],
      );
      await this.exec(`UPDATE chats SET updated_at = ? WHERE id = ?`, [ts, args.chat_id]);
      const msg: Message = {
        id,
        chat_id: args.chat_id,
        role: args.role,
        content: args.content,
        ...(args.attachments && args.attachments.length > 0
          ? { attachments: args.attachments }
          : {}),
        status,
        ...(args.error !== undefined ? { error: args.error } : {}),
        created_at: ts,
      };
      return msg;
    },
    get: async (id: MessageId): Promise<Message | null> => {
      const rows = await this.query<MessageRowDuck>(
        `SELECT * FROM messages WHERE id = ?`,
        [id],
      );
      return rows[0] ? messageFromRow(rows[0]) : null;
    },
    listByChat: async (chat_id: ChatId): Promise<Message[]> => {
      const rows = await this.query<MessageRowDuck>(
        `SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC`,
        [chat_id],
      );
      return rows.map(messageFromRow);
    },
    delete: async (id: MessageId): Promise<boolean> => {
      const before = await this.query<{ id: string }>(`SELECT id FROM messages WHERE id = ?`, [id]);
      if (before.length === 0) return false;
      await this.exec(`DELETE FROM messages WHERE id = ?`, [id]);
      await this.exec(`DELETE FROM feedback WHERE message_id = ?`, [id]);
      return true;
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
      await this.exec(
        `INSERT INTO agents (id, workspace_id, name, provider, model, api_key, base_url, system_prompt, context_window, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
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
        ],
      );
      return this.decryptAgent(a);
    },
    get: async (id: string): Promise<Agent | null> => {
      const rows = await this.query<AgentRowDuck>(`SELECT * FROM agents WHERE id = ?`, [id]);
      return rows[0] ? this.decryptAgent(agentFromRow(rows[0])) : null;
    },
    list: async (): Promise<Agent[]> => {
      const rows = await this.query<AgentRowDuck>(`SELECT * FROM agents ORDER BY created_at ASC`);
      return rows.map((r) => this.decryptAgent(agentFromRow(r)));
    },
    update: async (id: string, patch: AgentPatch): Promise<Agent | null> => {
      const rows = await this.query<AgentRowDuck>(`SELECT * FROM agents WHERE id = ?`, [id]);
      if (rows.length === 0) return null;
      const existing = agentFromRow(rows[0]!); // api_key still ciphertext
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
      await this.exec(
        `UPDATE agents SET name = ?, provider = ?, model = ?, api_key = ?, base_url = ?, system_prompt = ?, context_window = ?, updated_at = ? WHERE id = ?`,
        [
          updated.name,
          updated.provider,
          updated.model,
          updated.api_key ?? null,
          updated.base_url ?? null,
          updated.system_prompt ?? null,
          updated.context_window,
          updated.updated_at,
          id,
        ],
      );
      return this.decryptAgent(updated);
    },
    delete: async (id: string): Promise<boolean> => {
      const before = await this.query<{ id: string }>(`SELECT id FROM agents WHERE id = ?`, [id]);
      if (before.length === 0) return false;
      await this.exec(`DELETE FROM agents WHERE id = ?`, [id]);
      return true;
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
      // DuckDB-node binding for raw Buffer is brittle — wrap as Uint8Array.
      const blob = new Uint8Array(args.content);
      await this.exec(
        `INSERT OR REPLACE INTO media (id, type, mime_type, size, sha256, filename, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?::BLOB, ?)`,
        [args.id, args.type, args.mime_type, args.size, args.sha256, args.filename ?? null, blob, ts],
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
      const rows = await this.query<{
        id: string;
        type: string;
        mime_type: string;
        size: number;
        sha256: string;
        filename: string | null;
        created_at: string;
      }>(
        `SELECT id, type, mime_type, size, sha256, filename, created_at FROM media WHERE id = ?`,
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        type: row.type as MediaType,
        mime_type: row.mime_type,
        size: Number(row.size),
        sha256: row.sha256,
        ...(row.filename ? { filename: row.filename } : {}),
        created_at: row.created_at,
      };
    },
    getContent: async (id: string): Promise<Buffer | null> => {
      const rows = await this.query<{ content: string | Uint8Array }>(
        `SELECT content FROM media WHERE id = ?`,
        [id],
      );
      const row = rows[0];
      if (!row) return null;
      if (typeof row.content === "string") {
        // DuckDB JSON serialization may have base64-encoded the BLOB.
        return Buffer.from(row.content, "base64");
      }
      return Buffer.from(row.content);
    },
    delete: async (id: string): Promise<boolean> => {
      const before = await this.query<{ id: string }>(`SELECT id FROM media WHERE id = ?`, [id]);
      if (before.length === 0) return false;
      await this.exec(`DELETE FROM media WHERE id = ?`, [id]);
      return true;
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
      await this.exec(
        `INSERT OR REPLACE INTO feedback (message_id, rating, comment, rated_at, agent_version, failure_category, flagged_for_review)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          args.message_id,
          args.rating,
          args.comment ?? null,
          ts,
          args.agent_version ?? null,
          args.failure_category ?? null,
          args.flagged_for_review ?? null,
        ],
      );
      return {
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
    },
    get: async (message_id: MessageId): Promise<Feedback | null> => {
      const rows = await this.query<FeedbackRowDuck>(
        `SELECT * FROM feedback WHERE message_id = ?`,
        [message_id],
      );
      return rows[0] ? feedbackFromRow(rows[0]) : null;
    },
    delete: async (message_id: MessageId): Promise<boolean> => {
      const before = await this.query<{ message_id: string }>(
        `SELECT message_id FROM feedback WHERE message_id = ?`,
        [message_id],
      );
      if (before.length === 0) return false;
      await this.exec(`DELETE FROM feedback WHERE message_id = ?`, [message_id]);
      return true;
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
      const rows = await this.query<FeedbackRowDuck>(
        `SELECT f.* FROM feedback f ${where} ORDER BY f.rated_at ASC`,
        params,
      );
      return rows.map(feedbackFromRow);
    },
    sweepOlderThan: async (cutoffIso: string): Promise<number> => {
      const before = await this.query<{ message_id: string }>(
        `SELECT message_id FROM feedback WHERE rated_at < ?`,
        [cutoffIso],
      );
      await this.exec(`DELETE FROM feedback WHERE rated_at < ?`, [cutoffIso]);
      return before.length;
    },
  };

  // -------------------- annotations --------------------

  annotations = {
    set: async (args: { chat_id: ChatId; body: string }): Promise<Annotation> => {
      const ts = nowIso();
      await this.exec(
        `INSERT OR REPLACE INTO annotations (chat_id, body, updated_at) VALUES (?, ?, ?)`,
        [args.chat_id, args.body, ts],
      );
      return { chat_id: args.chat_id, body: args.body, updated_at: ts };
    },
    get: async (chat_id: ChatId): Promise<Annotation | null> => {
      const rows = await this.query<{ chat_id: string; body: string; updated_at: string }>(
        `SELECT * FROM annotations WHERE chat_id = ?`,
        [chat_id],
      );
      const row = rows[0];
      return row ? { chat_id: row.chat_id, body: row.body, updated_at: row.updated_at } : null;
    },
    delete: async (chat_id: ChatId): Promise<boolean> => {
      const before = await this.query<{ chat_id: string }>(
        `SELECT chat_id FROM annotations WHERE chat_id = ?`,
        [chat_id],
      );
      if (before.length === 0) return false;
      await this.exec(`DELETE FROM annotations WHERE chat_id = ?`, [chat_id]);
      return true;
    },
    sweepOlderThan: async (cutoffIso: string): Promise<number> => {
      const before = await this.query<{ chat_id: string }>(
        `SELECT chat_id FROM annotations WHERE updated_at < ?`,
        [cutoffIso],
      );
      await this.exec(`DELETE FROM annotations WHERE updated_at < ?`, [cutoffIso]);
      return before.length;
    },
  };
}

interface MessageRowDuck {
  id: string;
  chat_id: string;
  role: MessageRole;
  content: string;
  attachments_json: string | null;
  status: MessageStatus;
  error: string | null;
  created_at: string;
}

interface AgentRowDuck {
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

interface FeedbackRowDuck {
  message_id: string;
  rating: FeedbackRating;
  comment: string | null;
  rated_at: string;
  agent_version: string | null;
  failure_category: string | null;
  flagged_for_review: boolean | null;
}

function messageFromRow(row: MessageRowDuck): Message {
  const out: Message = {
    id: row.id,
    chat_id: row.chat_id,
    role: row.role,
    content: row.content,
    status: row.status,
    created_at: row.created_at,
  };
  if (row.attachments_json) {
    out.attachments = JSON.parse(row.attachments_json) as Attachment[];
  }
  if (row.error) out.error = row.error;
  return out;
}

function agentFromRow(row: AgentRowDuck): Agent {
  const out: Agent = {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    provider: row.provider as AgentProvider,
    model: row.model,
    context_window: Number(row.context_window),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (row.api_key !== null) out.api_key = row.api_key;
  if (row.base_url !== null) out.base_url = row.base_url;
  if (row.system_prompt !== null) out.system_prompt = row.system_prompt;
  return out;
}

function feedbackFromRow(row: FeedbackRowDuck): Feedback {
  const out: Feedback = {
    message_id: row.message_id,
    rating: row.rating,
    rated_at: row.rated_at,
  };
  if (row.comment !== null) out.comment = row.comment;
  if (row.agent_version !== null) out.agent_version = row.agent_version;
  if (row.failure_category !== null) out.failure_category = row.failure_category;
  if (row.flagged_for_review !== null) out.flagged_for_review = row.flagged_for_review;
  return out;
}
