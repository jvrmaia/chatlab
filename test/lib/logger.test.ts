import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { DestinationStream } from "pino";
import { createLogger, silentLogger } from "../../src/lib/logger.js";

describe("createLogger", () => {
  it("defaults to info level", () => {
    const logger = createLogger();
    expect(logger.level).toBe("info");
  });

  it("respects a custom level", () => {
    expect(createLogger({ level: "warn" }).level).toBe("warn");
    expect(createLogger({ level: "debug" }).level).toBe("debug");
  });

  it("writes to a custom stream when provided", async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk.toString());
        cb();
      },
    }) as unknown as DestinationStream;
    const logger = createLogger({ level: "info", stream });
    logger.info("hello-stream-test");
    await new Promise((r) => setTimeout(r, 50));
    expect(chunks.some((c) => c.includes("hello-stream-test"))).toBe(true);
  });

  it("creates a pretty logger without throwing", () => {
    expect(() => createLogger({ pretty: true, level: "silent" })).not.toThrow();
  });

  it("creates a JSON (non-pretty) logger without throwing", () => {
    expect(() => createLogger({ pretty: false, level: "silent" })).not.toThrow();
  });
});

describe("silentLogger", () => {
  it("has level silent", () => {
    expect(silentLogger().level).toBe("silent");
  });
});
