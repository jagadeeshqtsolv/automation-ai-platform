"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";

type JiraConfig = {
  baseUrl: string | null;
  email: string | null;
  hasApiToken: boolean;
  apiTokenPreview: string | null;
  defaultJql: string | null;
};

export function ProjectJiraSettings({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled: boolean;
}) {
  const toast = useToast();
  const [config, setConfig] = useState<JiraConfig | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [defaultJql, setDefaultJql] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; serverName?: string; error?: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/jira-config`);
    if (!res.ok) return;
    const body = (await res.json()) as { jira: JiraConfig };
    setConfig(body.jira);
    setBaseUrl(body.jira.baseUrl ?? "");
    setEmail(body.jira.email ?? "");
    setDefaultJql(body.jira.defaultJql ?? "");
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      const payload: Record<string, string | null> = {
        baseUrl: baseUrl.trim() || null,
        email: email.trim() || null,
        defaultJql: defaultJql.trim() || null,
      };
      if (apiToken.trim().length > 0) payload.apiToken = apiToken.trim();

      const res = await fetch(`/api/projects/${projectId}/jira-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not save Jira settings"));
        return;
      }
      setApiToken("");
      await load();
      toast.success("Jira settings saved");
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/jira-config/test`, { method: "POST" });
      const body = (await res.json()) as { ok: boolean; serverName?: string; error?: string };
      setTestResult(body);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  if (config === null) {
    return <p className="text-sm text-zinc-400">Loading Jira settings…</p>;
  }

  const isConfigured = config.hasApiToken && !!config.baseUrl && !!config.email;

  return (
    <div className="space-y-4">
      {/* Status */}
      {isConfigured ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-300">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Connected — {config.email}
          {config.apiTokenPreview && (
            <span className="ml-1 font-mono text-zinc-500">{config.apiTokenPreview}</span>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Not configured — add your Jira base URL, email, and API token to enable story import.
        </div>
      )}

      {/* Config form */}
      <div className="rounded-xl border border-white/10 bg-ink-950/30 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-white">Configuration</h3>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
          <label className="block text-xs text-zinc-400">
            Jira base URL <span className="text-rose-300">(required)</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://yourorg.atlassian.net"
              maxLength={500}
              disabled={saving || disabled}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
            />
          </label>

          <label className="block text-xs text-zinc-400">
            Jira account email <span className="text-rose-300">(required)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourorg.com"
              maxLength={200}
              disabled={saving || disabled}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
            />
          </label>

          <label className="block text-xs text-zinc-400">
            API token{" "}
            <span className="text-zinc-500">
              {config.hasApiToken ? "(leave blank to keep current)" : "(required)"}
            </span>
            {config.apiTokenPreview && (
              <span className="ml-2 font-mono text-[10px] text-zinc-500">{config.apiTokenPreview}</span>
            )}
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              autoComplete="off"
              placeholder={config.hasApiToken ? "••••••••" : "Paste Atlassian API token"}
              disabled={saving || disabled}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 font-mono text-sm text-white disabled:opacity-50"
            />
            <span className="mt-1 block text-[10px] text-zinc-500">
              Create at{" "}
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                id.atlassian.com → Security → API tokens
              </a>
            </span>
          </label>

          <label className="block text-xs text-zinc-400">
            Default JQL query{" "}
            <span className="text-zinc-500">(optional — pre-filled in Requirements import)</span>
            <input
              value={defaultJql}
              onChange={(e) => setDefaultJql(e.target.value)}
              placeholder='project = MYPROJ AND issuetype = Story AND status != Done ORDER BY created DESC'
              maxLength={500}
              disabled={saving || disabled}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
            />
          </label>

          {!disabled && (
            <button
              type="submit"
              disabled={saving}
              className="ui-btn-primary ui-btn-xs disabled:opacity-50"
            >
              {saving ? <><Spinner />Saving…</> : "Save Jira settings"}
            </button>
          )}
        </form>
      </div>

      {/* Test connection */}
      {isConfigured && (
        <div className="rounded-xl border border-white/10 bg-ink-950/30 p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Test Connection</h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              Verify the saved credentials can reach your Jira instance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onTest()}
            disabled={testing || disabled}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.07] disabled:opacity-50 transition"
          >
            {testing ? <><Spinner />Testing…</> : "Test connection"}
          </button>
          {testResult !== null && (
            <div
              role="alert"
              className={`rounded-lg border px-3 py-2 text-xs ${
                testResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-300"
              }`}
            >
              {testResult.ok
                ? `✓ Connected successfully${testResult.serverName ? ` as "${testResult.serverName}"` : ""}.`
                : `✗ ${testResult.error ?? "Connection failed"}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/20 border-t-current" />
  );
}
