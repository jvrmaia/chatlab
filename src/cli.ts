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
      `Usage: chatlab [command] [flags]\n\n` +
        `Commands:\n` +
        `  (none)     Start the chatlab server (default)\n` +
        `  eval       Run the golden-set eval loop\n\n` +
        `Server flags:\n` +
        `  --port <number>           default 4480 (or CHATLAB_PORT)\n` +
        `  --host <string>           default 127.0.0.1 (or CHATLAB_HOST)\n` +
        `  --home <path>             registry + data dir; default ~/.chatlab (or CHATLAB_HOME)\n` +
        `  --workspace <id>          activate a specific workspace at boot (or CHATLAB_WORKSPACE_ID)\n` +
        `  --require-token <token>   enforce a specific bearer (or CHATLAB_REQUIRE_TOKEN)\n` +
        `  --log-level <level>       silent|error|warn|info|debug (or CHATLAB_LOG_LEVEL)\n\n` +
        `Eval flags:\n` +
        `  --agent <id>              agent ID to run prompts through (required)\n` +
        `  --input <path>            golden set YAML (default <home>/eval/golden.yaml)\n` +
        `  --baseline <path>         previous report for diff generation\n` +
        `  --out <path>              output directory (default <home>/eval/<agent>/)\n` +
        `  --format markdown|json    report format (default markdown)\n` +
        `\nDocs: https://github.com/jvrmaia/chatlab\n`,
    );
    return;
  }

  if (argv[0] === "eval") {
    await runEvalCommand(argv.slice(1));
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

async function runEvalCommand(argv: string[]): Promise<void> {
  const { mkdirSync, readFileSync, writeFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { homedir } = await import("node:os");
  const { loadGoldenSet } = await import("./eval/loader.js");
  const { runEval } = await import("./eval/runner.js");
  const { buildMarkdownReport, buildJsonReport, parseBaselineMap, summarize } = await import(
    "./eval/reporter.js"
  );

  function flag(name: string): string | undefined {
    const idx = argv.indexOf(name);
    return idx >= 0 ? argv[idx + 1] : undefined;
  }

  const agentId = flag("--agent");
  if (!agentId) {
    process.stderr.write("eval: --agent <id> is required\n");
    process.exit(1);
  }

  const homeDir = flag("--home") ?? process.env["CHATLAB_HOME"] ?? join(homedir(), ".chatlab");
  const inputPath = flag("--input") ?? join(homeDir, "eval", "golden.yaml");
  const format = (flag("--format") ?? "markdown") as "markdown" | "json";
  const baselinePath = flag("--baseline");
  const outDir = flag("--out") ?? join(homeDir, "eval", agentId);
  const requireToken = flag("--require-token") ?? process.env["CHATLAB_REQUIRE_TOKEN"] ?? "eval-token";

  // Boot chatlab internally on an ephemeral port
  const workspaceId = flag("--workspace");
  const startOpts: Parameters<typeof startChatlab>[0] = {
    home: homeDir,
    host: "127.0.0.1",
    port: 0,
    env: { ...process.env, CHATLAB_LOG_LEVEL: "silent", CHATLAB_REQUIRE_TOKEN: requireToken },
  };
  if (workspaceId) startOpts.workspaceId = workspaceId;
  const running = await startChatlab(startOpts);

  let exitCode = 0;
  try {
    const goldenSet = loadGoldenSet(inputPath);
    process.stdout.write(`eval: running ${goldenSet.prompts.length} prompt(s) against agent ${agentId}\n`);

    const evalOpts: Parameters<typeof runEval>[1] = {
      agentId,
      inputPath,
      outDir,
      format,
      serverUrl: running.url,
      token: requireToken,
    };
    if (baselinePath) evalOpts.baselinePath = baselinePath;
    const results = await runEval(goldenSet.prompts, evalOpts);

    const failed = results.filter((r) => r.error);
    if (failed.length > 0) {
      exitCode = 1;
    }

    let baseline: Map<string, string> | undefined;
    if (baselinePath) {
      try {
        const baselineContent = readFileSync(baselinePath, "utf8");
        baseline = parseBaselineMap(baselineContent);
      } catch {
        process.stderr.write(`eval: warning: could not read baseline at ${baselinePath}\n`);
      }
    }

    mkdirSync(outDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const ext = format === "json" ? "json" : "md";
    const outPath = join(outDir, `${timestamp}.${ext}`);

    const report =
      format === "json"
        ? buildJsonReport(results, agentId, timestamp)
        : buildMarkdownReport(results, agentId, timestamp, baseline);

    if (exitCode === 0) {
      writeFileSync(outPath, report, "utf8");
      process.stdout.write(`eval: report written to ${outPath}\n`);
    } else {
      process.stderr.write(`eval: ${failed.length} prompt(s) failed — report not written\n`);
    }

    const summary = summarize(results, baseline);
    process.stdout.write(`eval: ${summary}\n`);
  } finally {
    await running.stop();
  }

  process.exit(exitCode);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
