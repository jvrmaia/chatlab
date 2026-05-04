import { Router } from "express";
import type { Core } from "../../core/core.js";
import { effectiveBaseUrl, effectiveModel, providerFor } from "../../agents/factory.js";
import { LlmError, type LlmMessage } from "../../agents/provider.js";
import {
  AGENT_PROVIDERS,
  type AgentPatch,
  type AgentProvider,
  publicAgent,
} from "../../types/agent.js";
import { ApiError } from "../error-handler.js";

interface AgentBody {
  name?: unknown;
  provider?: unknown;
  model?: unknown;
  api_key?: unknown;
  base_url?: unknown;
  system_prompt?: unknown;
  context_window?: unknown;
}

export function agentsRouter(core: Core, opts: { agentFetcher?: typeof fetch } = {}): Router {
  const router = Router();

  router.get("/v1/agents", async (_req, res, next) => {
    try {
      const items = await core.storage.agents.list();
      res.json({ data: items.map(publicAgent) });
    } catch (err) {
      next(err);
    }
  });

  router.post("/v1/agents", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as AgentBody;
      const parsed = parseCreate(body);
      const created = await core.storage.agents.create({
        ...parsed,
        workspace_id: core.activeWorkspace().id,
      });
      res.status(201).json(publicAgent(created));
    } catch (err) {
      next(err);
    }
  });

  router.get("/v1/agents/:id", async (req, res, next) => {
    try {
      const agent = await core.storage.agents.get(req.params.id!);
      if (!agent) throw new ApiError(404, 100, `Agent ${req.params.id} not found`);
      res.json(publicAgent(agent));
    } catch (err) {
      next(err);
    }
  });

  router.patch("/v1/agents/:id", async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as AgentBody;
      const patch = parsePatch(body);
      const updated = await core.storage.agents.update(req.params.id!, patch);
      if (!updated) throw new ApiError(404, 100, `Agent ${req.params.id} not found`);
      res.json(publicAgent(updated));
    } catch (err) {
      next(err);
    }
  });

  router.delete("/v1/agents/:id", async (req, res, next) => {
    try {
      const dependent = await core.storage.chats.listByAgent(req.params.id!);
      if (dependent.length > 0) {
        throw new ApiError(
          409,
          1000007,
          `Cannot delete agent ${req.params.id}: ${dependent.length} chat(s) reference it. Delete the chats first.`,
          "ZZ_AGENT_REFERENCED_BY_CHAT",
        );
      }
      const ok = await core.storage.agents.delete(req.params.id!);
      if (!ok) throw new ApiError(404, 100, `Agent ${req.params.id} not found`);
      res.json({ removed: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/v1/agents/:id/probe", async (req, res, next) => {
    try {
      const agent = await core.storage.agents.get(req.params.id!);
      if (!agent) throw new ApiError(404, 100, `Agent ${req.params.id} not found`);
      const body = (req.body ?? {}) as { prompt?: unknown };
      const promptText =
        typeof body.prompt === "string" && body.prompt.trim().length > 0 ? body.prompt : "Hello";
      const messages: LlmMessage[] = [];
      if (agent.system_prompt) messages.push({ role: "system", content: agent.system_prompt });
      messages.push({ role: "user", content: promptText });
      const provider = providerFor(agent.provider);
      try {
        const out = await provider.chat({
          messages,
          model: effectiveModel(agent),
          baseUrl: effectiveBaseUrl(agent),
          ...(agent.api_key ? { apiKey: agent.api_key } : {}),
          temperature: 0.7,
          ...(opts.agentFetcher ? { fetcher: opts.agentFetcher } : {}),
        });
        res.json({ content: out.content });
      } catch (e) {
        if (e instanceof LlmError) {
          throw new ApiError(502, 1000005, e.message, e.subcode);
        }
        throw e;
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}

function parseCreate(body: AgentBody): {
  name: string;
  provider: AgentProvider;
  model: string;
  api_key?: string;
  base_url?: string;
  system_prompt?: string;
  context_window: number;
} {
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    throw new ApiError(400, 100, "`name` is required");
  }
  if (typeof body.provider !== "string" || !AGENT_PROVIDERS.includes(body.provider as AgentProvider)) {
    throw new ApiError(400, 100, `\`provider\` must be one of ${AGENT_PROVIDERS.join("|")}`);
  }
  if (typeof body.model !== "string" || body.model.trim().length === 0) {
    throw new ApiError(400, 100, "`model` is required");
  }
  return {
    name: body.name,
    provider: body.provider as AgentProvider,
    model: body.model,
    ...(typeof body.api_key === "string" ? { api_key: body.api_key } : {}),
    ...(typeof body.base_url === "string" ? { base_url: validateBaseUrl(body.base_url) } : {}),
    ...(typeof body.system_prompt === "string" ? { system_prompt: body.system_prompt } : {}),
    context_window:
      typeof body.context_window === "number" && body.context_window > 0
        ? Math.min(200, Math.floor(body.context_window))
        : 20,
  };
}

function parsePatch(body: AgentBody): AgentPatch {
  const patch: AgentPatch = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.provider === "string") {
    if (!AGENT_PROVIDERS.includes(body.provider as AgentProvider)) {
      throw new ApiError(400, 100, `\`provider\` must be one of ${AGENT_PROVIDERS.join("|")}`);
    }
    patch.provider = body.provider as AgentProvider;
  }
  if (typeof body.model === "string") patch.model = body.model;
  if (typeof body.api_key === "string" && body.api_key.length > 0) patch.api_key = body.api_key;
  if (typeof body.base_url === "string") patch.base_url = validateBaseUrl(body.base_url);
  if (typeof body.system_prompt === "string") patch.system_prompt = body.system_prompt;
  if (typeof body.context_window === "number" && body.context_window > 0) {
    patch.context_window = Math.min(200, Math.floor(body.context_window));
  }
  return patch;
}

// Block SSRF targets: only http/https allowed; cloud metadata services and
// loopback are rejected regardless of deployment context.
const BLOCKED_HOSTS = new Set([
  "169.254.169.254",       // AWS / GCP / Azure IMDS (IMDSv1)
  "100.100.100.200",       // Alibaba Cloud IMDS
  "metadata.google.internal",
  "metadata.goog",
]);

function validateBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, 100, "`base_url` must be a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ApiError(400, 100, "`base_url` must use http or https scheme");
  }
  const host = url.hostname.toLowerCase();
  if (
    BLOCKED_HOSTS.has(host) ||
    host === "localhost" ||
    /^127\./.test(host) ||
    host === "::1" ||
    host === "[::1]"
  ) {
    throw new ApiError(400, 100, "`base_url` host is not permitted");
  }
  return raw;
}
