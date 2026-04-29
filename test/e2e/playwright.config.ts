import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the optional E2E regression suite.
 *
 * The suite is **opt-in**: it only runs when `CHATLAB_TEST_E2E=1` is set in
 * the environment. The default `npm test` (Vitest) does not include it.
 *
 * Run locally:
 *   CHATLAB_TEST_E2E=1 npx playwright test --config=test/e2e/playwright.config.ts
 *
 * Per ADR 0010, browser regression is intentionally outside the default test
 * tier in v1.0 — this config exists as the v1.1 entry point.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    colorScheme: "light",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
