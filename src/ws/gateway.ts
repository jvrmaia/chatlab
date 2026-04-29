import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { Core, CoreEvent } from "../core/core.js";

export class WsGateway {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private unsubscribe: (() => void) | null = null;

  constructor(server: HttpServer, private readonly core: Core) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
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
