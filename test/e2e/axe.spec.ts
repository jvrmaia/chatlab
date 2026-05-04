import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startChatlab, type RunningChatlab } from "../../src/index.js";

/**
 * Axe accessibility E2E suite — asserts zero critical/serious violations
 * on the five primary chatlab UI screens.
 *
 * Per ADR 0010 this suite is opt-in: set CHATLAB_TEST_E2E=1 to run.
 * Requires a Playwright Chromium install (`npx playwright install chromium`).
 *
 * Run:
 *   CHATLAB_TEST_E2E=1 npx playwright test --config=test/e2e/playwright.config.ts test/e2e/axe.spec.ts
 */

const enabled = process.env["CHATLAB_TEST_E2E"] === "1";
const TOKEN = "axe-test-token";

test.skip(!enabled, "Axe suite is opt-in via CHATLAB_TEST_E2E=1");
test.describe.configure({ mode: "serial" });

let running: RunningChatlab;
let home: string;
let agentId: string;
let chatId: string;

test.beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), "chatlab-axe-"));
  running = await startChatlab({
    env: { ...process.env, CHATLAB_LOG_LEVEL: "silent", CHATLAB_REQUIRE_TOKEN: TOKEN },
    home,
    host: "127.0.0.1",
    port: 0,
  });

  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };

  const agentResp = await fetch(`${running.url}/v1/agents`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Axe test agent", provider: "ollama", model: "llama3" }),
  });
  agentId = ((await agentResp.json()) as { id: string }).id;

  const chatResp = await fetch(`${running.url}/v1/chats`, {
    method: "POST",
    headers,
    body: JSON.stringify({ agent_id: agentId, theme: "axe test" }),
  });
  chatId = ((await chatResp.json()) as { id: string }).id;
});

test.afterAll(async () => {
  await running.stop();
  try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
});

function uiUrl(path = ""): string {
  return `${running.url}/ui${path}`;
}

async function checkScreen(
  page: import("@playwright/test").Page,
  url: string,
  screenName: string,
): Promise<void> {
  await page.goto(url);
  await page.waitForLoadState("networkidle");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();

  const critical = results.violations.filter((v) => v.impact === "critical");
  const serious = results.violations.filter((v) => v.impact === "serious");

  if (critical.length > 0 || serious.length > 0) {
    const violations = [...critical, ...serious]
      .map((v) => `  [${v.impact}] ${v.id}: ${v.description}\n    ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
      .join("\n");
    throw new Error(`Axe violations on "${screenName}":\n${violations}`);
  }

  expect(critical.length, `${screenName}: critical axe violations`).toBe(0);
  expect(serious.length, `${screenName}: serious axe violations`).toBe(0);
}

test("AXE-01 — empty state (no agent, no chat) has no critical/serious violations", async ({ page }) => {
  await checkScreen(page, uiUrl(), "empty state");
});

test("AXE-02 — workspace picker has no critical/serious violations", async ({ page }) => {
  await page.goto(uiUrl());
  await page.waitForLoadState("networkidle");
  // Trigger workspace dropdown if present
  const workspaceBtn = page.getByRole("button", { name: /workspace/i }).first();
  if (await workspaceBtn.isVisible()) {
    await workspaceBtn.click();
  }
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  const serious = results.violations.filter((v) => v.impact === "serious");
  expect(critical.length, "workspace-picker: critical violations").toBe(0);
  expect(serious.length, "workspace-picker: serious violations").toBe(0);
});

test("AXE-03 — chat view (chat open) has no critical/serious violations", async ({ page }) => {
  await page.goto(uiUrl(`?chat=${chatId}`));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  const serious = results.violations.filter((v) => v.impact === "serious");
  expect(critical.length, "chat-view: critical violations").toBe(0);
  expect(serious.length, "chat-view: serious violations").toBe(0);
});

test("AXE-04 — admin/agents panel has no critical/serious violations", async ({ page }) => {
  await page.goto(uiUrl());
  await page.waitForLoadState("networkidle");
  const adminTab = page.getByRole("tab", { name: /admin|agent/i }).first();
  if (await adminTab.isVisible()) {
    await adminTab.click();
  }
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  const serious = results.violations.filter((v) => v.impact === "serious");
  expect(critical.length, "admin-panel: critical violations").toBe(0);
  expect(serious.length, "admin-panel: serious violations").toBe(0);
});

test("AXE-05 — dev drawer open has no critical/serious violations", async ({ page }) => {
  await page.goto(uiUrl());
  await page.waitForLoadState("networkidle");
  const devBtn = page.getByRole("button", { name: /dev|debug|drawer/i }).first();
  if (await devBtn.isVisible()) {
    await devBtn.click();
    await page.waitForTimeout(300);
  }
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const critical = results.violations.filter((v) => v.impact === "critical");
  const serious = results.violations.filter((v) => v.impact === "serious");
  expect(critical.length, "dev-drawer: critical violations").toBe(0);
  expect(serious.length, "dev-drawer: serious violations").toBe(0);
});
