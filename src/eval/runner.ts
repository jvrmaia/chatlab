import type { EvalOptions, EvalResult, GoldenPrompt } from "./types.js";

const POLL_INTERVAL_MS = 200;
const POLL_TIMEOUT_MS = 60_000;

async function apiCall(
  serverUrl: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${serverUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function runSinglePrompt(
  opts: EvalOptions,
  entry: GoldenPrompt,
): Promise<EvalResult> {
  const { serverUrl, token, agentId } = opts;

  const chatResp = await apiCall(serverUrl, token, "POST", "/v1/chats", {
    agent_id: agentId,
    theme: `eval-${entry.id}`,
  });
  if (!chatResp.ok) {
    throw new Error(`eval: failed to create chat for prompt "${entry.id}": ${chatResp.status}`);
  }
  const chat = (await chatResp.json()) as { id: string };

  const msgResp = await apiCall(serverUrl, token, "POST", `/v1/chats/${chat.id}/messages`, {
    content: entry.prompt,
  });
  if (!msgResp.ok) {
    throw new Error(`eval: failed to send message for prompt "${entry.id}": ${msgResp.status}`);
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const listResp = await apiCall(serverUrl, token, "GET", `/v1/chats/${chat.id}/messages`);
    if (!listResp.ok) continue;
    const data = (await listResp.json()) as {
      data: Array<{ role: string; content: string; agent_version?: string; status?: string }>;
    };
    const assistant = data.data.find((m) => m.role === "assistant");
    if (assistant) {
      if (assistant.status === "error") {
        return { id: entry.id, prompt: entry.prompt, response: "", agent_version: "", error: assistant.content };
      }
      return {
        id: entry.id,
        prompt: entry.prompt,
        response: assistant.content,
        agent_version: assistant.agent_version ?? "",
      };
    }
  }
  return { id: entry.id, prompt: entry.prompt, response: "", agent_version: "", error: "timeout waiting for assistant reply" };
}

export async function runEval(
  prompts: GoldenPrompt[],
  opts: EvalOptions,
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const entry of prompts) {
    try {
      results.push(await runSinglePrompt(opts, entry));
    } catch (err) {
      results.push({
        id: entry.id,
        prompt: entry.prompt,
        response: "",
        agent_version: "",
        error: (err as Error).message,
      });
    }
  }
  return results;
}
