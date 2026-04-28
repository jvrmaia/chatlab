import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export interface ResolvedConfig {
  host: string;
  port: number;
  requireToken?: string;
  retentionDays: number;
  logLevel: "silent" | "error" | "warn" | "info" | "debug";
  /** Override `$CHATLAB_HOME`. Default: `~/.chatlab`. */
  home?: string;
  /** Pre-selected workspace id. Overrides registry's active. */
  workspaceId?: string;
  uiDistDir: string;
}

interface ResolveArgs {
  argv?: string[];
  env?: NodeJS.ProcessEnv;
}

/**
 * Resolves runtime config from CLI flags + `CHATLAB_*` env vars, with bind-
 * safety enforced before returning.
 */
export function resolveConfig({ argv = [], env = process.env }: ResolveArgs = {}): ResolvedConfig {
  const flags = parseFlags(argv);

  const host = flags["host"] ?? env["CHATLAB_HOST"] ?? "127.0.0.1";
  const portRaw = flags["port"] ?? env["CHATLAB_PORT"] ?? "4480";
  const port = Number(portRaw);
  const requireToken = flags["require-token"] ?? env["CHATLAB_REQUIRE_TOKEN"];
  const retentionRaw = env["CHATLAB_FEEDBACK_RETENTION_DAYS"] ?? "90";
  const logLevel =
    (flags["log-level"] ?? env["CHATLAB_LOG_LEVEL"] ?? "info") as ResolvedConfig["logLevel"];
  const home = flags["home"] ?? env["CHATLAB_HOME"];
  const workspaceId = flags["workspace"] ?? env["CHATLAB_WORKSPACE_ID"];

  const cfg: ResolvedConfig = {
    host,
    port,
    retentionDays: Number(retentionRaw),
    logLevel,
    uiDistDir: resolveUiDistDir(),
  };
  if (requireToken !== undefined) cfg.requireToken = requireToken;
  if (home !== undefined) cfg.home = home;
  if (workspaceId !== undefined) cfg.workspaceId = workspaceId;

  enforceBindSafety(cfg);
  return cfg;
}

function parseFlags(argv: string[]): Record<string, string | undefined> {
  const flags: Record<string, string | undefined> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq >= 0) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          flags[arg.slice(2)] = next;
          i++;
        } else {
          flags[arg.slice(2)] = "true";
        }
      }
    }
  }
  return flags;
}

function isLocalHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function enforceBindSafety(cfg: ResolvedConfig): void {
  if (!isLocalHost(cfg.host) && !cfg.requireToken) {
    process.stderr.write(
      `chatlab: refusing to bind to ${cfg.host} without CHATLAB_REQUIRE_TOKEN.\n` +
        `  Either set CHATLAB_HOST=127.0.0.1 (default) or export\n` +
        `  CHATLAB_REQUIRE_TOKEN=<your-shared-secret>.\n`,
    );
    process.exit(78);
  }
}

function resolveUiDistDir(): string {
  // dist/server/config.js -> ../../dist/ui
  // src/config.ts (dev)   -> ../dist/ui
  const here = dirname(fileURLToPath(import.meta.url));
  if (here.includes(`${"dist/"}server`)) return resolve(here, "..", "ui");
  return resolve(here, "..", "dist", "ui");
}
