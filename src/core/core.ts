import { EventEmitter } from "node:events";
import type { Chat, Message, Workspace, WorkspaceId } from "../types/domain.js";
import type { StorageAdapter } from "../storage/adapter.js";
import { createStorageForWorkspace } from "../storage/factory.js";
import { WorkspaceRegistry } from "../workspaces/registry.js";
import { silentLogger, type ChatlabLogger } from "../lib/logger.js";

/**
 * Events broadcast over `core.on(...)`. The WS gateway re-emits them to UI
 * clients.
 */
export type CoreEvent =
  | { type: "workspace.activated"; workspace: Workspace }
  | { type: "chat.created"; chat: Chat }
  | { type: "chat.deleted"; chat_id: string }
  | { type: "chat.user-message-appended"; message: Message }
  | { type: "chat.assistant-replied"; message: Message }
  | { type: "agent.failed"; chat_id: string; error: string };

export interface CoreOptions {
  registry: WorkspaceRegistry;
  /**
   * 32-byte symmetric key used to encrypt provider API keys at rest. When
   * undefined, storage adapters operate in legacy plaintext mode (used by
   * tests that don't exercise the at-rest path).
   */
  masterKey?: Buffer;
  /** Pino logger. Defaults to a silent logger so tests stay quiet. */
  logger?: ChatlabLogger;
}

/**
 * Process-global state owner. Holds the active workspace + its storage adapter.
 * Routers go through `core.storage.<namespace>` — the getter returns the
 * currently-bound adapter.
 *
 * @public
 */
export class Core extends EventEmitter {
  readonly registry: WorkspaceRegistry;
  readonly logger: ChatlabLogger;
  private active: Workspace;
  private adapter: StorageAdapter;
  private inflight = 0;
  private readonly masterKey: Buffer | undefined;

  private constructor(
    registry: WorkspaceRegistry,
    active: Workspace,
    adapter: StorageAdapter,
    masterKey: Buffer | undefined,
    logger: ChatlabLogger,
  ) {
    super();
    this.registry = registry;
    this.active = active;
    this.adapter = adapter;
    this.masterKey = masterKey;
    this.logger = logger;
  }

  /** Construct + bootstrap the registry + open the active workspace's adapter. */
  static async start(opts: CoreOptions): Promise<Core> {
    const active = await opts.registry.init();
    const adapter = createStorageForWorkspace(active, opts.masterKey);
    await adapter.init();
    const logger = opts.logger ?? silentLogger();
    return new Core(opts.registry, active, adapter, opts.masterKey, logger);
  }

  async stop(): Promise<void> {
    await this.adapter.close();
  }

  /** The currently-bound storage adapter. */
  get storage(): StorageAdapter {
    return this.adapter;
  }

  /** Read-only view of the currently-active workspace. */
  activeWorkspace(): Workspace {
    return this.active;
  }

  /** Track in-flight agent calls for graceful workspace switching. */
  beginInflight(): void {
    this.inflight++;
  }
  endInflight(): void {
    if (this.inflight > 0) this.inflight--;
  }
  inflightCount(): number {
    return this.inflight;
  }

  /**
   * Hot-swap the active workspace. Waits up to `timeoutMs` for in-flight
   * agent calls to drain; throws if they don't.
   */
  async activateWorkspace(id: WorkspaceId, timeoutMs = 2000): Promise<Workspace> {
    if (id === this.active.id) return this.active;

    // wait for inflight to drain
    const deadline = Date.now() + timeoutMs;
    while (this.inflight > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (this.inflight > 0) {
      const err = new Error(`Cannot activate workspace ${id}: ${this.inflight} agent call(s) still in flight`);
      (err as Error & { code?: string }).code = "ZZ_WORKSPACE_BUSY";
      throw err;
    }

    const target = this.registry.get(id);
    if (!target) {
      const err = new Error(`Workspace ${id} not found`);
      (err as Error & { code?: string }).code = "ZZ_WORKSPACE_NOT_FOUND";
      throw err;
    }

    await this.adapter.close();
    const next = createStorageForWorkspace(target, this.masterKey);
    await next.init();
    this.adapter = next;
    this.active = target;
    this.registry.setActive(id);

    this.emitEvent({ type: "workspace.activated", workspace: target });
    return target;
  }

  /**
   * Re-bind to the currently-active workspace after the registry has been
   * mutated externally (e.g., delete that picked a new active). Used when
   * the active workspace has been removed.
   */
  async reloadActiveFromRegistry(): Promise<Workspace> {
    const active = this.registry.getActive();
    if (!active) {
      throw new Error("Registry has no active workspace");
    }
    if (active.id === this.active.id) return this.active;
    return this.activateWorkspace(active.id);
  }

  emitEvent(event: CoreEvent): void {
    this.emit("core-event", event);
  }

  /**
   * Run one feedback + annotation retention sweep against the active
   * workspace's adapter. Returns the count of rows deleted across both
   * namespaces. No-op when `retentionDays` ≤ 0.
   *
   * Called by the daily timer wired in {@link startRetentionSweep}; safe to
   * call directly in tests.
   */
  async runRetentionSweep(retentionDays: number): Promise<number> {
    if (retentionDays <= 0) return 0;
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    const f = await this.adapter.feedback.sweepOlderThan(cutoff);
    const a = await this.adapter.annotations.sweepOlderThan(cutoff);
    this.logger.info(
      { workspace_id: this.active.id, retention_days: retentionDays, feedback: f, annotations: a },
      "retention sweep",
    );
    return f + a;
  }

  /**
   * Install a daily timer that runs {@link runRetentionSweep}. Returns a
   * disposer that clears the timer. Idempotent: existing timer (if any)
   * stays — caller should keep the disposer to undo on shutdown.
   */
  startRetentionSweep(retentionDays: number, intervalMs = 24 * 60 * 60 * 1000): () => void {
    if (retentionDays <= 0) return () => {};
    const tick = (): void => {
      void this.runRetentionSweep(retentionDays).catch(() => {
        /* swallowed; the next tick retries */
      });
    };
    const handle = setInterval(tick, intervalMs);
    handle.unref?.();
    return () => clearInterval(handle);
  }
}
