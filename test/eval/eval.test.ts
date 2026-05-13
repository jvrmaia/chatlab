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

  it("EVAL-L-04 — throws when YAML parses to a non-object (scalar)", () => {
    const path = join(dir, "scalar.yaml");
    writeFileSync(path, "just a string\n");
    expect(() => loadGoldenSet(path)).toThrow(/not a valid YAML object/);
  });

  it("EVAL-L-05 — throws when a prompt entry is not an object (e.g. scalar in list)", () => {
    const path = join(dir, "bad3.yaml");
    writeFileSync(path, "prompts:\n  - Hello\n");
    expect(() => loadGoldenSet(path)).toThrow(/must be an object/);
  });

  it("EVAL-L-06 — throws when a prompt entry has a valid id but missing prompt field", () => {
    const path = join(dir, "bad4.yaml");
    writeFileSync(path, "prompts:\n  - id: p1\n");
    expect(() => loadGoldenSet(path)).toThrow(/prompt/);
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

  it("EVAL-R-07 — buildMarkdownReport renders error result without response block", () => {
    const results = [
      { id: "q1", prompt: "Fail", response: "", agent_version: "", error: "timeout" },
    ];
    const md = buildMarkdownReport(results, "agent-x", "ts");
    expect(md).toContain("**Error:** timeout");
    expect(md).not.toContain("**Response:**");
  });

  it("EVAL-R-08 — buildMarkdownReport with baseline shows new-prompt note", () => {
    const results = [{ id: "q-new", prompt: "Brand new", response: "answer", agent_version: "" }];
    const baseline = new Map<string, string>(); // empty — q-new not in baseline
    const md = buildMarkdownReport(results, "agent-x", "ts", baseline);
    expect(md).toContain("No baseline for this prompt");
  });

  it("EVAL-R-09 — unifiedDiff handles b having more lines than a", () => {
    // buildMarkdownReport uses unifiedDiff internally; exercise via a longer new response
    const results = [{ id: "q1", prompt: "P", response: "line1\nline2\nline3", agent_version: "" }];
    const baseline = new Map([["q1", "line1"]]);
    const md = buildMarkdownReport(results, "a", "t", baseline);
    expect(md).toContain("+line2");
    expect(md).toContain("+line3");
  });

  it("EVAL-R-10 — unifiedDiff handles a having more lines than b", () => {
    const results = [{ id: "q1", prompt: "P", response: "short", agent_version: "" }];
    const baseline = new Map([["q1", "line1\nline2\nlong baseline"]]);
    const md = buildMarkdownReport(results, "a", "t", baseline);
    expect(md).toContain("-line1");
    expect(md).toContain("-line2");
  });

  it("EVAL-R-11 — summarize with exactly 1 result uses singular 'prompt' (line 117 false branch)", () => {
    const results = [{ id: "a", prompt: "P", response: "R", agent_version: "" }];
    expect(summarize(results)).toContain("1 prompt");
    expect(summarize(results)).not.toContain("prompts");
  });

  it("EVAL-R-12 — summarize with 0 failures skips 'failed' part (line 118 false branch)", () => {
    const results = [{ id: "a", prompt: "P", response: "R", agent_version: "" }];
    const summary = summarize(results);
    expect(summary).not.toContain("failed");
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

  it("EVAL-I-03 — runEval returns error when message post fails (bad chat id path via wrong token)", async () => {
    // Use a bad token → all requests return 403 → chat creation fails → error in result
    const agentResp = await fetch(`${running.url}/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-test" }),
    });
    const agent = (await agentResp.json()) as { id: string };

    const results = await runEval([{ id: "p1", prompt: "Hello" }], {
      agentId: agent.id,
      inputPath: "",
      outDir: home,
      serverUrl: running.url,
      token: "wrong-token",
    });
    // With bad token the chat POST returns 403 → error path in runSinglePrompt
    expect(results[0]?.error).toBeTruthy();
  });

  it("EVAL-I-04 — runEval handles assistant message with error status", async () => {
    // Use a fetcher that returns a 401 so the agent runner saves a failed message
    const failFetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "bad key" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    ) as unknown as typeof fetch;

    const { mkdtempSync: mktmp } = await import("node:fs");
    const { join: pjoin } = await import("node:path");
    const errHome = mktmp(pjoin((await import("node:os")).tmpdir(), "chatlab-eval-err-"));

    const { startChatlab: start } = await import("../../src/index.js");
    const errRunning = await start({
      env: { ...process.env, CHATLAB_LOG_LEVEL: "silent", CHATLAB_REQUIRE_TOKEN: TOKEN },
      home: errHome,
      host: "127.0.0.1",
      port: 0,
      agentFetcher: failFetcher,
    });

    try {
      const aResp = await fetch(`${errRunning.url}/v1/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ name: "A", provider: "openai", model: "gpt-4o", api_key: "sk-bad" }),
      });
      const agent2 = (await aResp.json()) as { id: string };

      const results = await runEval([{ id: "p1", prompt: "Hello" }], {
        agentId: agent2.id,
        inputPath: "",
        outDir: errHome,
        serverUrl: errRunning.url,
        token: TOKEN,
      });
      // Should return a result — either with error field or with status=failed response
      expect(results).toHaveLength(1);
    } finally {
      await errRunning.stop();
      try {
        const { rmSync } = await import("node:fs");
        rmSync(errHome, { recursive: true, force: true });
      } catch { /* ignore */ }
    }
  });

  it("EVAL-I-05 — runEval captures error when message POST fails (line 39 true branch)", async () => {
    // Smart mock: chat creation succeeds, message post fails
    let chatCallDone = false;
    const mockFetch = vi.fn(async (input: string | URL | Request) => {
      const urlStr = input instanceof Request ? input.url : String(input);
      if (!chatCallDone && urlStr.includes("/v1/chats") && !urlStr.includes("/messages")) {
        chatCallDone = true;
        return new Response(
          JSON.stringify({ id: "chat-mock-99", agent_id: "ag-1", theme: "eval-p1", workspace_id: "ws-1", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "server error" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", mockFetch);
    try {
      const results = await runEval([{ id: "p1", prompt: "Hello" }], {
        agentId: "ag-mock",
        inputPath: "",
        outDir: home,
        serverUrl: "http://127.0.0.1:19999",
        token: TOKEN,
      });
      expect(results[0]?.error).toContain("failed to send message");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
