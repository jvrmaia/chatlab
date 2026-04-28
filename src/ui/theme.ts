export type Theme = "light" | "dark";
export type Density = "compact" | "cozy" | "comfy";

const THEME_KEY = "chatlab.theme";
const DENSITY_KEY = "chatlab.density";

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage unavailable
  }
}

export function readStoredTheme(): Theme {
  const t = safeRead(THEME_KEY);
  if (t === "light" || t === "dark") return t;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function readStoredDensity(): Density {
  const d = safeRead(DENSITY_KEY);
  if (d === "compact" || d === "cozy" || d === "comfy") return d;
  return "cozy";
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  safeWrite(THEME_KEY, theme);
}

export function applyDensity(density: Density): void {
  document.documentElement.setAttribute("data-density", density);
  safeWrite(DENSITY_KEY, density);
}
