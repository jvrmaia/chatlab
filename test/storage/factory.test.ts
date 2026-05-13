import { describe, expect, it } from "vitest";
import { createAdapterByType, createStorageForWorkspace } from "../../src/storage/factory.js";
import { MemoryAdapter } from "../../src/storage/memory.js";
import { SqliteAdapter } from "../../src/storage/sqlite.js";
import { DuckDbAdapter } from "../../src/storage/duckdb.js";
import type { Workspace } from "../../src/types/domain.js";

function makeWorkspace(storage_type: Workspace["storage_type"], storage_path?: string): Workspace {
  return {
    id: "ws-1",
    nickname: "test",
    storage_type,
    ...(storage_path !== undefined ? { storage_path } : {}),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("storage/factory", () => {
  it("FACT-01 — memory type returns MemoryAdapter (no path needed)", () => {
    expect(createAdapterByType("memory")).toBeInstanceOf(MemoryAdapter);
  });

  it("FACT-02 — sqlite without path throws", () => {
    expect(() => createAdapterByType("sqlite")).toThrow(/storage_path is required for sqlite/);
  });

  it("FACT-03 — duckdb without path throws", () => {
    expect(() => createAdapterByType("duckdb")).toThrow(/storage_path is required for duckdb/);
  });

  it("FACT-04 — sqlite with path returns SqliteAdapter", () => {
    const adapter = createAdapterByType("sqlite", "/tmp/test-factory.db");
    expect(adapter).toBeInstanceOf(SqliteAdapter);
  });

  it("FACT-05 — createStorageForWorkspace(memory) returns MemoryAdapter", () => {
    const ws = makeWorkspace("memory");
    expect(createStorageForWorkspace(ws)).toBeInstanceOf(MemoryAdapter);
  });

  it("FACT-06 — createStorageForWorkspace(sqlite) returns SqliteAdapter", () => {
    const ws = makeWorkspace("sqlite", "/tmp/test-factory-ws.db");
    expect(createStorageForWorkspace(ws)).toBeInstanceOf(SqliteAdapter);
  });

  it("FACT-07 — duckdb with path returns DuckDbAdapter (line 36)", () => {
    const adapter = createAdapterByType("duckdb", "/tmp/test-factory.duckdb");
    expect(adapter).toBeInstanceOf(DuckDbAdapter);
  });

  it("FACT-08 — createStorageForWorkspace(duckdb) returns DuckDbAdapter", () => {
    const ws = makeWorkspace("duckdb", "/tmp/test-factory-ws.duckdb");
    expect(createStorageForWorkspace(ws)).toBeInstanceOf(DuckDbAdapter);
  });
});
