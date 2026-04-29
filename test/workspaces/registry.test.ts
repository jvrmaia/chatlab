import { mkdirSync, rmSync, existsSync } from "node:fs";
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
});
