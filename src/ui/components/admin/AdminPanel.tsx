import { useState } from "react";
import { AgentsList } from "./AgentsList.js";
import { WorkspacesPanel } from "./WorkspacesPanel.js";

type SubTab = "workspaces" | "agents";

interface Props {
  refreshKey: number;
  bump: () => void;
}

export function AdminPanel({ refreshKey, bump }: Props) {
  const [tab, setTab] = useState<SubTab>("workspaces");

  return (
    <main className="flex flex-1 flex-col bg-canvas">
      <nav className="flex items-center border-b border-line-soft bg-surface px-4 py-2">
        <div className="tabs">
          {(["workspaces", "agents"] as SubTab[]).map((t) => (
            <button
              key={t}
              type="button"
              className="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
            >
              {t === "workspaces" ? "Workspaces" : "Agents"}
            </button>
          ))}
        </div>
      </nav>
      <div className="scroll-area flex-1 p-4">
        {tab === "workspaces" && <WorkspacesPanel refreshKey={refreshKey} onChanged={bump} />}
        {tab === "agents" && <AgentsList refreshKey={refreshKey} onChanged={bump} />}
      </div>
    </main>
  );
}
