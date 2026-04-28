import { useState, type JSX } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        aria-label={theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")}
        title={theme === "dark" ? t("theme.light") : t("theme.dark")}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} />
      </button>
      <select
        className="select"
        style={{ height: 28, fontSize: "var(--fs-xs)", paddingRight: 28 }}
        value={density}
        onChange={(e) => pickDensity(e.target.value as Density)}
        aria-label={t("theme.densityAria")}
      >
        <option value="compact">{t("theme.compact")}</option>
        <option value="cozy">{t("theme.cozy")}</option>
        <option value="comfy">{t("theme.comfy")}</option>
      </select>
    </div>
  );
}
