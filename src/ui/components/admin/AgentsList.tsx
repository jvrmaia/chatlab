import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  createAgent,
  deleteAgent,
  listAgents,
  probeAgent,
  updateAgent,
  UI_PROVIDER_DEFAULTS,
  type UiAgent,
  type UiAgentCreate,
  type UiAgentProvider,
} from "../../api.js";
import { Icon } from "../Icon.js";

interface Props {
  refreshKey: number;
  onChanged: () => void;
}

const PROVIDERS: UiAgentProvider[] = [
  "openai",
  "anthropic",
  "deepseek",
  "gemini",
  "maritaca",
  "ollama",
  "custom",
];

export function AgentsList({ refreshKey, onChanged }: Props) {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<UiAgent[]>([]);
  const [editing, setEditing] = useState<UiAgent | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    void listAgents()
      .then(setAgents)
      .catch((e: Error) => setErr(e.message));
  }, [refreshKey]);

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm(t("agents.deleteConfirm"))) return;
    try {
      await deleteAgent(id);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <section className="card max-w-3xl">
      <header className="card__header">
        <div>
          <h2 className="card__title">{t("agents.title")}</h2>
          <p className="card__subtitle">{t("agents.configuredCount", { count: agents.length })}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setEditing(null);
          }}
          className="btn btn--primary btn--sm"
        >
          <Icon name="plus" size={14} />
          {t("agents.newAgent")}
        </button>
      </header>

      <div className="card__body space-y-3">
        {err && <span className="badge badge--danger">{err}</span>}

        {creating && (
          <AgentForm
            onCancel={() => setCreating(false)}
            onSaved={() => {
              setCreating(false);
              onChanged();
            }}
          />
        )}

        {editing && !creating && (
          <AgentForm
            existing={editing}
            onCancel={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              onChanged();
            }}
          />
        )}

        {agents.length === 0 ? (
          <p className="text-sm text-ink-3">{t("agents.noAgents")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line-soft text-left font-mono text-xs uppercase tracking-wide text-ink-3">
                <th className="py-2">{t("agents.tableName")}</th>
                <th className="py-2">{t("agents.tableProvider")}</th>
                <th className="py-2">{t("agents.tableModel")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <tr key={a.id} className="border-b border-line-soft">
                  <td className="py-2 font-medium">{a.name}</td>
                  <td className="py-2">
                    <span className="badge">{a.provider}</span>
                  </td>
                  <td className="py-2">
                    <span className="badge badge--info">{a.model}</span>
                  </td>
                  <td className="py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => {
                          setEditing(a);
                          setCreating(false);
                        }}
                      >
                        <Icon name="edit" size={14} />
                        {t("common.edit")}
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={() => void handleDelete(a.id)}
                      >
                        <Icon name="trash" size={14} />
                        {t("common.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

interface FormProps {
  existing?: UiAgent;
  onCancel: () => void;
  onSaved: () => void;
}

function AgentForm({ existing, onCancel, onSaved }: FormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(existing?.name ?? "");
  const [provider, setProvider] = useState<UiAgentProvider>(existing?.provider ?? "openai");
  const [model, setModel] = useState(existing?.model ?? UI_PROVIDER_DEFAULTS.openai.model);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(existing?.base_url ?? "");
  const [systemPrompt, setSystemPrompt] = useState(existing?.system_prompt ?? "");
  const [contextWindow, setContextWindow] = useState(existing?.context_window ?? 20);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [probePrompt, setProbePrompt] = useState("Olá!");
  const [probeResult, setProbeResult] = useState<string | null>(null);

  const defaults = UI_PROVIDER_DEFAULTS[provider];

  function onProviderChange(next: UiAgentProvider): void {
    setProvider(next);
    setModel(UI_PROVIDER_DEFAULTS[next].model);
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const payload: UiAgentCreate = {
        name,
        provider,
        model,
        context_window: contextWindow,
      };
      if (apiKey) payload.api_key = apiKey;
      if (baseUrl) payload.base_url = baseUrl;
      if (systemPrompt) payload.system_prompt = systemPrompt;
      if (existing) {
        await updateAgent(existing.id, payload);
      } else {
        await createAgent(payload);
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runProbe(): Promise<void> {
    if (!existing) {
      setErr(t("agents.probeSaveFirst"));
      return;
    }
    setBusy(true);
    setErr(null);
    setProbeResult(null);
    try {
      const r = await probeAgent(existing.id, probePrompt);
      setProbeResult(r.content);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-md border border-line-soft bg-sunken p-3"
    >
      <h3 className="font-medium">{existing ? t("agents.editAgent") : t("agents.newAgent")}</h3>
      {err && <span className="badge badge--danger">{err}</span>}
      <Field label={t("agents.fieldName")}>
        <input
          required
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("agents.fieldNamePlaceholder")}
        />
      </Field>
      <Field label={t("agents.fieldProvider")}>
        <select
          className="select"
          value={provider}
          onChange={(e) => onProviderChange(e.target.value as UiAgentProvider)}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("agents.fieldModel")}>
        <input
          required
          className="input input--mono"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={defaults.model}
        />
      </Field>
      <Field label={defaults.requires_api_key ? t("agents.fieldApiKey") : t("agents.fieldApiKeyOptional")}>
        <input
          type="password"
          className="input"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={
            existing?.api_key
              ? t("agents.apiKeyKept", { masked: existing.api_key })
              : defaults.requires_api_key
                ? t("agents.apiKeyRequired")
                : t("agents.apiKeyLeaveBlank")
          }
        />
      </Field>
      <Field label={t("agents.fieldBaseUrl")}>
        <input
          className="input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={defaults.base_url}
        />
      </Field>
      <Field label={t("agents.fieldSystemPrompt")}>
        <textarea
          rows={3}
          className="textarea"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={t("agents.systemPromptPlaceholder")}
        />
      </Field>
      <div className="field" style={{ flexDirection: "row", alignItems: "center", gap: "var(--sp-3)" }}>
        <span className="field__label">{t("agents.fieldContext")}</span>
        <input
          type="number"
          min={1}
          max={200}
          className="input"
          style={{ width: 80 }}
          value={contextWindow}
          onChange={(e) => setContextWindow(Number(e.target.value))}
        />
        <span className="font-mono text-xs text-ink-3">{t("agents.contextSuffix")}</span>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn btn--primary btn--sm">
          {busy ? t("common.saving") : t("common.save")}
        </button>
        <button type="button" onClick={onCancel} className="btn btn--secondary btn--sm">
          {t("common.cancel")}
        </button>
      </div>

      {existing && (
        <div className="border-t border-line-soft pt-3">
          <h4 className="mb-2 font-medium text-xs uppercase tracking-wide text-ink-3">{t("agents.probeTitle")}</h4>
          <div className="flex gap-2">
            <input
              className="input"
              value={probePrompt}
              onChange={(e) => setProbePrompt(e.target.value)}
            />
            <button
              type="button"
              onClick={() => void runProbe()}
              disabled={busy}
              className="btn btn--secondary btn--sm"
            >
              {busy ? t("common.saving") : t("common.send")}
            </button>
          </div>
          {probeResult !== null && (
            <pre className="mt-2 whitespace-pre-wrap rounded-md border border-line-soft bg-canvas p-2 font-mono text-xs">
              {probeResult}
            </pre>
          )}
        </div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}
