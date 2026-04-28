import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDbAdapter } from "../../src/storage/duckdb.js";
import { runStorageBattery } from "./_battery.js";

const dir = join(tmpdir(), `chatlab-duckdb-${Date.now()}-${Math.random().toString(36).slice(2)}`);
mkdirSync(dir, { recursive: true });

runStorageBattery(
  "duckdb",
  () => {
    const path = join(dir, `db-${Math.random().toString(36).slice(2)}.duckdb`);
    return new DuckDbAdapter(path);
  },
  { skipMedia: true },
);

process.on("exit", () => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});
