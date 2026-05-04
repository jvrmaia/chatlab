import { Router } from "express";
import multer from "multer";
import { createHash } from "node:crypto";
import type { Core } from "../../core/core.js";
import type { MediaType } from "../../types/media.js";
import { ALLOWED_MIME_BY_TYPE, DEFAULT_MAX_BYTES } from "../../types/media.js";
import { newId } from "../../lib/id.js";
import { ApiError } from "../error-handler.js";

export function mediaRouter(core: Core): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: DEFAULT_MAX_BYTES },
  });

  router.post("/v1/media", upload.single("file"), async (req, res, next) => {
    try {
      const file = req.file;
      if (!file) throw new ApiError(400, 100, "Multipart `file` field is required");
      const declaredType = (req.body as { type?: string }).type;
      if (
        !declaredType ||
        !["image", "audio", "video", "document", "sticker"].includes(declaredType)
      ) {
        throw new ApiError(400, 100, "`type` must be one of image|audio|video|document|sticker");
      }
      const allowed = ALLOWED_MIME_BY_TYPE[declaredType as MediaType];
      if (!allowed.test(file.mimetype)) {
        throw new ApiError(
          415,
          100,
          `Mime type "${file.mimetype}" does not match declared type "${declaredType}"`,
        );
      }
      const sha256 = createHash("sha256").update(file.buffer).digest("hex");
      const id = newId();
      const meta = await core.storage.media.put({
        id,
        type: declaredType as MediaType,
        mime_type: file.mimetype,
        size: file.size,
        sha256,
        ...(file.originalname ? { filename: file.originalname } : {}),
        content: file.buffer,
      });
      res.status(201).json({ id: meta.id });
    } catch (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        next(new ApiError(413, 100, `File exceeds the ${DEFAULT_MAX_BYTES}-byte limit`));
        return;
      }
      next(err);
    }
  });

  router.get("/v1/media/:mediaId", async (req, res, next) => {
    try {
      const meta = await core.storage.media.get(req.params.mediaId!);
      if (!meta) throw new ApiError(404, 100, `Media ${req.params.mediaId} not found`);
      res.json({
        ...meta,
        download_url: `${req.protocol}://${req.get("host")}/v1/media/${meta.id}/download`,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/media/:mediaId/download", async (req, res, next) => {
    try {
      const meta = await core.storage.media.get(req.params.mediaId!);
      if (!meta) throw new ApiError(404, 100, `Media ${req.params.mediaId} not found`);
      const content = await core.storage.media.getContent(req.params.mediaId!);
      if (!content) {
        throw new ApiError(404, 100, `Media content for ${req.params.mediaId} not found`);
      }
      res.setHeader("Content-Type", meta.mime_type);
      res.setHeader("Content-Length", meta.size.toString());
      const disposition = meta.filename
        ? `attachment; filename="${meta.filename.replace(/"/g, '\\"')}"`
        : "attachment";
      res.setHeader("Content-Disposition", disposition);
      res.send(content);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/v1/media/:mediaId", async (req, res, next) => {
    try {
      const ok = await core.storage.media.delete(req.params.mediaId!);
      if (!ok) throw new ApiError(404, 100, `Media ${req.params.mediaId} not found`);
      res.json({ removed: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
