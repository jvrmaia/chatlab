import { useEffect, useState } from "react";
import type { UiAgent } from "../api.js";
import { Icon } from "./Icon.js";

const STORAGE_KEY = "chatlab.privacy-ack";

interface Props {
  agents: UiAgent[];
}

function hasCloudAgent(agents: UiAgent[]): boolean {
  return agents.some((a) => a.provider !== "ollama");
}

export function PrivacyBanner({ agents }: Props): JSX.Element | null {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!dismissed) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // sessionStorage unavailable — banner will show again next render
    }
  }, [dismissed]);

  if (dismissed || !hasCloudAgent(agents)) return null;

  return (
    <div
      role="alert"
      className="flex items-center gap-2 border-b border-line-soft bg-warn-bg px-4 py-2 text-xs text-warn"
    >
      <Icon name="alert" size={14} />
      <span className="flex-1">
        Conversations are sent in cleartext to the configured provider. Don't use real personal
        data without redaction.
      </span>
      <button
        type="button"
        className="btn btn--ghost btn--icon btn--sm"
        aria-label="Dismiss privacy notice for this session"
        title="Dismiss"
        onClick={() => setDismissed(true)}
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}
