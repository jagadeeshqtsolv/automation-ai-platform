"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";

type AIProvider = "openai" | "claude";

type ProviderSettings = {
  configured: boolean;
  apiKeyPreview: string | null;
  model: string;
  suggestedModel: string;
};

type AISettings = {
  activeProvider: AIProvider | null;
  openai: ProviderSettings;
  claude: ProviderSettings;
  canEdit: boolean;
};

const PROVIDER_LABELS: Record<AIProvider, string> = {
  openai: "OpenAI",
  claude: "Claude",
};

const PROVIDER_DESCRIPTIONS: Record<AIProvider, string> = {
  openai: "GPT-4.1, GPT-4o, and other OpenAI models.",
  claude: "Claude Sonnet, Opus, and other Anthropic models.",
};

export function ProjectAISettings({
  projectId,
  disabled,
  onSaved,
}: {
  projectId: string;
  disabled: boolean;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [selectedTab, setSelectedTab] = useState<AIProvider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/ai-settings`);
    if (!res.ok) {
      toast.error("Could not load AI settings");
      return;
    }
    const body = (await res.json()) as { ai: AISettings };
    setSettings(body.ai);
    setSelectedTab("openai");
    setModel(body.ai.openai.model);
  }, [projectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleTabChange(tab: AIProvider) {
    setSelectedTab(tab);
    setApiKey("");
    setModel(settings?.[tab].model ?? "");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (settings?.canEdit !== true) return;

    const trimmedKey = apiKey.trim();
    const trimmedModel = model.trim();
    const providerSettings = settings[selectedTab];

    if (!providerSettings.configured && trimmedKey.length === 0) {
      toast.error(`${PROVIDER_LABELS[selectedTab]} API key is required`);
      return;
    }

    setBusy(true);
    try {
      const payload: { provider: AIProvider; apiKey?: string; model?: string | null; setAsActive: boolean } = {
        provider: selectedTab,
        setAsActive: true,
      };
      if (trimmedKey.length > 0) payload.apiKey = trimmedKey;
      payload.model = trimmedModel.length > 0 ? trimmedModel : null;

      const res = await fetch(`/api/projects/${projectId}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not save AI settings"));
        return;
      }
      setApiKey("");
      await load();
      onSaved?.();
      toast.success(`${PROVIDER_LABELS[selectedTab]} saved and set as active provider`);
    } finally {
      setBusy(false);
    }
  }

  async function removeKey() {
    if (settings?.canEdit !== true) return;
    const label = PROVIDER_LABELS[selectedTab];
    const confirmed = window.confirm(
      `Remove the saved ${label} API key? Generation will stop working until you add a key again.`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedTab, apiKey: null }),
      });
      if (!res.ok) {
        toast.error("Could not remove API key");
        return;
      }
      await load();
      toast.success(`${label} API key removed`);
    } finally {
      setBusy(false);
    }
  }

  if (settings === null) {
    return <p className="text-sm text-zinc-400">Loading AI settings…</p>;
  }

  const active = settings.activeProvider;
  const providerSettings = settings[selectedTab];
  const isActive = active === selectedTab;

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-ink-950/30 p-4">
      <div>
        <h3 className="text-sm font-semibold text-white">AI Provider</h3>
        <p className="mt-1 text-xs text-zinc-400">
          Add your OpenAI API key. Used for all test plan, page object, and code generation.
        </p>
      </div>

      {/* Active provider badge */}
      {active !== null && (
        <div className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-2 text-xs text-accent">
          Active provider: <span className="font-semibold">{PROVIDER_LABELS[active]}</span>
          {settings[active].model.length > 0
            ? ` — ${settings[active].model}`
            : ` — ${settings[active].suggestedModel}`}
        </div>
      )}

      {active === null && (
        <div className="ui-alert-error text-sm" role="alert">
          No AI provider configured. Add an API key below to enable test generation.
        </div>
      )}

      {/* Provider tabs — OpenAI only for now */}
      <div className="flex gap-2">
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent"
          data-testid="ai-provider-tab-openai"
        >
          OpenAI
          {settings.openai.configured && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          )}
        </button>
      </div>

      {/* Provider panel */}
      <div className="rounded-lg border border-white/10 p-4 space-y-3">
        <div>
          <p className="text-xs text-zinc-400">{PROVIDER_DESCRIPTIONS[selectedTab]}</p>
        </div>

        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-zinc-500">Status</dt>
            <dd className="mt-0.5 font-medium text-zinc-200">
              {providerSettings.configured
                ? isActive
                  ? "Active & ready"
                  : "Configured (not active)"
                : "Not configured"}
            </dd>
          </div>
          {providerSettings.apiKeyPreview !== null && (
            <div>
              <dt className="text-zinc-500">Saved key</dt>
              <dd className="mt-0.5 font-mono text-zinc-300">{providerSettings.apiKeyPreview}</dd>
            </div>
          )}
          {providerSettings.model.length > 0 && (
            <div>
              <dt className="text-zinc-500">Model</dt>
              <dd className="mt-0.5 font-mono text-zinc-300">{providerSettings.model}</dd>
            </div>
          )}
        </dl>

        {settings.canEdit ? (
          <form onSubmit={onSubmit} className="space-y-3 border-t border-white/10 pt-3" data-testid="ai-settings-form">
            <label className="block text-xs text-zinc-400">
              API key{" "}
              {!providerSettings.configured && (
                <span className="text-rose-300">(required)</span>
              )}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                required={!providerSettings.configured}
                placeholder={
                  providerSettings.configured
                    ? "Leave blank to keep current key"
                    : selectedTab === "openai"
                    ? "sk-…"
                    : "sk-ant-…"
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 font-mono text-sm text-white"
                data-testid="ai-settings-apikey-input"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Model <span className="text-zinc-500">(optional)</span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={providerSettings.suggestedModel}
                maxLength={80}
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white"
                data-testid="ai-settings-model-input"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={disabled || busy}
                className="ui-btn-primary ui-btn-xs disabled:opacity-50"
                data-testid="ai-settings-save-btn"
              >
                {busy ? "Saving…" : `Save & activate ${PROVIDER_LABELS[selectedTab]}`}
              </button>
              {providerSettings.configured && (
                <button
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => void removeKey()}
                  className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                  data-testid="ai-settings-remove-key-btn"
                >
                  Remove saved key
                </button>
              )}
            </div>
          </form>
        ) : (
          <p className="border-t border-white/10 pt-3 text-xs text-zinc-500">
            You need access to this project to configure AI settings.
          </p>
        )}
      </div>
    </div>
  );
}
