import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StorageAdapter } from "../../src/storage/adapter.js";

export interface BatteryOptions {
  /** DuckDB's binary param binding is brittle — its tests skip media. */
  skipMedia?: boolean;
}

const WS = "ws-test";

export function runStorageBattery(
  label: string,
  makeAdapter: () => StorageAdapter,
  opts: BatteryOptions = {},
): void {
  describe(`storage adapter — ${label}`, () => {
    let a: StorageAdapter;

    beforeEach(async () => {
      a = makeAdapter();
      await a.init();
    });

    afterEach(async () => {
      await a.close();
    });

    // -------------------- chats --------------------

    it("chats — create + get + list + touch + listByAgent", async () => {
      const c1 = await a.chats.create({ workspace_id: WS, agent_id: "ag-1", theme: "t1" });
      const c2 = await a.chats.create({ workspace_id: WS, agent_id: "ag-2", theme: "t2" });
      expect((await a.chats.get(c1.id))?.theme).toBe("t1");
      expect((await a.chats.list()).length).toBe(2);
      expect((await a.chats.listByAgent("ag-2"))[0]?.id).toBe(c2.id);

      const beforeTs = c1.updated_at;
      await new Promise((r) => setTimeout(r, 10));
      await a.chats.touch(c1.id);
      const after = await a.chats.get(c1.id);
      expect(after?.updated_at).not.toBe(beforeTs);
    });

    it("chats — delete cascades messages + feedback + annotation", async () => {
      const c = await a.chats.create({ workspace_id: WS, agent_id: "ag-1", theme: "t" });
      const m = await a.messages.append({ chat_id: c.id, role: "assistant", content: "hi" });
      await a.feedback.set({ message_id: m.id, rating: "up" });
      await a.annotations.set({ chat_id: c.id, body: "n" });
      expect(await a.chats.delete(c.id)).toBe(true);
      expect(await a.messages.get(m.id)).toBeNull();
      expect(await a.feedback.get(m.id)).toBeNull();
      expect(await a.annotations.get(c.id)).toBeNull();
    });

    // -------------------- messages --------------------

    it("messages — append + listByChat + role + status + delete", async () => {
      const c = await a.chats.create({ workspace_id: WS, agent_id: "ag-1", theme: "t" });
      const u = await a.messages.append({ chat_id: c.id, role: "user", content: "hi" });
      const ok = await a.messages.append({ chat_id: c.id, role: "assistant", content: "ho" });
      const fail = await a.messages.append({
        chat_id: c.id,
        role: "assistant",
        content: "",
        status: "failed",
        error: "ZZ_AGENT_PROVIDER_ERROR: 401",
      });
      const list = await a.messages.listByChat(c.id);
      expect(list.map((m) => m.id)).toEqual([u.id, ok.id, fail.id]);
      expect(list[2]?.error).toMatch(/401/);
      expect(await a.messages.delete(u.id)).toBe(true);
    });

    // -------------------- agents --------------------

    it("agents — CRUD with workspace scope", async () => {
      const ag = await a.agents.create({
        workspace_id: WS,
        name: "OpenAI",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
        context_window: 20,
      });
      expect((await a.agents.get(ag.id))?.workspace_id).toBe(WS);
      const updated = await a.agents.update(ag.id, { name: "renamed" });
      expect(updated?.name).toBe("renamed");
      expect(updated?.api_key).toBe("sk-test");
      // omitting api_key in patch preserves the stored value
      await a.agents.update(ag.id, { api_key: "" });
      expect((await a.agents.get(ag.id))?.api_key).toBe("sk-test");
      expect(await a.agents.delete(ag.id)).toBe(true);
      expect(await a.agents.get(ag.id)).toBeNull();
    });

    // -------------------- media --------------------

    it.skipIf(opts.skipMedia === true)("media — put + get + getContent + delete", async () => {
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const rec = await a.media.put({
        id: "m1",
        type: "image",
        mime_type: "image/png",
        size: buf.length,
        sha256: "abc",
        filename: "x.png",
        content: buf,
      });
      expect(rec.id).toBe("m1");
      expect((await a.media.get("m1"))?.mime_type).toBe("image/png");
      const back = await a.media.getContent("m1");
      expect(back?.length).toBe(buf.length);
      expect(await a.media.delete("m1")).toBe(true);
      expect(await a.media.get("m1")).toBeNull();
    });

    // -------------------- feedback --------------------

    it("feedback — set + get + filter + sweep", async () => {
      const c = await a.chats.create({ workspace_id: WS, agent_id: "ag-1", theme: "t" });
      const m = await a.messages.append({ chat_id: c.id, role: "assistant", content: "hi" });
      const fb = await a.feedback.set({ message_id: m.id, rating: "up", comment: "good" });
      expect(fb.rating).toBe("up");
      const filtered = await a.feedback.list({ rating: "up", chat_id: c.id });
      expect(filtered).toHaveLength(1);
      expect(await a.feedback.delete(m.id)).toBe(true);
      expect(await a.feedback.delete(m.id)).toBe(false);

      await a.feedback.set({ message_id: m.id, rating: "down" });
      const swept = await a.feedback.sweepOlderThan("2099-01-01T00:00:00Z");
      expect(swept).toBeGreaterThanOrEqual(1);
    });

    // -------------------- annotations --------------------

    it("annotations — set + get + delete + sweep", async () => {
      const c = await a.chats.create({ workspace_id: WS, agent_id: "ag-1", theme: "t" });
      await a.annotations.set({ chat_id: c.id, body: "x" });
      expect((await a.annotations.get(c.id))?.body).toBe("x");
      expect(await a.annotations.delete(c.id)).toBe(true);

      await a.annotations.set({ chat_id: c.id, body: "y" });
      const swept = await a.annotations.sweepOlderThan("2099-01-01T00:00:00Z");
      expect(swept).toBeGreaterThanOrEqual(1);
    });

    // -------------------- reset --------------------

    it("reset — clears every namespace", async () => {
      const c = await a.chats.create({ workspace_id: WS, agent_id: "ag-1", theme: "t" });
      const m = await a.messages.append({ chat_id: c.id, role: "assistant", content: "hi" });
      await a.feedback.set({ message_id: m.id, rating: "up" });
      await a.annotations.set({ chat_id: c.id, body: "n" });
      await a.agents.create({
        workspace_id: WS,
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        context_window: 20,
      });

      await a.reset();
      expect(await a.chats.list()).toHaveLength(0);
      expect(await a.messages.listByChat(c.id)).toHaveLength(0);
      expect(await a.feedback.get(m.id)).toBeNull();
      expect(await a.agents.list()).toHaveLength(0);
    });
  });
}
