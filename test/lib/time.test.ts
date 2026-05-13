import { afterEach, describe, expect, it } from "vitest";
import {
  advanceClock,
  freezeClock,
  now,
  nowEpochSeconds,
  nowIso,
  unfreezeClock,
} from "../../src/lib/time.js";

describe("lib/time", () => {
  afterEach(() => {
    unfreezeClock();
  });

  it("TIME-01 — now() returns a number within real Date.now() range", () => {
    const before = Date.now();
    const t = now();
    const after = Date.now();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  it("TIME-02 — nowIso() returns a valid ISO-8601 string", () => {
    const iso = nowIso();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(iso).toISOString()).toBe(iso);
  });

  it("TIME-03 — nowEpochSeconds() returns floor(now()/1000) as string", () => {
    freezeClock(1_700_000_000_000);
    expect(nowEpochSeconds()).toBe("1700000000");
  });

  it("TIME-04 — freezeClock() pins now() to the given epoch ms", () => {
    freezeClock(1_234_567);
    expect(now()).toBe(1_234_567);
    expect(now()).toBe(1_234_567);
  });

  it("TIME-05 — freezeClock() is reflected in nowIso()", () => {
    const fixed = 0; // 1970-01-01T00:00:00.000Z
    freezeClock(fixed);
    expect(nowIso()).toBe("1970-01-01T00:00:00.000Z");
  });

  it("TIME-06 — advanceClock() increments from a frozen point", () => {
    freezeClock(1_000_000);
    advanceClock(500);
    expect(now()).toBe(1_000_500);
    advanceClock(250);
    expect(now()).toBe(1_000_750);
  });

  it("TIME-07 — advanceClock() on unfrozen clock starts from near-real-time", () => {
    const before = Date.now();
    advanceClock(10_000);
    expect(now()).toBeGreaterThanOrEqual(before + 10_000);
  });

  it("TIME-08 — unfreezeClock() resumes real time", () => {
    freezeClock(0);
    expect(now()).toBe(0);
    unfreezeClock();
    expect(now()).toBeGreaterThan(0);
  });
});
