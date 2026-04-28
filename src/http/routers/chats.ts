import { Router } from "express";
import type { Core } from "../../core/core.js";
import { ApiError } from "../error-handler.js";
import type { Attachment } from "../../types/domain.js";

const MAX_THEME = 280;
const MAX_CONTENT = 16 * 1024;

export function chatsRouter(core: Core): Router {
  const router = Router();

  router.get("/v1/chats", async (_req, res, next) => {
    try {
      const data = await core.storage.chats.list();
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post("/v1/chats", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as { agent_id?: unknown; theme?: unknown };
      if (typeof body.agent_id !== "string" || body.agent_id.length === 0) {
        throw new ApiError(400, 100, "`agent_id` is required");
      }
      if (typeof body.theme !== "string" || body.theme.length === 0) {
        throw new ApiError(400, 100, "`theme` is required");
      }
      if (body.theme.length > MAX_THEME) {
        throw new ApiError(400, 100, `\`theme\` exceeds ${MAX_THEME} chars`);
      }
      const agent = await core.storage.agents.get(body.agent_id);
      if (!agent) {
        throw new ApiError(404, 100, `Agent ${body.agent_id} not found in active workspace`);
      }
      const chat = await core.storage.chats.create({
        workspace_id: core.activeWorkspace().id,
        agent_id: body.agent_id,
        theme: body.theme,
      });
      core.emitEvent({ type: "chat.created", chat });
      res.status(201).json(chat);
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/chats/:id", async (req, res, next) => {
    try {
      const chat = await core.storage.chats.get(req.params.id!);
      if (!chat) throw new ApiError(404, 100, `Chat ${req.params.id} not found`);
      res.json(chat);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/v1/chats/:id", async (req, res, next) => {
    try {
      const ok = await core.storage.chats.delete(req.params.id!);
      if (!ok) throw new ApiError(404, 100, `Chat ${req.params.id} not found`);
      core.emitEvent({ type: "chat.deleted", chat_id: req.params.id! });
      res.json({ removed: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/chats/:id/messages", async (req, res, next) => {
    try {
      const chat = await core.storage.chats.get(req.params.id!);
      if (!chat) throw new ApiError(404, 100, `Chat ${req.params.id} not found`);
      const data = await core.storage.messages.listByChat(req.params.id!);
      res.json({ data });
    } catch (err) {
      next(err);
    }
  });

  router.post("/v1/chats/:id/messages", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as {
        content?: unknown;
        attachments?: unknown;
      };
      if (typeof body.content !== "string") {
        throw new ApiError(400, 100, "`content` is required and must be a string");
      }
      if (body.content.length > MAX_CONTENT) {
        throw new ApiError(400, 100, `\`content\` exceeds ${MAX_CONTENT} bytes`);
      }
      const chat = await core.storage.chats.get(req.params.id!);
      if (!chat) throw new ApiError(404, 100, `Chat ${req.params.id} not found`);

      const attachments: Attachment[] = [];
      if (Array.isArray(body.attachments)) {
        for (const raw of body.attachments) {
          if (!raw || typeof raw !== "object") {
            throw new ApiError(400, 100, "`attachments[]` must be an array of objects");
          }
          const a = raw as Partial<Attachment>;
          if (typeof a.media_id !== "string" || a.media_id.length === 0) {
            throw new ApiError(400, 100, "Each attachment requires `media_id`");
          }
          const meta = await core.storage.media.get(a.media_id);
          if (!meta) {
            throw new ApiError(404, 100, `Media ${a.media_id} not found in active workspace`);
          }
          attachments.push({
            media_id: a.media_id,
            mime_type: meta.mime_type,
            ...(meta.filename ? { filename: meta.filename } : {}),
          });
        }
      }

      const persisted = await core.storage.messages.append({
        chat_id: req.params.id!,
        role: "user",
        content: body.content,
        ...(attachments.length > 0 ? { attachments } : {}),
        status: "ok",
      });
      core.emitEvent({ type: "chat.user-message-appended", message: persisted });
      res.status(201).json(persisted);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
