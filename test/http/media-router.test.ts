import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootHarness, type Harness } from "./_harness.js";

const TOKEN = "dev-token";

describe("HTTP — /v1/media", () => {
  let h: Harness;

  beforeEach(async () => {
    h = await bootHarness();
  });

  afterEach(async () => {
    await h.stop();
  });

  async function uploadPng(declaredType: string): Promise<Response> {
    const form = new FormData();
    const blob = new Blob(
      [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      { type: "image/png" },
    );
    form.append("file", blob, "x.png");
    form.append("type", declaredType);
    return fetch(`${h.running.url}/v1/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: form,
    });
  }

  it("MED-V-01 — POST without file returns 400", async () => {
    const form = new FormData();
    form.append("type", "image");
    const r = await fetch(`${h.running.url}/v1/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: form,
    });
    expect(r.status).toBe(400);
  });

  it("MED-V-02 — POST with unknown type returns 400", async () => {
    expect((await uploadPng("unknown-type")).status).toBe(400);
  });

  it("MED-V-03 — mismatched mime returns 415", async () => {
    expect((await uploadPng("audio")).status).toBe(415);
  });

  it("MED-V-04 — GET / GET /download / DELETE return 404 for missing id", async () => {
    expect(
      (await fetch(`${h.running.url}/v1/media/no-such`, { headers: { Authorization: `Bearer ${TOKEN}` } })).status,
    ).toBe(404);
    expect(
      (await fetch(`${h.running.url}/v1/media/no-such/download`, { headers: { Authorization: `Bearer ${TOKEN}` } })).status,
    ).toBe(404);
    expect(
      (await fetch(`${h.running.url}/v1/media/no-such`, { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN}` } })).status,
    ).toBe(404);
  });

  it("MED-V-05 — full upload + GET + download + DELETE round-trip", async () => {
    const upload = await uploadPng("image");
    expect(upload.status).toBe(201);
    const { id } = (await upload.json()) as { id: string };
    const meta = await fetch(`${h.running.url}/v1/media/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(meta.status).toBe(200);
    const metaBody = (await meta.json()) as { mime_type: string; download_url: string };
    expect(metaBody.mime_type).toBe("image/png");
    expect(metaBody.download_url).toContain(`/v1/media/${id}/download`);

    const download = await fetch(`${h.running.url}/v1/media/${id}/download`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("image/png");

    expect(
      (await fetch(`${h.running.url}/v1/media/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TOKEN}` },
      })).status,
    ).toBe(200);
  });
});
