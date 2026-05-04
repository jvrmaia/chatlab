import { createServer, type Server as HttpServer } from "node:http";
import { resolveConfig, type ResolvedConfig } from "./config.js";
import { Core } from "./core/core.js";
import { createApp } from "./http/server.js";
import { WsGateway } from "./ws/gateway.js";
import { AgentRunner } from "./agents/runner.js";
import { WorkspaceRegistry } from "./workspaces/registry.js";
import { loadMasterKey } from "./lib/master-key.js";
import { createLogger, silentLogger } from "./lib/logger.js";

/**
 * A running chatlab instance returned by {@link startChatlab}. Stop it with
 * {@link RunningChatlab.stop} when done.
 *
 * @public
 */
export interface RunningChatlab {
  url: string;
  core: Core;
  config: ResolvedConfig;
  stop(): Promise<void>;
}

/**
 * Boots a chatlab instance: registry → active workspace → adapter → http +
 * ws. Designed for the CLI and for in-process integration tests.
 *
 * @public
 */
export async function startChatlab(
  overrides: Partial<{
    argv: string[];
    env: NodeJS.ProcessEnv;
    port: number;
    host: string;
    home: string;
    workspaceId: string;
    /**
     * Inject a custom `fetch` for the agent runner + agent probe — useful in
     * tests that want to stub provider responses.
     */
    agentFetcher: typeof fetch;
  }> = {},
): Promise<RunningChatlab> {
  const env = overrides.env ?? process.env;
  const argv = overrides.argv ?? [];
  const cfg = resolveConfig({ argv, env });
  if (overrides.port !== undefined) cfg.port = overrides.port;
  if (overrides.host !== undefined) cfg.host = overrides.host;
  if (overrides.home !== undefined) cfg.home = overrides.home;
  if (overrides.workspaceId !== undefined) cfg.workspaceId = overrides.workspaceId;

  const registry = new WorkspaceRegistry(cfg.home ? { home: cfg.home } : {});
  const masterKey = loadMasterKey(registry.homeDirectory(), env);
  const logger =
    cfg.logLevel === "silent" ? silentLogger() : createLogger({ level: cfg.logLevel });
  const core = await Core.start({ registry, masterKey, logger });

  // Apply CLI/env override of which workspace is active, if it differs.
  if (cfg.workspaceId && cfg.workspaceId !== core.activeWorkspace().id) {
    await core.activateWorkspace(cfg.workspaceId);
  }

  const agentRunner = new AgentRunner(
    core,
    overrides.agentFetcher ? { fetcher: overrides.agentFetcher } : {},
  );
  agentRunner.start();

  const stopRetention = core.startRetentionSweep(cfg.retentionDays);

  const app = createApp({
    core,
    ...(cfg.requireToken ? { requireToken: cfg.requireToken } : {}),
    uiDistDir: cfg.uiDistDir,
    ...(overrides.agentFetcher ? { agentFetcher: overrides.agentFetcher } : {}),
  });

  const httpServer: HttpServer = createServer(app);
  const ws = new WsGateway(httpServer, core, cfg.requireToken);

  await new Promise<void>((resolve) => {
    httpServer.listen(cfg.port, cfg.host, () => resolve());
  });
  const address = httpServer.address();
  const actualPort = typeof address === "object" && address ? address.port : cfg.port;
  const url = `http://${cfg.host}:${actualPort}`;

  if (cfg.logLevel !== "silent") {
    const active = core.activeWorkspace();
    const agents = await core.storage.agents.list();
    const cloudAgents = agents.filter((a) => a.provider !== "ollama");
    const lines = [
      `chatlab listening on ${url}`,
      `  workspace: ${active.nickname} (${active.storage_type})`,
      `  data dir : ${registry.dataDirectory()}`,
      `  auth     : ${cfg.requireToken ? "enforced (CHATLAB_REQUIRE_TOKEN set)" : "permissive (any non-empty bearer)"}`,
      `  retention: ${cfg.retentionDays === 0 ? "DISABLED — never sweeps" : `${cfg.retentionDays} days`}`,
      `  ui       : ${url}/ui`,
    ];
    if (cloudAgents.length > 0) {
      const providers = Array.from(new Set(cloudAgents.map((a) => a.provider))).join(", ");
      lines.push(
        ``,
        `  [!] cloud provider${cloudAgents.length > 1 ? "s" : ""} configured (${providers}) —`,
        `      conversations leave your machine. Don't send real PII without redaction.`,
      );
    }
    process.stdout.write(lines.join("\n") + "\n");
  }

  return {
    url,
    core,
    config: cfg,
    async stop() {
      stopRetention();
      agentRunner.stop();
      ws.close();
      await new Promise<void>((resolve, reject) =>
        httpServer.close((err) => (err ? reject(err) : resolve())),
      );
      await core.stop();
    },
  };
}

/**
 * The {@link Core} class — process-global state owner with a swappable
 * storage adapter. Exposed for in-process integration tests.
 *
 * @public
 */
export type { Core } from "./core/core.js";

/**
 * The fully-resolved config produced by `resolveConfig` from env + flags +
 * overrides. Returned on {@link RunningChatlab.config}.
 *
 * @public
 */
export type { ResolvedConfig } from "./config.js";

/**
 * The {@link StorageAdapter} interface. Custom storage backends implement it.
 *
 * @public
 */
export type { StorageAdapter } from "./storage/adapter.js";

/** Domain types used in the storage and event surfaces. @public */
export type {
  Workspace,
  Chat,
  Message,
  Attachment,
  StorageType,
  MessageRole,
  MessageStatus,
} from "./types/domain.js";

/** Agent profile types. @public */
export type { Agent, AgentCreate, AgentPatch, AgentProvider } from "./types/agent.js";
export { PROVIDER_DEFAULTS, AGENT_PROVIDERS } from "./types/agent.js";

/** Feedback + annotation + export types. @public */
export type { Feedback, FeedbackRating, Annotation, FeedbackExportItem } from "./types/feedback.js";

/** Media types. @public */
export { ALLOWED_MIME_BY_TYPE, DEFAULT_MAX_BYTES } from "./types/media.js";
export type { MediaRecord, MediaType } from "./types/media.js";

/** Workspace registry. @public */
export { WorkspaceRegistry } from "./workspaces/registry.js";
