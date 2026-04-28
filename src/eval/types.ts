export interface GoldenPrompt {
  id: string;
  prompt: string;
  tags?: string[];
}

export interface GoldenSet {
  prompts: GoldenPrompt[];
}

export interface EvalResult {
  id: string;
  prompt: string;
  response: string;
  agent_version: string;
  error?: string;
}

export interface EvalOptions {
  agentId: string;
  inputPath: string;
  outDir: string;
  baselinePath?: string;
  format?: "markdown" | "json";
  /** Base URL of a running chatlab instance (used internally for testing). */
  serverUrl: string;
  token: string;
}
