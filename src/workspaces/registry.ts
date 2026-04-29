import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { newId } from "../lib/id.js";
import { nowIso } from "../lib/time.js";
import type { StorageType, Workspace, WorkspaceId } from "../types/domain.js";

/**
 * Persistent registry of workspaces. Lives in a single JSON file
 * (`$CHATLAB_HOME/workspaces.json`, default `~/.chatlab/workspaces.json`).
 * Atomic write — temp file + rename — so a crash mid-write doesn't corrupt
 * the registry.
 */

interface RegistryFile {
  active_id: WorkspaceId | null;
  workspaces: Workspace[];
}

export interface RegistryConfig {
  /** Override `$CHATLAB_HOME`. Useful in tests. */
  home?: string;
}

export class WorkspaceRegistry {
  private readonly home: string;
  private readonly file: string;
  private readonly dataDir: string;

  constructor(opts: RegistryConfig = {}) {
    this.home = resolve(opts.home ?? process.env["CHATLAB_HOME"] ?? join(homedir(), ".chatlab"));
    this.file = join(this.home, "workspaces.json");
    this.dataDir = join(this.home, "data");
  }

  /** Path to the registry file (for diagnostics). */
  filePath(): string {
    return this.file;
  }

  /** Path to the data directory where per-workspace files live. */
  dataDirectory(): string {
    return this.dataDir;
  }

  /** Path to the home directory ($CHATLAB_HOME). */
  homeDirectory(): string {
    return this.home;
  }

  /**
   * Bootstrap on first call: create the home dir + data dir + registry file
   * with a `default` sqlite workspace if missing. Returns the active workspace.
   */
  async init(): Promise<Workspace> {
    mkdirSync(this.home, { recursive: true });
    mkdirSync(this.dataDir, { recursive: true });

    if (!existsSync(this.file)) {
      const defaultWs = this.makeWorkspaceRecord("default", "sqlite");
      const initial: RegistryFile = { active_id: defaultWs.id, workspaces: [defaultWs] };
      this.writeAtomic(initial);
      return defaultWs;
    }

    const data = this.read();
    if (data.workspaces.length === 0) {
      const ws = this.makeWorkspaceRecord("default", "sqlite");
      const next: RegistryFile = { active_id: ws.id, workspaces: [ws] };
      this.writeAtomic(next);
      return ws;
    }
    const active = data.active_id
      ? data.workspaces.find((w) => w.id === data.active_id)
      : undefined;
    if (active) return active;
    // active_id pointed at a missing row; recover by selecting the first.
    const first = data.workspaces[0]!;
    this.writeAtomic({ ...data, active_id: first.id });
    return first;
  }

  list(): Workspace[] {
    return this.read().workspaces;
  }

  get(id: WorkspaceId): Workspace | null {
    return this.read().workspaces.find((w) => w.id === id) ?? null;
  }

  getActive(): Workspace | null {
    const data = this.read();
    if (!data.active_id) return null;
    return data.workspaces.find((w) => w.id === data.active_id) ?? null;
  }

  create(input: { nickname: string; storage_type: StorageType }): Workspace {
    const ws = this.makeWorkspaceRecord(input.nickname, input.storage_type);
    const data = this.read();
    data.workspaces.push(ws);
    this.writeAtomic(data);
    return ws;
  }

  update(id: WorkspaceId, patch: { nickname?: string }): Workspace | null {
    const data = this.read();
    const idx = data.workspaces.findIndex((w) => w.id === id);
    if (idx < 0) return null;
    const existing = data.workspaces[idx]!;
    const updated: Workspace = {
      ...existing,
      ...(patch.nickname !== undefined ? { nickname: patch.nickname } : {}),
      updated_at: nowIso(),
    };
    data.workspaces[idx] = updated;
    this.writeAtomic(data);
    return updated;
  }

  /**
   * Removes the workspace from the registry and deletes its data file (if
   * any). If the deleted workspace was active, picks another as active. If
   * none remain, auto-recreates `default`.
   */
  delete(id: WorkspaceId): { removed: boolean; nextActive: Workspace } {
    const data = this.read();
    const idx = data.workspaces.findIndex((w) => w.id === id);
    if (idx < 0) {
      const active = data.active_id
        ? data.workspaces.find((w) => w.id === data.active_id)
        : null;
      if (active) return { removed: false, nextActive: active };
      // no active and target absent — bootstrap default again
      const ws = this.makeWorkspaceRecord("default", "sqlite");
      this.writeAtomic({ active_id: ws.id, workspaces: [ws] });
      return { removed: false, nextActive: ws };
    }
    const removed = data.workspaces[idx]!;
    data.workspaces.splice(idx, 1);
    // delete the data file if any
    if (removed.storage_path && existsSync(removed.storage_path)) {
      try {
        unlinkSync(removed.storage_path);
      } catch {
        // best-effort
      }
    }
    if (data.active_id === id) {
      data.active_id = data.workspaces[0]?.id ?? null;
    }
    if (data.workspaces.length === 0) {
      const ws = this.makeWorkspaceRecord("default", "sqlite");
      data.workspaces.push(ws);
      data.active_id = ws.id;
    }
    this.writeAtomic(data);
    const nextActive = data.workspaces.find((w) => w.id === data.active_id) ?? data.workspaces[0]!;
    return { removed: true, nextActive };
  }

  setActive(id: WorkspaceId): Workspace | null {
    const data = this.read();
    const ws = data.workspaces.find((w) => w.id === id);
    if (!ws) return null;
    data.active_id = id;
    this.writeAtomic(data);
    return ws;
  }

  // ----- internals -----

  private makeWorkspaceRecord(nickname: string, storageType: StorageType): Workspace {
    const id = newId();
    const ts = nowIso();
    const ws: Workspace = {
      id,
      nickname,
      storage_type: storageType,
      created_at: ts,
      updated_at: ts,
    };
    if (storageType === "sqlite") {
      ws.storage_path = join(this.dataDir, `${id}.db`);
    } else if (storageType === "duckdb") {
      ws.storage_path = join(this.dataDir, `${id}.duckdb`);
    }
    return ws;
  }

  private read(): RegistryFile {
    if (!existsSync(this.file)) {
      return { active_id: null, workspaces: [] };
    }
    const raw = readFileSync(this.file, "utf8");
    const parsed = JSON.parse(raw) as RegistryFile;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.workspaces)) {
      throw new Error(`workspaces registry at ${this.file} is malformed`);
    }
    return parsed;
  }

  private writeAtomic(data: RegistryFile): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}-${Date.now()}`;
    writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    renameSync(tmp, this.file);
  }
}
