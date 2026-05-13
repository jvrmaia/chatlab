import { describe, it, expect } from "vitest";
import { parseSseLines } from "../../src/lib/sse.js";

function makeStream(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      for (const c of chunks) ctrl.enqueue(enc.encode(c));
      ctrl.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = [];
  for await (const line of parseSseLines(stream)) out.push(line);
  return out;
}

describe("parseSseLines", () => {
  it("SSE-01 — stream vazio não produz nada", async () =>
    expect(await collect(makeStream())).toEqual([]));

  it("SSE-02 — evento único no chunk produz o valor data", async () =>
    expect(await collect(makeStream('data: {"a":1}\n\n'))).toEqual(['{"a":1}']));

  it("SSE-03 — múltiplos eventos no chunk produz cada valor em ordem", async () =>
    expect(await collect(makeStream("data: A\n\ndata: B\n\n"))).toEqual(["A", "B"]));

  it("SSE-04 — linhas sem prefixo data: são ignoradas", async () =>
    expect(await collect(makeStream(": comment\nevent: x\ndata: ok\n\n"))).toEqual(["ok"]));

  it("SSE-05 — [DONE] é produzido como string (consumer decide)", async () =>
    expect(await collect(makeStream("data: [DONE]\n\n"))).toEqual(["[DONE]"]));

  it("SSE-06 — evento partido entre chunks é remontado corretamente", async () =>
    expect(await collect(makeStream("data: hel", "lo\n\n"))).toEqual(["hello"]));
});
