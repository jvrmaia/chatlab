import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryAdapter } from "../../src/storage/memory.js";
import { SqliteAdapter } from "../../src/storage/sqlite.js";
import { DuckDbAdapter } from "../../src/storage/duckdb.js";
import type { StorageAdapter } from "../../src/storage/adapter.js";

/**
 * Storage benchmarks. Default-skipped — run on demand:
 *
 *   CHATLAB_TEST_PERF=1 npm test -- test/perf/storage-bench.test.ts
 *
 * Per ADR 0010 §5, these are not a CI gate. Numbers go into
 * `docs/ARCHITECTURE.md` "Performance characteristics" when refreshed.
 */

const enabled = process.env["CHATLAB_TEST_PERF"] === "1";
const N = Number(process.env["CHATLAB_BENCH_N"] ?? "10000");

interface Result {
  adapter: string;
  insertMs: number;
  readMs: number;
  perInsertUs: number;
  perReadUs: number;
}

async function benchAdapter(name: string, adapter: StorageAdapter): Promise<Result> {
  await adapter.init();
  const ws = "ws-bench";
  const agent = await adapter.agents.create({
    workspace_id: ws,
    name: "bench",
    provider: "ollama",
    model: "llama3",
    context_window: 20,
  });
  const chat = await adapter.chats.create({
    workspace_id: ws,
    agent_id: agent.id,
    theme: "bench",
  });

  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    await adapter.messages.append({
      chat_id: chat.id,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `msg #${i}`,
      status: "ok",
    });
  }
  const insertMs = performance.now() - t0;

  const t1 = performance.now();
  const all = await adapter.messages.listByChat(chat.id);
  const readMs = performance.now() - t1;
  if (all.length !== N) throw new Error(`expected ${N} rows, got ${all.length}`);

  await adapter.close();
  return {
    adapter: name,
    insertMs,
    readMs,
    perInsertUs: (insertMs * 1000) / N,
    perReadUs: (readMs * 1000) / N,
  };
}

function formatTable(rows: Result[]): string {
  const head = "| Adapter  | Insert total | Insert/row | Read total | Read/row |";
  const sep =  "| -------- | -----------: | ---------: | ---------: | -------: |";
  const body = rows
    .map(
      (r) =>
        `| ${r.adapter.padEnd(8)} | ${r.insertMs.toFixed(0).padStart(7)} ms | ${r.perInsertUs
          .toFixed(1)
          .padStart(6)} µs | ${r.readMs.toFixed(0).padStart(6)} ms | ${r.perReadUs
          .toFixed(1)
          .padStart(4)} µs |`,
    )
    .join("\n");
  return `${head}\n${sep}\n${body}`;
}

describe.skipIf(!enabled)("storage bench (insert + read 10k messages)", () => {
  it("memory + sqlite + duckdb", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chatlab-bench-"));
    const results: Result[] = [];
    try {
      results.push(await benchAdapter("memory", new MemoryAdapter()));
      results.push(await benchAdapter("sqlite", new SqliteAdapter(join(dir, "bench.db"))));
      results.push(await benchAdapter("duckdb", new DuckDbAdapter(join(dir, "bench.duckdb"))));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    console.log("\n" + formatTable(results) + "\n");

    // Latency bounds: generous enough to pass on any reasonable machine,
    // tight enough to catch catastrophic regressions (e.g., accidentally
    // running inside a for-await loop that re-opens the DB per message).
    const LIMITS: Record<string, { insertUs: number; readUs: number }> = {
      memory: { insertUs: 1_000, readUs: 100 },
      sqlite: { insertUs: 50_000, readUs: 5_000 },
      duckdb: { insertUs: 100_000, readUs: 10_000 },
    };
    for (const r of results) {
      const limit = LIMITS[r.adapter];
      if (!limit) continue;
      expect(r.perInsertUs, `${r.adapter} insert µs/row`).toBeLessThan(limit.insertUs);
      expect(r.perReadUs, `${r.adapter} read µs/row`).toBeLessThan(limit.readUs);
    }
  });
});
