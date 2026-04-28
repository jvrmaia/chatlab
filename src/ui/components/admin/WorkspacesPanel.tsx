import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  activateWorkspace,
  createWorkspace,
  deleteWorkspace,
  listWorkspaces,
  type StorageType,
  type UiWorkspace,
} from "../../api.js";
import { Icon } from "../Icon.js";

interface Props {
  refreshKey: number;
  onChanged: () => void;
}

export function WorkspacesPanel({ refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const [workspaces, setWorkspaces] = useState<UiWorkspace[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [nickname, setNickname] = useState("");
  const [storageType, setStorageType] = useState<StorageType>("sqlite");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    void listWorkspaces()
      .then((r) => {
        setWorkspaces(r.data);
        setActiveId(r.active_id);
      })
      .catch((e: Error) => setErr(e.message));
  }, [refreshKey]);

  async function handleCreate(): Promise<void> {
    if (!nickname.trim()) {
      setErr(t("workspaces.validationNickname"));
      return;
    }
    try {
      await createWorkspace({ nickname: nickname.trim(), storage_type: storageType });
      setNickname("");
      setStorageType("sqlite");
      setCreating(false);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function handleActivate(id: string): Promise<void> {
    try {
      await activateWorkspace(id);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function handleDelete(id: string, label: string): Promise<void> {
    const typed = window.prompt(t("workspaces.deletePrompt", { label }));
    if (typed !== label) {
      if (typed !== null) {
        window.alert(t("workspaces.deleteMismatch"));
      }
      return;
    }
    try {
      await deleteWorkspace(id);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <section className="card max-w-3xl">
      <header className="card__header">
        <div>
          <h2 className="card__title">{t("workspaces.title")}</h2>
          <p className="card__subtitle">{t("workspaces.summary", { count: workspaces.length })}</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(!creating)}
          className="btn btn--primary btn--sm"
        >
          <Icon name={creating ? "x" : "plus"} size={14} />
          {creating ? t("common.cancel") : t("workspaces.newWorkspace")}
        </button>
      </header>

      <div className="card__body space-y-3">
        {err && <span className="badge badge--danger">{err}</span>}

        {creating && (
          <div className="space-y-3 rounded-md border border-line-soft bg-sunken p-3">
            <div className="field">
              <span className="field__label">{t("workspaces.fieldNickname")}</span>
              <input
                className="input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t("workspaces.nicknamePlaceholder")}
              />
            </div>
            <div className="field">
              <span className="field__label">{t("workspaces.fieldStorage")}</span>
              <select
                className="select"
                value={storageType}
                onChange={(e) => setStorageType(e.target.value as StorageType)}
              >
                <option value="memory">{t("workspaces.storageMemory")}</option>
                <option value="sqlite">{t("workspaces.storageSqlite")}</option>
                <option value="duckdb">{t("workspaces.storageDuckdb")}</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleCreate()}
                className="btn btn--primary btn--sm"
              >
                {t("common.create")}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="btn btn--secondary btn--sm"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-soft text-left font-mono text-xs uppercase tracking-wide text-ink-3">
              <th className="py-2">{t("workspaces.tableNickname")}</th>
              <th className="py-2">{t("workspaces.tableStorage")}</th>
              <th className="py-2">{t("workspaces.tablePath")}</th>
              <th className="py-2 text-center">{t("workspaces.tableActive")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {workspaces.map((w) => (
              <tr key={w.id} className="border-b border-line-soft">
                <td className="py-2 font-medium">{w.nickname}</td>
                <td className="py-2">
                  <span className="badge">{w.storage_type}</span>
                </td>
                <td className="max-w-[16rem] truncate py-2 font-mono text-xs text-ink-3">
                  {w.storage_path ?? t("workspaces.noPath")}
                </td>
                <td className="py-2 text-center">
                  {activeId === w.id ? (
                    <span
                      className="inline-flex items-center gap-2 text-xs text-success"
                      aria-label={t("workspaces.tableActive")}
                    >
                      <span className="dot dot--active" />
                      {t("workspaces.active")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      onClick={() => void handleActivate(w.id)}
                    >
                      {t("workspaces.activate")}
                    </button>
                  )}
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={() => void handleDelete(w.id, w.nickname)}
                  >
                    <Icon name="trash" size={14} />
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
