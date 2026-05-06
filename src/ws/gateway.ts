import { timingSafeEqual } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { Core, CoreEvent } from "../core/core.js";

export class WsGateway {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private unsubscribe: (() => void) | null = null;

  constructor(server: HttpServer, private readonly core: Core, requireToken?: string) {
    this.wss = new WebSocketServer({
      server,
      path: "/ws",
      verifyClient: requireToken
        ? ({ req }, done) => {
            // Browsers can't set Authorization headers on WebSocket connections,
            // so accept the token from either the header (ws/curl) or the
            // ?token= query parameter (browser UI).
            const header = (req.headers["authorization"] as string | undefined) ?? "";
            const fromHeader = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
            const qs = new URL(req.url ?? "/", "http://x").searchParams;
            const token = fromHeader || (qs.get("token") ?? "");
            const expected = Buffer.from(requireToken);
            const provided = Buffer.from(token);
            const maxLen = Math.max(expected.length, provided.length);
            const a = Buffer.concat([expected, Buffer.alloc(maxLen - expected.length)]);
            const b = Buffer.concat([provided, Buffer.alloc(maxLen - provided.length)]);
            const ok = provided.length === expected.length && timingSafeEqual(a, b);
            done(ok, 401, "Unauthorized");
          }
        : undefined,
    });
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      ws.on("close", () => this.clients.delete(ws));
      ws.on("message", (raw) => this.onIncoming(ws, raw.toString()));
      this.send(ws, {
        type: "hello",
        server: "chatlab",
        active_workspace: core.activeWorkspace(),
      });
    });
    const listener = (event: CoreEvent) => this.broadcast(event);
    core.on("core-event", listener);
    this.unsubscribe = () => core.off("core-event", listener);
  }

  close(): void {
    this.unsubscribe?.();
    for (const ws of this.clients) ws.close();
    this.wss.close();
  }

  private send(ws: WebSocket, payload: unknown): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // socket closed; drop silently
    }
  }

  private broadcast(payload: unknown): void {
    const data = JSON.stringify(payload);
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) ws.send(data);
    }
  }

  private onIncoming(ws: WebSocket, raw: string): void {
    let msg: { type?: string; [k: string]: unknown };
    try {
      msg = JSON.parse(raw);
    } catch {
      this.send(ws, { type: "error", message: "invalid json" });
      return;
    }
    if (msg.type === "ping") {
      this.send(ws, { type: "pong" });
    }
  }
}
