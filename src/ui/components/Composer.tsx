import { useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { Icon } from "./Icon.js";

interface Props {
  onSend: (text: string) => void;
  onSendFile: (file: File) => Promise<void>;
  disabled?: boolean;
}

export function Composer({ onSend, onSendFile, disabled }: Props) {
  const [text, setText] = useState("");
  const [over, setOver] = useState(false);

  function send(): void {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>): Promise<void> {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await onSendFile(file);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) void onSendFile(file);
    e.target.value = "";
  }

  return (
    <div
      className={`flex items-end gap-2 border-t border-line-soft p-3 transition-colors ${
        over ? "bg-accent-50" : "bg-surface"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => void handleDrop(e)}
    >
      <label
        className="btn btn--ghost btn--icon"
        aria-label="Attach file"
        title="Attach file"
      >
        <Icon name="paperclip" size={18} />
        <input
          type="file"
          className="hidden"
          onChange={handleFileInput}
          disabled={disabled}
        />
      </label>
      <textarea
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKey}
        placeholder={disabled ? "Configure an agent to start chatting" : "Type a message..."}
        disabled={disabled}
        className="textarea flex-1"
        style={{ minHeight: 40, maxHeight: 160 }}
      />
      <button
        type="button"
        onClick={send}
        disabled={disabled || text.trim().length === 0}
        className="btn btn--primary btn--icon"
        aria-label="Send message"
        title="Send"
      >
        <Icon name="send" size={18} />
      </button>
    </div>
  );
}
