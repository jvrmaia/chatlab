import { useState } from "react";
import {
  applyDensity,
  applyTheme,
  readStoredDensity,
  readStoredTheme,
  type Density,
  type Theme,
} from "../theme.js";
import { Icon } from "./Icon.js";

export function ThemeToggle(): JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const [density, setDensity] = useState<Density>(() => readStoredDensity());

  function toggleTheme(): void {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }

  function pickDensity(d: Density): void {
    applyDensity(d);
    setDensity(d);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn btn--ghost btn--icon btn--sm"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        title={theme === "dark" ? "Light" : "Dark"}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} />
      </button>
      <select
        className="select"
        style={{ height: 28, fontSize: "var(--fs-xs)", paddingRight: 28 }}
        value={density}
        onChange={(e) => pickDensity(e.target.value as Density)}
        aria-label="UI density"
      >
        <option value="compact">Compact</option>
        <option value="cozy">Cozy</option>
        <option value="comfy">Comfy</option>
      </select>
    </div>
  );
}
