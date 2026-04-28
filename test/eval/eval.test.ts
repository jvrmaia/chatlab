import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startChatlab, type RunningChatlab } from "../../src/index.js";
import { loadGoldenSet } from "../../src/eval/loader.js";
import { runEval } from "../../src/eval/runner.js";
import {
  buildMarkdownReport,
  buildJsonReport,
  parseBaselineMap,
  summarize,
} from "../../src/eval/reporter.js";

const TOKEN = "eval-test-token";

describe("eval loader", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "chatlab-eval-"));
  });
  afterEach(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("EVAL-L-01 — parses a valid golden set", () => {
    const yaml = `prompts:\n  - id: greet\n    prompt: Hello\n  - id: bye\n    prompt: Goodbye\n    tags: [support]\n`;
    const path = join(dir, "golden.yaml");
    writeFileSync(path, yaml);
    const set = loadGoldenSet(path);
    expect(set.prompts).toHaveLength(2);
    expect(set.prompts[0]?.id).toBe("greet");
    expect(set.prompts[1]?.tags).toEqual(["support"]);
  });

  it("EVAL-L-02 — throws on missing prompts key", () => {
    const path = join(dir, "bad.yaml");
    writeFileSync(path, "not_prompts:\n  - id: x\n");
    expect(() => loadGoldenSet(path)).toThrow(/prompts/);
  });

  it("EVAL-L-03 — throws on prompt entry without id", () => {
    const path = join(dir, "bad2.yaml");
    writeFileSync(path, "prompts:\n  - prompt: Hello\n");
    expect(() => loadGoldenSet(path)).toThrow(/id/);
  });
});

describe("eval reporter", () => {
  it("EVAL-R-01 — buildMarkdownReport includes prompt id and response", () => {
    const results = [
      { id: "q1", prompt: "Hello", response: "Hi there", agent_version: "openai/gpt-4o" },
    ];
    const md = buildMarkdownReport(results, "agent-123", "2026-05-03T00-00-00Z");
    expect(md).toContain("## `q1`");
    expect(md).toContain("Hi there");
    expect(md).toContain("openai/gpt-4o");
  });

  it("EVAL-R-02 — buildMarkdownReport shows diff section when baseline provided", () => {
    const results = [{ id: "q1", prompt: "Hello", response: "New response", agent_version: "" }];
    const baseline = new Map([["q1", "Old response"]]);
    const md = buildMarkdownReport(results, "agent-123", "ts", baseline);
    expect(md).toContain("```diff");
    expect(md).toContain("-Old response");
    expect(md).toContain("+New response");
  });

  it("EVAL-R-03 — buildMarkdownReport marks unchanged responses", () => {
    const results = [{ id: "q1", prompt: "Hello", response: "Same", agent_version: "" }];
    const baseline = new Map([["q1", "Same"]]);
    const md = buildMarkdownReport(results, "agent-123", "ts", baseline);
    expect(md).toContain("unchanged");
  });

  it("EVAL-R-04 — buildJsonReport is valid JSON with expected fields", () => {
    const results = [{ id: "q1", prompt: "Hello", response: "Hi", agent_version: "a/b" }];
    const json = buildJsonReport(results, "agent-123", "ts");
    const parsed = JSON.parse(json) as { agent_id: string; results: typeof results };
    expect(parsed.agent_id).toBe("agent-123");
    expect(parsed.results[0]?.id).toBe("q1");
  });

  it("EVAL-R-05 — parseBaselineMap extracts responses by prompt id", () => {
    const md = `## \`p1\`\n\n**Response:**\n\n\`\`\`\nfoo bar\n\`\`\`\n\n## \`p2\`\n\n**Response:**\n\n\`\`\`\nbaz\n\`\`\`\n`;
    const map = parseBaselineMap(md);
    expect(map.get("p1")).toBe("foo bar");
    expect(map.get("p2")).toBe("baz");
  });

  it("EVAL-R-06 — summarize counts failures and changes", () => {
    const results = [
      { id: "a", prompt: "P", response: "R", agent_version: "" },
      { id: "b", prompt: "P", response: "", agent_version: "", error: "timeout" },
    ];
    expect(summarize(results)).toContain("1 failed");
    const baseline = new Map([["a", "different"]]);
    expect(summarize(results, baseline)).toContain("1 changed");
  });
});

describe("eval runner (integration)", () => {
  let home: string;
  let running: RunningChatlab;

  beforeEach(async () => {
    home = mkdtempSync(join(tmpdir(), "chatlab-eval-int-"));
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "eval-reply" } }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ) as unknown as typeof fetch;
    running = await startChatlab({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent", CHATLAB_REQUIRE_TOKEN: TOKEN },
      home,
      host: "127.0.0.1",
      port: 0,
      agentFetcher: fetcher,
    });
  });

  afterEach(async () => {
    await running.stop();
    try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it("EVAL-I-01 — runEval returns results for each prompt", async () => {
    // Create an agent in the running instance first
    const agentResp = await fetch(`${running.url}/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ name: "TestAgent", provider: "openai", model: "gpt-4o", api_key: "sk-test" }),
    });
    const agent = (await agentResp.json()) as { id: string };

    const prompts = [
      { id: "p1", prompt: "Hello" },
      { id: "p2", prompt: "Bye" },
    ];
    const results = await runEval(prompts, {
      agentId: agent.id,
      inputPath: "",
      outDir: home,
      serverUrl: running.url,
      token: TOKEN,
    });

    expect(results).toHaveLength(2);
    expect(results[0]?.id).toBe("p1");
    expect(results[0]?.response).toBe("eval-reply");
    expect(results[1]?.id).toBe("p2");
    expect(results.every((r) => !r.error)).toBe(true);
  });

  it("EVAL-I-02 — runEval returns error result for unknown agent", async () => {
    const prompts = [{ id: "p1", prompt: "Hello" }];
    const results = await runEval(prompts, {
      agentId: "no-such-agent",
      inputPath: "",
      outDir: home,
      serverUrl: running.url,
      token: TOKEN,
    });
    expect(results[0]?.error).toBeTruthy();
  });
});
