import { describe, it, expect } from "vitest";
import { detectUnknownSubcommand } from "../src/cli.js";

describe("detectUnknownSubcommand", () => {
  it("CLI-01 — argv vazio retorna null (iniciar servidor)", () =>
    expect(detectUnknownSubcommand([])).toBeNull());

  it("CLI-02 — flag --port retorna null (iniciar servidor)", () =>
    expect(detectUnknownSubcommand(["--port", "4480"])).toBeNull());

  it("CLI-03 — subcomando 'eval' retorna null (subcomando conhecido)", () =>
    expect(detectUnknownSubcommand(["eval"])).toBeNull());

  it("CLI-04 — subcomando desconhecido retorna o nome", () =>
    expect(detectUnknownSubcommand(["foo"])).toBe("foo"));
});
