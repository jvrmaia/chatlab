import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootHarness, type Harness } from "./_harness.js";

describe("HTTP — /v1/workspaces", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHarness();
  });

  afterEach(async () => {
    await h.stop();
  });

  it("WS-H-01 — bootstrap creates a default workspace + GET /v1/workspaces returns it", async () => {
    const r = await h.api("GET", "/v1/workspaces");
    const body = (await r.json()) as { data: Array<{ nickname: string }>; active_id: string };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.nickname).toBe("default");
    expect(body.active_id).toBeDefined();
  });

  it("WS-H-02 — POST creates a workspace; PATCH updates the nickname", async () => {
    const created = (await (
      await h.api("POST", "/v1/workspaces", { nickname: "exp", storage_type: "memory" })
    ).json()) as { id: string };

    const patched = (await (
      await h.api("PATCH", `/v1/workspaces/${created.id}`, { nickname: "renamed" })
    ).json()) as { nickname: string };
    expect(patched.nickname).toBe("renamed");
  });

  it("WS-H-03 — POST rejects bad storage_type or empty nickname", async () => {
    expect((await h.api("POST", "/v1/workspaces", {})).status).toBe(400);
    expect(
      (await h.api("POST", "/v1/workspaces", { nickname: "x", storage_type: "weird" })).status,
    ).toBe(400);
  });

  it("WS-H-04 — POST /activate swaps the active workspace", async () => {
    const ws = (await (
      await h.api("POST", "/v1/workspaces", { nickname: "exp", storage_type: "memory" })
    ).json()) as { id: string };

    await h.api("POST", `/v1/workspaces/${ws.id}/activate`);
    const active = (await (await h.api("GET", "/v1/workspaces/active")).json()) as { id: string };
    expect(active.id).toBe(ws.id);

    // activating an unknown id 404s
    const r = await h.api("POST", "/v1/workspaces/no-such/activate");
    expect(r.status).toBe(404);
  });

  it("WS-H-05 — DELETE without ?confirm=true is rejected; with confirm it removes the workspace", async () => {
    const ws = (await (
      await h.api("POST", "/v1/workspaces", { nickname: "exp", storage_type: "memory" })
    ).json()) as { id: string };

    expect((await h.api("DELETE", `/v1/workspaces/${ws.id}`)).status).toBe(400);
    expect((await h.api("DELETE", `/v1/workspaces/${ws.id}?confirm=true`)).status).toBe(200);

    const list = (await (await h.api("GET", "/v1/workspaces")).json()) as { data: unknown[] };
    expect(list.data.find((w) => (w as { id: string }).id === ws.id)).toBeUndefined();
  });

  it("WS-H-06 — workspace data is segregated — chats in one don't appear in another", async () => {
    // Create an agent + chat in default workspace
    const agent = (await (
      await h.api("POST", "/v1/agents", {
        name: "A",
        provider: "openai",
        model: "gpt-4o",
        api_key: "sk-test",
      })
    ).json()) as { id: string };
    await h.api("POST", "/v1/chats", { agent_id: agent.id, theme: "default-only" });

    // Create + activate a second workspace
    const ws2 = (await (
      await h.api("POST", "/v1/workspaces", { nickname: "exp", storage_type: "memory" })
    ).json()) as { id: string };
    await h.api("POST", `/v1/workspaces/${ws2.id}/activate`);

    const chats = (await (await h.api("GET", "/v1/chats")).json()) as { data: unknown[] };
    expect(chats.data).toHaveLength(0);
  });
});
