import { Router } from "express";
import type { Core } from "../../core/core.js";
import { ApiError } from "../error-handler.js";
import type { StorageType } from "../../types/domain.js";

const VALID_STORAGE_TYPES: readonly StorageType[] = ["memory", "sqlite", "duckdb"];

export function workspacesRouter(core: Core): Router {
  const router = Router();

  router.get("/v1/workspaces", (_req, res, next) => {
    try {
      res.json({ data: core.registry.list(), active_id: core.activeWorkspace().id });
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/workspaces/active", (_req, res, next) => {
    try {
      res.json(core.activeWorkspace());
    } catch (err) {
      next(err);
    }
  });

  router.post("/v1/workspaces", (req, res, next) => {
    try {
      const body = (req.body ?? {}) as { nickname?: unknown; storage_type?: unknown };
      if (typeof body.nickname !== "string" || body.nickname.trim().length === 0) {
        throw new ApiError(400, 100, "`nickname` is required");
      }
      if (
        typeof body.storage_type !== "string" ||
        !(VALID_STORAGE_TYPES as readonly string[]).includes(body.storage_type)
      ) {
        throw new ApiError(
          400,
          100,
          `\`storage_type\` must be one of ${VALID_STORAGE_TYPES.join("|")}`,
        );
      }
      const created = core.registry.create({
        nickname: body.nickname,
        storage_type: body.storage_type as StorageType,
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/workspaces/:id", (req, res, next) => {
    try {
      const ws = core.registry.get(req.params.id!);
      if (!ws) throw new ApiError(404, 100, `Workspace ${req.params.id} not found`);
      res.json(ws);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/v1/workspaces/:id", (req, res, next) => {
    try {
      const body = (req.body ?? {}) as { nickname?: unknown };
      const patch: { nickname?: string } = {};
      if (body.nickname !== undefined) {
        if (typeof body.nickname !== "string" || body.nickname.trim().length === 0) {
          throw new ApiError(400, 100, "`nickname` must be a non-empty string");
        }
        patch.nickname = body.nickname;
      }
      const updated = core.registry.update(req.params.id!, patch);
      if (!updated) throw new ApiError(404, 100, `Workspace ${req.params.id} not found`);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/v1/workspaces/:id", async (req, res, next) => {
    try {
      if (req.query.confirm !== "true") {
        throw new ApiError(
          400,
          100,
          "Workspace deletion requires `?confirm=true`. This permanently removes the workspace and its data files.",
        );
      }
      const target = core.registry.get(req.params.id!);
      if (!target) throw new ApiError(404, 100, `Workspace ${req.params.id} not found`);

      const wasActive = target.id === core.activeWorkspace().id;
      if (wasActive) {
        // close the active adapter before deleting its file
        await core.stop().catch(() => undefined);
      }
      const { removed, nextActive } = core.registry.delete(req.params.id!);
      if (!removed) throw new ApiError(404, 100, `Workspace ${req.params.id} not found`);

      // re-open the (possibly new) active workspace
      await core.activateWorkspace(nextActive.id).catch(async () => {
        // fallback: if activate failed, manually reload
        await core.reloadActiveFromRegistry();
      });
      res.json({ removed_id: req.params.id, active: core.activeWorkspace() });
    } catch (err) {
      next(err);
    }
  });

  router.post("/v1/workspaces/:id/activate", async (req, res, next) => {
    try {
      const ws = await core.activateWorkspace(req.params.id!);
      res.json(ws);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "ZZ_WORKSPACE_NOT_FOUND") {
        next(new ApiError(404, 100, e.message, "ZZ_WORKSPACE_NOT_FOUND"));
        return;
      }
      if (e.code === "ZZ_WORKSPACE_BUSY") {
        next(new ApiError(409, 1000006, e.message, "ZZ_WORKSPACE_BUSY"));
        return;
      }
      next(err);
    }
  });

  return router;
}
