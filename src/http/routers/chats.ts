import { Router } from "express";
import type { Core } from "../../core/core.js";
import { effectiveBaseUrl, effectiveModel, providerFor } from "../../agents/factory.js";
import { LlmError, type LlmUsage } from "../../agents/provider.js";
import { ApiError } from "../error-handler.js";
import type { Attachment } from "../../types/domain.js";
import { buildLlmMessages } from "../../agents/executor.js";

const MAX_THEME = 280;
const MAX_CONTENT = 16 * 1024;

export function chatsRouter(core: Core, opts: { fetcher?: typeof fetch } = {}): Router {
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

      const wantsStream = (req.headers["accept"] ?? "").includes("text/event-stream");

      if (wantsStream) {
        // SSE path — handle LLM call inline; AgentRunner is bypassed (no event emitted).
        // res.on("close") fires when the client disconnects mid-stream; req.on("close")
        // fires earlier (when the request body is consumed) and is less reliable here.
        const controller = new AbortController();
        res.on("close", () => controller.abort());

        const userMsg = await core.storage.messages.append({
          chat_id: req.params.id!,
          role: "user",
          content: body.content,
          ...(attachments.length > 0 ? { attachments } : {}),
          status: "ok",
        });

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();

        const sseWrite = (payload: unknown): void => {
          res.write(`data: ${JSON.stringify(payload)}\n\n`);
        };

        sseWrite({ type: "user_message", message: userMsg });

        const agent = await core.storage.agents.get(chat.agent_id);
        if (!agent) {
          sseWrite({ type: "error", error: "ZZ_AGENT_NOT_FOUND: agent no longer exists" });
          res.end();
          return;
        }

        core.beginInflight();
        let fullContent = "";
        let streamUsage: LlmUsage | undefined;
        const startMs = Date.now();
        try {
          const messages = await buildLlmMessages(core.storage.messages, agent, chat.theme, req.params.id!);
          const provider = providerFor(agent.provider);
          for await (const chunk of provider.chatStream({
            messages,
            model: effectiveModel(agent),
            baseUrl: effectiveBaseUrl(agent),
            ...(agent.api_key ? { apiKey: agent.api_key } : {}),
            temperature: agent.temperature ?? 0.7,
            signal: controller.signal,
            ...(opts.fetcher ? { fetcher: opts.fetcher } : {}),
            onUsage: (u) => { streamUsage = u; },
          })) {
            fullContent += chunk;
            sseWrite({ type: "delta", content: chunk });
          }
          const response_time_ms = Date.now() - startMs;
          const assistantMsg = await core.storage.messages.append({
            chat_id: req.params.id!,
            role: "assistant",
            content: fullContent.trim() || "(empty response)",
            status: "ok",
            agent_version: `${agent.provider}/${effectiveModel(agent)}`,
            ...(streamUsage ? { prompt_tokens: streamUsage.prompt_tokens, completion_tokens: streamUsage.completion_tokens } : {}),
            response_time_ms,
          });
          core.emitEvent({ type: "chat.assistant-replied", message: assistantMsg });
          sseWrite({ type: "done", message: assistantMsg });
        } catch (err) {
          const subcode = err instanceof LlmError ? err.subcode : "ZZ_AGENT_PROVIDER_ERROR";
          const reason = err instanceof Error ? `${subcode}: ${err.message}` : `${subcode}: unknown`;
          try {
            const failedMsg = await core.storage.messages.append({
              chat_id: req.params.id!,
              role: "assistant",
              content: "",
              status: "failed",
              error: reason,
            });
            core.emitEvent({ type: "chat.assistant-replied", message: failedMsg });
          } catch { /* best-effort */ }
          sseWrite({ type: "error", error: reason });
        } finally {
          core.endInflight();
          res.end();
        }
        return;
      }

      // Non-streaming path (unchanged).
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

