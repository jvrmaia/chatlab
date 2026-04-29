#!/usr/bin/env node
import { startChatlab } from "./index.js";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--version") || argv.includes("-v")) {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const candidates = [
      resolve(fileURLToPath(import.meta.url), "..", "..", "..", "package.json"),
      resolve(fileURLToPath(import.meta.url), "..", "..", "package.json"),
    ];
    let version = "unknown";
    for (const p of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(p, "utf8")) as { version: string };
        version = pkg.version;
        break;
      } catch {
        // try next candidate
      }
    }
    process.stdout.write(`chatlab ${version}\n`);
    return;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      `Usage: chatlab [flags]\n\n` +
        `  --port <number>           default 4480 (or CHATLAB_PORT)\n` +
        `  --host <string>           default 127.0.0.1 (or CHATLAB_HOST)\n` +
        `  --home <path>             registry + data dir; default ~/.chatlab (or CHATLAB_HOME)\n` +
        `  --workspace <id>          activate a specific workspace at boot (or CHATLAB_WORKSPACE_ID)\n` +
        `  --require-token <token>   enforce a specific bearer (or CHATLAB_REQUIRE_TOKEN)\n` +
        `  --log-level <level>       silent|error|warn|info|debug (or CHATLAB_LOG_LEVEL)\n` +
        `\nDocs: https://github.com/jvrmaia/chatlab\n`,
    );
    return;
  }

  const running = await startChatlab({ argv });
  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`\nReceived ${signal}, stopping...\n`);
    try {
      await running.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
