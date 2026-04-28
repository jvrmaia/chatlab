import type { StorageType, Workspace } from "../types/domain.js";
import type { StorageAdapter } from "./adapter.js";
import { MemoryAdapter } from "./memory.js";
import { SqliteAdapter } from "./sqlite.js";
import { DuckDbAdapter } from "./duckdb.js";

/**
 * Build the per-workspace storage adapter for a given workspace record. The
 * caller is responsible for `await adapter.init()` afterwards.
 *
 * `masterKey` is forwarded to the adapter and used to encrypt provider API
 * keys at rest. If `undefined`, the adapter operates in legacy plaintext
 * mode (used by tests that don't exercise the at-rest encryption path).
 */
export function createStorageForWorkspace(ws: Workspace, masterKey?: Buffer): StorageAdapter {
  return createAdapterByType(ws.storage_type, ws.storage_path, masterKey);
}

export function createAdapterByType(
  type: StorageType,
  path?: string,
  masterKey?: Buffer,
): StorageAdapter {
  switch (type) {
    case "memory":
      return new MemoryAdapter(masterKey);
    case "sqlite":
      if (!path) {
        throw new Error("storage_path is required for sqlite workspaces");
      }
      return new SqliteAdapter(path, masterKey);
    case "duckdb":
      if (!path) {
        throw new Error("storage_path is required for duckdb workspaces");
      }
      return new DuckDbAdapter(path, masterKey);
  }
}
