/**
 * Feedback (per-message rating) and Annotation (per-chat free-text note).
 * Lifted from v1.x with the surrounding shape simplified.
 */

import type { ChatId, MessageId, WorkspaceId } from "./domain.js";

export type FeedbackRating = "up" | "down";

export interface Feedback {
  message_id: MessageId;
  rating: FeedbackRating;
  comment?: string;
  rated_at: string;
  agent_version?: string;
  failure_category?: string;
  flagged_for_review?: boolean;
}

export interface Annotation {
  chat_id: ChatId;
  body: string;
  updated_at: string;
}

/**
 * One line of `GET /v1/feedback/export` JSONL stream. The integer
 * `schema_version` is the version-pin downstream pipelines branch on; it is
 * decoupled from the package version. v1.0 publishes `schema_version: 1`.
 */
export interface FeedbackExportItem {
  schema_version: 1;
  workspace_id: WorkspaceId;
  chat_id: ChatId;
  theme: string;
  agent_message: {
    id: MessageId;
    created_at: string;
    content: string;
  };
  prompt_message: {
    id: MessageId;
    role: "user";
    created_at: string;
    content: string;
  } | null;
  rating: FeedbackRating;
  comment?: string;
  rated_at: string;
  annotation: string | null;
  agent_version?: string;
  failure_category?: string;
  flagged_for_review?: boolean;
}
