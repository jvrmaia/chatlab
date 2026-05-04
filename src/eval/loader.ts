import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { GoldenSet } from "./types.js";

export function loadGoldenSet(path: string): GoldenSet {
  const raw = readFileSync(path, "utf8");
  const parsed = parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`eval: ${path} is not a valid YAML object`);
  }
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj["prompts"])) {
    throw new Error(`eval: ${path} must have a top-level "prompts" array`);
  }
  const prompts = obj["prompts"] as Array<unknown>;
  for (const [i, p] of prompts.entries()) {
    if (!p || typeof p !== "object") {
      throw new Error(`eval: prompts[${i}] must be an object`);
    }
    const entry = p as Record<string, unknown>;
    if (typeof entry["id"] !== "string" || !entry["id"]) {
      throw new Error(`eval: prompts[${i}].id must be a non-empty string`);
    }
    if (typeof entry["prompt"] !== "string" || !entry["prompt"]) {
      throw new Error(`eval: prompts[${i}].prompt must be a non-empty string`);
    }
  }
  return {
    prompts: (prompts as Array<Record<string, unknown>>).map((p) => {
      const entry: import("./types.js").GoldenPrompt = {
        id: p["id"] as string,
        prompt: p["prompt"] as string,
      };
      if (Array.isArray(p["tags"])) entry.tags = p["tags"] as string[];
      return entry;
    }),
  };
}
