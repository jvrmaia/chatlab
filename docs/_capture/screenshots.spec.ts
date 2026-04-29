import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { bootSeeded, type SeededChatlab } from "./seed.js";

const OUT_DIR = join(process.cwd(), "docs/_assets/screenshots");
mkdirSync(OUT_DIR, { recursive: true });

function shot(name: string): string {
  return join(OUT_DIR, `${name}.png`);
}

test.describe.configure({ mode: "serial" });

async function settle(page: Page, ms = 250): Promise<void> {
  await page.waitForTimeout(ms);
}

test("01-empty-ui — Chats tab on a fresh boot, no agents yet", async ({ page }) => {
  let cl: SeededChatlab | null = null;
  try {
    cl = await bootSeeded("empty");
    await page.goto(`${cl.url}/ui`);
    await page.getByRole("button", { name: "Chats" }).waitFor();
    await settle(page);
    await page.screenshot({ path: shot("01-empty-ui") });
  } finally {
    await cl?.stop();
  }
});

test("02-admin-workspaces — workspace list with multiple backends", async ({ page }) => {
  let cl: SeededChatlab | null = null;
  try {
    cl = await bootSeeded("with-multiple-workspaces");
    await page.goto(`${cl.url}/ui`);
    await page.getByRole("button", { name: "Admin" }).click();
    // wait for the table row to render (matches <td>experiment-1</td>, not the dropdown option)
    await page.locator("td", { hasText: "experiment-1" }).waitFor();
    await settle(page);
    await page.screenshot({ path: shot("02-admin-workspaces") });
  } finally {
    await cl?.stop();
  }
});

test("03-admin-agents — agent list with two profiles, masked keys", async ({ page }) => {
  let cl: SeededChatlab | null = null;
  try {
    cl = await bootSeeded("with-agent");
    await page.goto(`${cl.url}/ui`);
    await page.getByRole("button", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Agents" }).click();
    await page.getByText("OpenAI gpt-4o").first().waitFor();
    await settle(page);
    await page.screenshot({ path: shot("03-admin-agents") });
  } finally {
    await cl?.stop();
  }
});

test("04-agent-form — new agent form with provider dropdown", async ({ page }) => {
  let cl: SeededChatlab | null = null;
  try {
    cl = await bootSeeded("empty");
    await page.goto(`${cl.url}/ui`);
    await page.getByRole("button", { name: "Admin" }).click();
    await page.getByRole("button", { name: "Agents" }).click();
    await page.getByRole("button", { name: "New agent" }).click();
    await page.getByPlaceholder("e.g., Support GPT-4o").waitFor();
    await page.getByPlaceholder("e.g., Support GPT-4o").fill("OpenAI gpt-4o");
    await page.locator("textarea").first().fill("Você é um atendente cordial em português brasileiro.");
    await settle(page);
    await page.screenshot({ path: shot("04-agent-form") });
  } finally {
    await cl?.stop();
  }
});

test("05-new-chat-form — picking agent + theme to start a chat", async ({ page }) => {
  let cl: SeededChatlab | null = null;
  try {
    cl = await bootSeeded("with-agent");
    await page.goto(`${cl.url}/ui`);
    // Already on Chats tab; click "+" in the sidebar
    await page.getByLabel("New chat").click();
    await page.getByPlaceholder("e.g., learning Python").waitFor();
    await page.getByPlaceholder("e.g., learning Python").fill("Aprendendo Python");
    await settle(page);
    await page.screenshot({
      path: shot("05-new-chat-form"),
      clip: { x: 0, y: 0, width: 320, height: 600 },
    });
  } finally {
    await cl?.stop();
  }
});

test("06-chat-view — chat with user + assistant messages", async ({ page }) => {
  let cl: SeededChatlab | null = null;
  try {
    cl = await bootSeeded("with-messages");
    await page.goto(`${cl.url}/ui`);
    await page.getByText("Aprendendo Python").first().click();
    await page.getByText(/recomendo aprender/).first().waitFor();
    await settle(page);
    await page.screenshot({ path: shot("06-chat-view") });
  } finally {
    await cl?.stop();
  }
});

test("07-feedback — rating shown on assistant bubble", async ({ page }) => {
  let cl: SeededChatlab | null = null;
  try {
    cl = await bootSeeded("with-feedback");
    await page.goto(`${cl.url}/ui`);
    await page.getByText("Aprendendo Python").first().click();
    await page.getByText(/recomendo aprender/).first().waitFor();
    await settle(page);
    await page.screenshot({ path: shot("07-feedback") });
  } finally {
    await cl?.stop();
  }
});
