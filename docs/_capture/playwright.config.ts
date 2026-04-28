import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for `npm run docs:capture` — drives the emulator's Web UI to
 * a known state and writes PNGs to `docs/_assets/screenshots/`. Not part of the
 * Vitest test suite. The emulator itself is booted in-process per test file via
 * `docs/_capture/seed.ts`.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  forbidOnly: false,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    colorScheme: "light",
    screenshot: "off",
    video: "off",
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
