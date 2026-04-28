import type { EvalResult } from "./types.js";

function unifiedDiff(a: string, b: string): string {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const lines: string[] = [];
  const maxLen = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < maxLen; i++) {
    const aLine = aLines[i];
    const bLine = bLines[i];
    if (aLine === undefined) {
      lines.push(`+${bLine ?? ""}`);
    } else if (bLine === undefined) {
      lines.push(`-${aLine}`);
    } else if (aLine !== bLine) {
      lines.push(`-${aLine}`);
      lines.push(`+${bLine}`);
    } else {
      lines.push(` ${aLine}`);
    }
  }
  return lines.join("\n");
}

export function buildMarkdownReport(
  results: EvalResult[],
  agentId: string,
  timestamp: string,
  baseline?: Map<string, string>,
): string {
  const sections: string[] = [
    `# Eval report`,
    ``,
    `- **Agent:** \`${agentId}\``,
    `- **Run:** ${timestamp}`,
    ``,
    `---`,
    ``,
  ];

  for (const r of results) {
    sections.push(`## \`${r.id}\``);
    sections.push(``);
    sections.push(`**Prompt:**`);
    sections.push(``);
    sections.push(`> ${r.prompt.replace(/\n/g, "\n> ")}`);
    sections.push(``);
    if (r.agent_version) {
      sections.push(`**Agent version:** \`${r.agent_version}\``);
      sections.push(``);
    }
    if (r.error) {
      sections.push(`**Error:** ${r.error}`);
    } else {
      sections.push(`**Response:**`);
      sections.push(``);
      sections.push("```");
      sections.push(r.response);
      sections.push("```");
      if (baseline) {
        const prev = baseline.get(r.id);
        if (prev === undefined) {
          sections.push(``);
          sections.push(`_No baseline for this prompt._`);
        } else if (prev === r.response) {
          sections.push(``);
          sections.push(`_Response unchanged._`);
        } else {
          sections.push(``);
          sections.push(`**Diff vs baseline:**`);
          sections.push(``);
          sections.push("```diff");
          sections.push(unifiedDiff(prev, r.response));
          sections.push("```");
        }
      }
    }
    sections.push(``);
    sections.push(`---`);
    sections.push(``);
  }

  return sections.join("\n");
}

export function buildJsonReport(
  results: EvalResult[],
  agentId: string,
  timestamp: string,
): string {
  return JSON.stringify({ agent_id: agentId, timestamp, results }, null, 2);
}

export function parseBaselineMap(markdown: string): Map<string, string> {
  const map = new Map<string, string>();
  const codeBlockRe = /^## `([^`]+)`[\s\S]*?```\n([\s\S]*?)\n```/gm;
  let m: RegExpExecArray | null;
  while ((m = codeBlockRe.exec(markdown)) !== null) {
    const id = m[1]!;
    const response = m[2]!;
    map.set(id, response);
  }
  return map;
}

export function summarize(results: EvalResult[], baseline?: Map<string, string>): string {
  const total = results.length;
  const failed = results.filter((r) => r.error).length;
  let changed = 0;
  if (baseline) {
    for (const r of results) {
      if (!r.error && baseline.get(r.id) !== undefined && baseline.get(r.id) !== r.response) {
        changed++;
      }
    }
  }
  const parts: string[] = [`${total} prompt${total !== 1 ? "s" : ""}`];
  if (failed > 0) parts.push(`${failed} failed`);
  if (baseline) parts.push(`${changed} changed`);
  return parts.join(", ");
}
