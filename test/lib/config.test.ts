import { describe, expect, it, vi } from "vitest";
import { resolveConfig } from "../../src/config.js";

describe("config — resolveConfig", () => {
  it("CFG-01 — defaults: host 127.0.0.1, port 4480", () => {
    const cfg = resolveConfig({ argv: [], env: {} });
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.port).toBe(4480);
  });

  it("CFG-02 — env vars override defaults", () => {
    const cfg = resolveConfig({ argv: [], env: { CHATLAB_HOST: "127.0.0.1", CHATLAB_PORT: "9000" } });
    expect(cfg.port).toBe(9000);
  });

  it("CFG-03 — --flag=value form parsed by parseFlags", () => {
    const cfg = resolveConfig({ argv: ["--port=5000", "--host=127.0.0.1"], env: {} });
    expect(cfg.port).toBe(5000);
  });

  it("CFG-04 — --flag value form (space separator) parsed by parseFlags", () => {
    const cfg = resolveConfig({ argv: ["--port", "6000", "--host", "127.0.0.1"], env: {} });
    expect(cfg.port).toBe(6000);
  });

  it("CFG-05 — --flag-only (boolean form) sets flag to 'true'", () => {
    // --log-level followed by another --flag results in logLevel set to "true"
    // which would not be a valid log level but tests the boolean path
    const cfg = resolveConfig({
      argv: ["--log-level", "--host", "127.0.0.1"],
      env: {},
    });
    // When next arg starts with --, current flag is treated as boolean ("true")
    expect(cfg.logLevel).toBe("true" as never);
  });

  it("CFG-06 — CHATLAB_REQUIRE_TOKEN is forwarded", () => {
    const cfg = resolveConfig({ argv: [], env: { CHATLAB_REQUIRE_TOKEN: "secret-token" } });
    expect(cfg.requireToken).toBe("secret-token");
  });

  it("CFG-07 — CHATLAB_HOME and CHATLAB_WORKSPACE_ID are forwarded", () => {
    const cfg = resolveConfig({
      argv: [],
      env: { CHATLAB_HOME: "/tmp/mylab", CHATLAB_WORKSPACE_ID: "ws-abc" },
    });
    expect(cfg.home).toBe("/tmp/mylab");
    expect(cfg.workspaceId).toBe("ws-abc");
  });

  it("CFG-08 — CHATLAB_FEEDBACK_RETENTION_DAYS is parsed", () => {
    const cfg = resolveConfig({ argv: [], env: { CHATLAB_FEEDBACK_RETENTION_DAYS: "30" } });
    expect(cfg.retentionDays).toBe(30);
  });

  it("CFG-09 — non-loopback host without requireToken calls process.exit(78)", () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit(78)");
    });
    try {
      expect(() =>
        resolveConfig({ argv: [], env: { CHATLAB_HOST: "0.0.0.0" } }),
      ).toThrow("process.exit(78)");
      expect(exitSpy).toHaveBeenCalledWith(78);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("CFG-10 — non-loopback host with requireToken does not exit", () => {
    const cfg = resolveConfig({
      argv: [],
      env: { CHATLAB_HOST: "0.0.0.0", CHATLAB_REQUIRE_TOKEN: "tok" },
    });
    expect(cfg.host).toBe("0.0.0.0");
    expect(cfg.requireToken).toBe("tok");
  });

  it("CFG-11 — non-flag argv arg (no leading --) is silently ignored (line 58 false branch)", () => {
    const cfg = resolveConfig({ argv: ["somearg", "--host=127.0.0.1"], env: {} });
    expect(cfg.host).toBe("127.0.0.1");
  });
});
