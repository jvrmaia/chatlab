import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StorageAdapter } from "../../src/storage/adapter.js";
import { MemoryAdapter } from "../../src/storage/memory.js";
import { SqliteAdapter } from "../../src/storage/sqlite.js";
import { DuckDbAdapter } from "../../src/storage/duckdb.js";

const TOTAL = 10;

function suiteFor(label: string, makeAdapter: () => StorageAdapter): void {
  describe(`listByChat({ limit }) — ${label}`, () => {
    let a: StorageAdapter;
    let chatId: string;

    beforeEach(async () => {
      a = makeAdapter();
      await a.init();
      const chat = await a.chats.create({ workspace_id: "ws-1", agent_id: "ag-x", theme: "t" });
      chatId = chat.id;
      for (let i = 0; i < TOTAL; i++) {
        await a.messages.append({ chat_id: chatId, role: "user", content: `msg-${i}` });
        // 2ms gap ensures distinct ISO timestamps (nowIso() resolution is 1ms)
        await new Promise((r) => setTimeout(r, 2));
      }
    });

    afterEach(async () => {
      await a.close();
    });

    it("LST-01 — limit < total retorna as N mais recentes em ordem cronológica", async () => {
      const result = await a.messages.listByChat(chatId, { limit: 3 });
      expect(result).toHaveLength(3);
      expect(result[0]?.content).toBe("msg-7");
      expect(result[1]?.content).toBe("msg-8");
      expect(result[2]?.content).toBe("msg-9");
    });

    it("LST-02 — limit === total retorna todas", async () => {
      const result = await a.messages.listByChat(chatId, { limit: TOTAL });
      expect(result).toHaveLength(TOTAL);
    });

    it("LST-03 — limit > total retorna todas sem erro", async () => {
      const result = await a.messages.listByChat(chatId, { limit: 100 });
      expect(result).toHaveLength(TOTAL);
    });

    it("LST-04 — sem limit retorna todas", async () => {
      const result = await a.messages.listByChat(chatId);
      expect(result).toHaveLength(TOTAL);
    });

    it("LST-05 — limit=1 retorna apenas a mensagem mais recente", async () => {
      const result = await a.messages.listByChat(chatId, { limit: 1 });
      expect(result).toHaveLength(1);
      expect(result[0]?.content).toBe("msg-9");
    });
  });
}

suiteFor("memory", () => new MemoryAdapter());

suiteFor("sqlite", () => {
  const dir = mkdtempSync(join(tmpdir(), "chatlab-lbl-sq-"));
  return new SqliteAdapter(join(dir, "ws.db"));
});

suiteFor("duckdb", () => {
  const dir = mkdtempSync(join(tmpdir(), "chatlab-lbl-dk-"));
  return new DuckDbAdapter(join(dir, `ws-${Math.random().toString(36).slice(2)}.duckdb`));
});
