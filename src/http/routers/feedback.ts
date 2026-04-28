import { Router } from "express";
import type { Core } from "../../core/core.js";
import type { FeedbackExportItem, FeedbackRating } from "../../types/feedback.js";
import { ApiError } from "../error-handler.js";

export function feedbackRouter(core: Core): Router {
  const router = Router();

  router.get("/v1/messages/:messageId/feedback", async (req, res, next) => {
    try {
      const fb = await core.storage.feedback.get(req.params.messageId!);
      if (!fb) throw new ApiError(404, 100, `No feedback recorded for ${req.params.messageId}`);
      res.json(fb);
    } catch (err) {
      next(err);
    }
  });

  router.post("/v1/messages/:messageId/feedback", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as {
        rating?: unknown;
        comment?: unknown;
        agent_version?: unknown;
        failure_category?: unknown;
        flagged_for_review?: unknown;
      };
      if (body.rating === null) {
        throw new ApiError(
          400,
          100,
          "Use DELETE /feedback to clear a rating; `rating: null` is rejected.",
        );
      }
      if (body.rating !== "up" && body.rating !== "down") {
        throw new ApiError(400, 100, "`rating` must be `up` or `down`");
      }
      const message = await core.storage.messages.get(req.params.messageId!);
      if (!message) throw new ApiError(404, 100, `Message ${req.params.messageId} not found`);
      if (message.role !== "assistant") {
        throw new ApiError(
          400,
          1000004,
          "Only assistant messages are rateable. User messages are inputs, not outputs.",
          "ZZ_NOT_RATEABLE",
        );
      }
      if (body.comment !== undefined && typeof body.comment !== "string") {
        throw new ApiError(400, 100, "`comment` must be a string");
      }
      if (typeof body.comment === "string" && body.comment.length > 280) {
        throw new ApiError(400, 100, "`comment` exceeds 280 chars");
      }
      const fb = await core.storage.feedback.set({
        message_id: req.params.messageId!,
        rating: body.rating,
        ...(typeof body.comment === "string" ? { comment: body.comment } : {}),
        ...(typeof body.agent_version === "string" ? { agent_version: body.agent_version } : {}),
        ...(typeof body.failure_category === "string"
          ? { failure_category: body.failure_category }
          : {}),
        ...(typeof body.flagged_for_review === "boolean"
          ? { flagged_for_review: body.flagged_for_review }
          : {}),
      });
      res.json(fb);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/v1/messages/:messageId/feedback", async (req, res, next) => {
    try {
      await core.storage.feedback.delete(req.params.messageId!);
      res.json({ removed: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/chats/:chatId/feedback", async (req, res, next) => {
    try {
      const messages = await core.storage.messages.listByChat(req.params.chatId!);
      const data = [];
      for (const msg of messages) {
        const fb = await core.storage.feedback.get(msg.id);
        if (fb) data.push(fb);
      }
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/chats/:chatId/annotation", async (req, res, next) => {
    try {
      const ann = await core.storage.annotations.get(req.params.chatId!);
      if (ann) {
        res.json(ann);
      } else {
        res.json({ chat_id: req.params.chatId!, body: "", updated_at: null });
      }
    } catch (err) {
      next(err);
    }
  });

  router.put("/v1/chats/:chatId/annotation", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as { body?: unknown };
      if (typeof body.body !== "string") {
        throw new ApiError(400, 100, "`body` is required and must be a string");
      }
      if (body.body.length > 16384) {
        throw new ApiError(400, 100, "`body` exceeds 16 KB");
      }
      const ann = await core.storage.annotations.set({
        chat_id: req.params.chatId!,
        body: body.body,
      });
      res.json(ann);
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/feedback/export", async (req, res, next) => {
    try {
      const filter: { since?: string; until?: string; rating?: FeedbackRating; chat_id?: string } =
        {};
      if (typeof req.query.since === "string") filter.since = req.query.since;
      if (typeof req.query.until === "string") filter.until = req.query.until;
      if (req.query.rating === "up" || req.query.rating === "down") filter.rating = req.query.rating;
      if (typeof req.query.chat_id === "string") filter.chat_id = req.query.chat_id;

      res.setHeader("Content-Type", "application/x-ndjson");
      const items = await core.storage.feedback.list(filter);
      const workspaceId = core.activeWorkspace().id;
      for (const fb of items) {
        const message = await core.storage.messages.get(fb.message_id);
        if (!message) continue;
        const chat = await core.storage.chats.get(message.chat_id);
        if (!chat) continue;
        const allMsgs = await core.storage.messages.listByChat(message.chat_id);
        const idx = allMsgs.findIndex((m) => m.id === message.id);
        const prompt =
          idx > 0 ? allMsgs.slice(0, idx).reverse().find((m) => m.role === "user") : undefined;
        const annotation = await core.storage.annotations.get(message.chat_id);
        const agent = await core.storage.agents.get(chat.agent_id);
        const agentVersion =
          fb.agent_version ?? (agent ? `${agent.provider}:${agent.model}` : undefined);

        const item: FeedbackExportItem = {
          schema_version: 1,
          workspace_id: workspaceId,
          chat_id: message.chat_id,
          theme: chat.theme,
          agent_message: {
            id: message.id,
            created_at: message.created_at,
            content: message.content,
          },
          prompt_message: prompt
            ? {
                id: prompt.id,
                role: "user",
                created_at: prompt.created_at,
                content: prompt.content,
              }
            : null,
          rating: fb.rating,
          ...(fb.comment !== undefined ? { comment: fb.comment } : {}),
          rated_at: fb.rated_at,
          annotation: annotation?.body ?? null,
          ...(agentVersion ? { agent_version: agentVersion } : {}),
          ...(fb.failure_category ? { failure_category: fb.failure_category } : {}),
          ...(fb.flagged_for_review !== undefined
            ? { flagged_for_review: fb.flagged_for_review }
            : {}),
        };
        res.write(JSON.stringify(item) + "\n");
      }
      res.end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
