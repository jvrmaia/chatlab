import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../i18n/index.js";
import i18n from "../i18n/index.js";
import { LocaleToggle } from "./LocaleToggle.js";

describe("LocaleToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    void i18n.changeLanguage("en-US");
  });

  afterEach(() => {
    cleanup();
  });

  test("renders both EN and PT buttons", () => {
    render(<LocaleToggle />);
    expect(screen.getByRole("button", { name: "EN" })).toBeDefined();
    expect(screen.getByRole("button", { name: "PT" })).toBeDefined();
  });

  test("EN is selected by default", () => {
    render(<LocaleToggle />);
    const en = screen.getByRole("button", { name: "EN" });
    expect(en.getAttribute("aria-pressed")).toBe("true");
  });

  test("clicking PT flips selection and persists to localStorage", async () => {
    render(<LocaleToggle />);
    fireEvent.click(screen.getByRole("button", { name: "PT" }));
    // i18next.changeLanguage is async — wait a tick for the language detector to persist.
    await new Promise((r) => setTimeout(r, 0));
    expect(localStorage.getItem("i18nextLng")).toBe("pt-BR");
    const pt = screen.getByRole("button", { name: "PT" });
    expect(pt.getAttribute("aria-pressed")).toBe("true");
  });
});
