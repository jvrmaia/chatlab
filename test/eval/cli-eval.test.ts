import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/index.js", () => ({
  startChatlab: vi.fn(),
}));
vi.mock("../../src/eval/loader.js", () => ({
  loadGoldenSet: vi.fn(),
}));
vi.mock("../../src/eval/runner.js", () => ({
  runEval: vi.fn(),
}));
vi.mock("../../src/eval/reporter.js", () => ({
  buildMarkdownReport: vi.fn(() => "# Report\n\nContent"),
  buildJsonReport: vi.fn(() => '{"agent_id":"test"}'),
  parseBaselineMap: vi.fn(() => new Map()),
  summarize: vi.fn(() => "1 passed, 0 failed"),
}));

const { runEvalCommand } = await import("../../src/cli.js");
const { startChatlab } = await import("../../src/index.js");
const { loadGoldenSet } = await import("../../src/eval/loader.js");
const { runEval } = await import("../../src/eval/runner.js");

describe("eval CLI", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chatlab-cli-eval-"));
    vi.mocked(startChatlab).mockResolvedValue({
      url: "http://127.0.0.1:0",
      core: {} as never,
      config: {} as never,
      stop: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("EVAL-CLI-01 — missing --agent exits 1 and writes to stderr", async () => {
    let capturedCode: number | undefined;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(
      ((code?: number) => {
        capturedCode = code ?? 0;
        throw new Error(`exit:${capturedCode}`);
      }) as never,
    );
    const stderrLines: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((s: unknown) => {
      stderrLines.push(String(s));
      return true;
    });

    await expect(runEvalCommand([])).rejects.toThrow("exit:1");
    expect(stderrLines.join("")).toContain("--agent");
    expect(capturedCode).toBe(1);
    exitSpy.mockRestore();
  });

  it("EVAL-CLI-02 — valid --agent and golden YAML exits 0 and writes report", async () => {
    const goldenPath = join(dir, "golden.yaml");
    writeFileSync(goldenPath, "prompts:\n  - id: p1\n    prompt: Hello\n");
    const outDir = join(dir, "out");

    vi.mocked(loadGoldenSet).mockReturnValue({
      prompts: [{ id: "p1", prompt: "Hello" }],
    });
    vi.mocked(runEval).mockResolvedValue([
      { id: "p1", prompt: "Hello", response: "Hi", agent_version: "openai/gpt-4o" },
    ]);

    let capturedCode: number | undefined;
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(
      ((code?: number) => {
        capturedCode = code ?? 0;
        throw new Error(`exit:${capturedCode}`);
      }) as never,
    );
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);

    await expect(
      runEvalCommand(["--agent", "agent-123", "--input", goldenPath, "--out", outDir]),
    ).rejects.toThrow("exit:0");

    expect(capturedCode).toBe(0);
    const files = readdirSync(outDir);
    expect(files.some((f) => f.endsWith(".md"))).toBe(true);
    exitSpy.mockRestore();
  });
});
