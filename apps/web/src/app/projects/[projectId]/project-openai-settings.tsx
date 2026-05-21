"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";

type OpenAISettings = {
  configured: boolean;
  apiKeyPreview: string | null;
  model: string;
  suggestedModel: string;
  canEdit: boolean;
};

export function ProjectOpenAISettings({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled: boolean;
}) {
  const toast = useToast();
  const [settings, setSettings] = useState<OpenAISettings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/openai-settings`);
    if (!res.ok) {
      toast.error("Could not load OpenAI settings");
      return;
    }
    const body = (await res.json()) as { openai: OpenAISettings };
    setSettings(body.openai);
    setModel(body.openai.model);
  }, [projectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (settings?.canEdit !== true) {
      return;
    }

    const trimmedKey = apiKey.trim();
    const trimmedModel = model.trim();

    if (!settings.configured && trimmedKey.length === 0) {
      toast.error("OpenAI API key is required");
      return;
    }

    setBusy(true);
    try {
      const payload: { openaiApiKey?: string; openaiModel?: string | null } = {};
      if (trimmedKey.length > 0) {
        payload.openaiApiKey = trimmedKey;
      }
      payload.openaiModel = trimmedModel.length > 0 ? trimmedModel : null;

      const res = await fetch(`/api/projects/${projectId}/openai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not save OpenAI settings"));
        return;
      }
      setApiKey("");
      await load();
      toast.success("OpenAI settings saved");
    } finally {
      setBusy(false);
    }
  }

  async function clearApiKey() {
    if (settings?.canEdit !== true) {
      return;
    }
    const confirmed = window.confirm(
      "Remove the saved OpenAI API key? Test plan, page object, and test generation will stop working until you add a key again.",
    );
    if (!confirmed) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/openai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ openaiApiKey: null }),
      });
      if (!res.ok) {
        toast.error("Could not remove API key");
        return;
      }
      await load();
      toast.success("OpenAI API key removed");
    } finally {
      setBusy(false);
    }
  }

  if (settings === null) {
    return <p className="text-sm text-zinc-400">Loading OpenAI settings…</p>;
  }

  return (
    <div className="space-y-4 rounded-xl border border-white/10 bg-ink-950/30 p-4">
      <div>
        <h3 className="text-sm font-semibold text-white">OpenAI</h3>
        <p className="mt-1 text-xs text-zinc-400">
          Required for test plan, page object, and test generation. Save an API key here for this
          project — server <code className="text-zinc-300">.env</code> keys are not used.
        </p>
      </div>

      {!settings.configured ? (
        <div className="ui-alert-error text-sm" role="alert">
          No API key saved. Add your OpenAI API key below before generating tests.
        </div>
      ) : (
        <div className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-accent">
          API key configured — generation is enabled for this project.
        </div>
      )}

      <dl className="grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-zinc-500">Status</dt>
          <dd className="mt-0.5 font-medium text-zinc-200">
            {settings.configured ? "Ready" : "Not configured"}
          </dd>
        </div>
        {settings.apiKeyPreview !== null ? (
          <div>
            <dt className="text-zinc-500">Saved key</dt>
            <dd className="mt-0.5 font-mono text-zinc-300">{settings.apiKeyPreview}</dd>
          </div>
        ) : null}
        {settings.model.length > 0 ? (
          <div>
            <dt className="text-zinc-500">Model</dt>
            <dd className="mt-0.5 font-mono text-zinc-300">{settings.model}</dd>
          </div>
        ) : null}
      </dl>

      {settings.canEdit ? (
        <form onSubmit={onSubmit} className="space-y-3 border-t border-white/10 pt-3">
          <label className="block text-xs text-zinc-400">
            API key {settings.configured ? "" : <span className="text-rose-300">(required)</span>}
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              required={!settings.configured}
              placeholder={settings.configured ? "Leave blank to keep current key" : "sk-…"}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 font-mono text-sm text-white"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Model <span className="text-zinc-500">(optional)</span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={settings.suggestedModel}
              maxLength={80}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={disabled || busy}
              className="ui-btn-primary ui-btn-xs disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save OpenAI settings"}
            </button>
            {settings.configured ? (
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => void clearApiKey()}
                className="rounded-lg border border-rose-500/30 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
              >
                Remove saved key
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="border-t border-white/10 pt-3 text-xs text-zinc-500">
          You need access to this project to configure OpenAI keys.
        </p>
      )}
    </div>
  );
}
