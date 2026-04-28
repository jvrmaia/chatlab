import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteAdapter } from "../../src/storage/sqlite.js";
import { runStorageBattery } from "./_battery.js";

const dir = join(tmpdir(), `chatlab-sqlite-${Date.now()}-${Math.random().toString(36).slice(2)}`);
mkdirSync(dir, { recursive: true });

runStorageBattery("sqlite", () => {
  const path = join(dir, `db-${Math.random().toString(36).slice(2)}.db`);
  return new SqliteAdapter(path);
});

process.on("exit", () => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});
