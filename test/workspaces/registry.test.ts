import { mkdirSync, rmSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceRegistry } from "../../src/workspaces/registry.js";

describe("WorkspaceRegistry", () => {
  let home: string;
  let registry: WorkspaceRegistry;

  beforeEach(async () => {
    home = join(tmpdir(), `chatlab-registry-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(home, { recursive: true });
    registry = new WorkspaceRegistry({ home });
  });

  afterEach(() => {
    try {
      rmSync(home, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("WS-R-01 — init() bootstraps a default sqlite workspace when registry is missing", async () => {
    const active = await registry.init();
    expect(active.nickname).toBe("default");
    expect(active.storage_type).toBe("sqlite");
    expect(existsSync(registry.filePath())).toBe(true);
    expect(registry.list()).toHaveLength(1);
    expect(registry.getActive()?.id).toBe(active.id);
  });

  it("WS-R-02 — re-init reads the existing registry without rewriting it", async () => {
    const first = await registry.init();
    // re-construct + init — should read same workspace
    const r2 = new WorkspaceRegistry({ home });
    const active = await r2.init();
    expect(active.id).toBe(first.id);
  });

  it("WS-R-03 — create / list / get / update", async () => {
    await registry.init();
    const ws = registry.create({ nickname: "experiment", storage_type: "memory" });
    expect(ws.storage_type).toBe("memory");
    expect(ws.storage_path).toBeUndefined();
    expect(registry.list()).toHaveLength(2);
    expect(registry.get(ws.id)?.nickname).toBe("experiment");
    const updated = registry.update(ws.id, { nickname: "renamed" });
    expect(updated?.nickname).toBe("renamed");
    expect(registry.update("does-not-exist", { nickname: "x" })).toBeNull();
  });

  it("WS-R-04 — setActive only succeeds for known ids; getActive reflects the change", async () => {
    await registry.init();
    const ws = registry.create({ nickname: "experiment", storage_type: "memory" });
    expect(registry.setActive(ws.id)?.id).toBe(ws.id);
    expect(registry.getActive()?.id).toBe(ws.id);
    expect(registry.setActive("nope")).toBeNull();
  });

  it("WS-R-05 — delete removes from registry and reassigns active when needed", async () => {
    const def = await registry.init();
    const ws = registry.create({ nickname: "x", storage_type: "memory" });
    registry.setActive(ws.id);
    const r = registry.delete(ws.id);
    expect(r.removed).toBe(true);
    expect(r.nextActive.id).toBe(def.id);
    expect(registry.getActive()?.id).toBe(def.id);
    expect(registry.list().some((w) => w.id === ws.id)).toBe(false);
  });

  it("WS-R-06 — deleting the last workspace bootstraps a fresh `default`", async () => {
    const def = await registry.init();
    const r = registry.delete(def.id);
    expect(r.removed).toBe(true);
    expect(r.nextActive.nickname).toBe("default");
    expect(registry.list()).toHaveLength(1);
  });

  it("WS-R-07 — delete on unknown id is a no-op (reports false)", async () => {
    await registry.init();
    const r = registry.delete("does-not-exist");
    expect(r.removed).toBe(false);
  });

  it("WS-R-13 — list() returns empty when registry file does not exist yet", () => {
    // Do NOT call init() — file doesn't exist yet
    const list = registry.list();
    expect(list).toEqual([]);
  });

  it("WS-R-14 — read() throws when registry file contains malformed JSON object", () => {
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(
      join(home, "workspaces.json"),
      JSON.stringify({ not_workspaces: true }),
    );
    expect(() => registry.list()).toThrow(/malformed/);
  });

  it("WS-R-08 — init() with an existing registry that has an empty workspaces list recreates default", async () => {
    // Write a registry file with an empty workspaces array
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(
      join(home, "workspaces.json"),
      JSON.stringify({ active_id: null, workspaces: [] }),
    );
    const active = await registry.init();
    expect(active.nickname).toBe("default");
    expect(registry.list()).toHaveLength(1);
  });

  it("WS-R-09 — init() recovers when active_id points to a workspace not in the list", async () => {
    // Write registry with 1 workspace but active_id pointing to a ghost id
    const ws = { id: "real-ws", nickname: "real", storage_type: "memory", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(
      join(home, "workspaces.json"),
      JSON.stringify({ active_id: "ghost-id", workspaces: [ws] }),
    );
    const active = await registry.init();
    // Should recover to the first workspace in the list
    expect(active.id).toBe("real-ws");
    expect(registry.getActive()?.id).toBe("real-ws");
  });

  it("WS-R-10 — create() with duckdb storage_type sets a .duckdb storage_path", async () => {
    await registry.init();
    const ws = registry.create({ nickname: "duck", storage_type: "duckdb" });
    expect(ws.storage_type).toBe("duckdb");
    expect(ws.storage_path).toMatch(/\.duckdb$/);
  });

  it("WS-R-10b — delete() when target missing and no active bootstraps a new default", async () => {
    // Write a registry with a workspace but active_id pointing to null
    const ws = { id: "real-ws", nickname: "real", storage_type: "memory", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(
      join(home, "workspaces.json"),
      JSON.stringify({ active_id: null, workspaces: [ws] }),
    );

    // Try to delete a workspace that doesn't exist, with no active
    const r = registry.delete("ghost-id-that-does-not-exist");
    // Should bootstrap a new default workspace
    expect(r.removed).toBe(false);
    expect(r.nextActive.nickname).toBe("default");
  });

  it("WS-R-11 — delete() unlinks storage_path when the file exists", async () => {
    await registry.init();
    // Use a sqlite workspace so it gets a storage_path
    const ws = registry.create({ nickname: "db-ws", storage_type: "sqlite" });
    expect(ws.storage_path).toBeDefined();
    // Create the file so unlinkSync actually has something to remove
    writeFileSync(ws.storage_path!, "");
    expect(existsSync(ws.storage_path!)).toBe(true);
    registry.delete(ws.id);
    expect(existsSync(ws.storage_path!)).toBe(false);
  });

  it("WS-R-15 — init() with null active_id but non-empty workspaces recovers to first (line 83 false branch)", async () => {
    const ws = {
      id: "existing-ws",
      nickname: "existing",
      storage_type: "memory",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(
      join(home, "workspaces.json"),
      JSON.stringify({ active_id: null, workspaces: [ws] }),
    );
    const active = await registry.init();
    // active_id was null → false branch at line 83 → active = undefined → recover to first workspace
    expect(active.id).toBe("existing-ws");
  });

  it("WS-R-16 — getActive() returns null when active_id is null (line 103)", () => {
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(
      join(home, "workspaces.json"),
      JSON.stringify({ active_id: null, workspaces: [] }),
    );
    expect(registry.getActive()).toBeNull();
  });

  it("WS-R-17 — update() with empty patch (no nickname) takes false branch (line 122)", async () => {
    await registry.init();
    const ws = registry.create({ nickname: "patchable", storage_type: "memory" });
    // Patch with no nickname → the ternary's false branch is taken
    const result = registry.update(ws.id, {});
    expect(result?.nickname).toBe("patchable");
    expect(result?.id).toBe(ws.id);
  });

  it("WS-R-18 — getActive() with orphan active_id returns null (line 104 ?? null branch)", () => {
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(
      join(home, "workspaces.json"),
      JSON.stringify({ active_id: "non-existent-id", workspaces: [] }),
    );
    expect(registry.getActive()).toBeNull();
  });

  it("WS-R-19 — delete() with null active_id falls back to workspaces[0] (line 167 ?? branch)", async () => {
    // Create two workspaces with active_id = null (corrupted state)
    const ws = {
      id: "ws-a",
      nickname: "alpha",
      storage_type: "memory",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const ws2 = {
      id: "ws-b",
      nickname: "beta",
      storage_type: "memory",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(
      join(home, "workspaces.json"),
      JSON.stringify({ active_id: null, workspaces: [ws, ws2] }),
    );
    const result = registry.delete("ws-a");
    expect(result.removed).toBe(true);
    // active_id is null → find returns undefined → fallback to workspaces[0] = ws2
    expect(result.nextActive.id).toBe("ws-b");
  });
});
