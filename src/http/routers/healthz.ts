import type { Application } from "express";

const startedAt = Date.now();
let ready = false;

export function setReady(value: boolean): void {
  ready = value;
}

export function mountHealth(app: Application): void {
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", uptime_seconds: Math.floor((Date.now() - startedAt) / 1000) });
  });
  app.get("/readyz", (_req, res) => {
    if (ready) {
      res.json({ status: "ok" });
    } else {
      res.status(503).json({ status: "starting" });
    }
  });
}
