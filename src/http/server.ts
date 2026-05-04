import express, { Router, type Application } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Core } from "../core/core.js";
import { authMiddleware } from "./auth.js";
import { errorHandler, requestIdMiddleware } from "./error-handler.js";
import { agentsRouter } from "./routers/agents.js";
import { chatsRouter } from "./routers/chats.js";
import { feedbackRouter } from "./routers/feedback.js";
import { mediaRouter } from "./routers/media.js";
import { mountHealth, setReady } from "./routers/healthz.js";
import { workspacesRouter } from "./routers/workspaces.js";

interface ServerConfig {
  core: Core;
  requireToken?: string;
  uiDistDir?: string;
  agentFetcher?: typeof fetch;
}

export function createApp(cfg: ServerConfig): Application {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use(requestIdMiddleware);

  mountHealth(app);

  // Browsers auto-fetch /favicon.ico — answer 204 before auth so it doesn't
  // bounce as 401. We don't ship a real icon yet.
  app.get("/favicon.ico", (_req, res) => {
    res.status(204).end();
  });

  // Static UI is served BEFORE the authenticated API surface so /ui never
  // requires a token.
  if (cfg.uiDistDir && existsSync(cfg.uiDistDir)) {
    app.use("/ui", express.static(cfg.uiDistDir, { fallthrough: true }));
    app.get("/ui", (_req, res) => res.redirect(301, "/ui/"));
    app.get("/ui/*path", (_req, res) => {
      res.sendFile(join(cfg.uiDistDir!, "index.html"));
    });
  } else {
    app.get(["/ui", "/ui/*path"], (_req, res) => {
      res
        .status(503)
        .type("text/plain")
        .send(
          "Web UI not built. Run `npm run build:ui` (or use `npm run dev:ui` during development).\n",
        );
    });
  }

  const api = Router();
  api.use(authMiddleware(cfg.requireToken ? { requireToken: cfg.requireToken } : {}));
  api.use(workspacesRouter(cfg.core));
  api.use(chatsRouter(cfg.core));
  api.use(agentsRouter(cfg.core, cfg.agentFetcher ? { agentFetcher: cfg.agentFetcher } : {}));
  api.use(feedbackRouter(cfg.core));
  api.use(mediaRouter(cfg.core));
  app.use(api);

  app.use(errorHandler);

  setReady(true);
  return app;
}
