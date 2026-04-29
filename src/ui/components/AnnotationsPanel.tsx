import { useEffect, useState } from "react";
import { getAnnotation, setAnnotation } from "../api.js";
import { Icon } from "./Icon.js";
import { MarkdownContent } from "./MarkdownContent.js";

interface Props {
  chatId: string;
}

type Mode = "edit" | "preview";

export function AnnotationsPanel({ chatId }: Props) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<Mode>("edit");

  useEffect(() => {
    setBody("");
    setSavedAt(null);
    setDirty(false);
    setMode("edit");
    void getAnnotation(chatId)
      .then((ann) => {
        setBody(ann.body);
        setSavedAt(ann.updated_at);
      })
      .catch(() => undefined);
  }, [chatId]);

  async function save(): Promise<void> {
    const ann = await setAnnotation(chatId, body);
    setSavedAt(ann.updated_at);
    setDirty(false);
  }

  function switchMode(next: Mode): void {
    if (next === mode) return;
    if (next === "preview" && dirty) {
      // Persist before previewing so the rendered body matches the saved one.
      void save().catch(console.error);
    }
    setMode(next);
  }

  return (
    <div className="border-t border-line-soft bg-surface">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-sunken"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="chatlab-annotations-body"
      >
        <span className="inline-flex items-center gap-2 text-ink-2">
          <Icon name="pin" size={14} />
          📝 chat notes
          {dirty && <span className="badge badge--warn">unsaved</span>}
        </span>
        <Icon name="arrowRight" size={12} style={{ transform: open ? "rotate(90deg)" : "none" }} />
      </button>
      {open && (
        <div id="chatlab-annotations-body" className="space-y-2 px-3 pb-3">
          <div className="flex items-center justify-between">
            <div className="tabs" role="tablist" aria-label="Chat notes mode">
              <button
                type="button"
                className="tab"
                role="tab"
                aria-selected={mode === "edit"}
                onClick={() => switchMode("edit")}
              >
                <Icon name="edit" size={12} />
                Edit
              </button>
              <button
                type="button"
                className="tab"
                role="tab"
                aria-selected={mode === "preview"}
                onClick={() => switchMode("preview")}
              >
                <Icon name="panel" size={12} />
                Preview
              </button>
            </div>
          </div>

          {mode === "edit" ? (
            <textarea
              className="textarea"
              rows={4}
              placeholder="Markdown notes about this chat..."
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setDirty(true);
              }}
              onBlur={() => {
                if (dirty) void save().catch(console.error);
              }}
            />
          ) : (
            <div
              className="rounded-md border border-line-soft bg-canvas px-3 py-2 text-sm"
              style={{ minHeight: 80 }}
            >
              {body.trim() ? (
                <MarkdownContent content={body} />
              ) : (
                <span className="font-mono text-xs text-ink-3">nothing to preview yet</span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between font-mono text-[10px] text-ink-3">
            <span>{savedAt ? `saved at ${new Date(savedAt).toLocaleString()}` : "no notes yet"}</span>
            <button
              type="button"
              onClick={() => void save().catch(console.error)}
              className="btn btn--secondary btn--sm"
              disabled={!dirty}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
