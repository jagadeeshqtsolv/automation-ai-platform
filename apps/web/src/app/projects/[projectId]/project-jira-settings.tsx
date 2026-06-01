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
    return <p className="text-sm text-slate-500">Loading Jira settings…</p>;
  }

  const isConfigured = config.hasApiToken && !!config.baseUrl && !!config.email;

  return (
    <div className="space-y-4">
      {/* Status */}
      {isConfigured ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-500/8 px-3 py-2 text-xs text-emerald-700">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Connected — {config.email}
          {config.apiTokenPreview && (
            <span className="ml-1 font-mono text-slate-500">{config.apiTokenPreview}</span>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600">
          Not Configured — add your Jira base URL, email, and API token to enable story import.
        </div>
      )}

      {/* Config form */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Configuration</h3>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3" data-testid="jira-settings-form">
          <label className="block text-xs text-slate-500">
            Jira base URL <span className="text-rose-600">(required)</span>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://yourorg.atlassian.net"
              maxLength={500}
              disabled={saving || disabled}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
              data-testid="jira-settings-baseurl-input"
            />
          </label>

          <label className="block text-xs text-slate-500">
            Jira account email <span className="text-rose-600">(required)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourorg.com"
              maxLength={200}
              disabled={saving || disabled}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
              data-testid="jira-settings-email-input"
            />
          </label>

          <label className="block text-xs text-slate-500">
            API token{" "}
            <span className="text-slate-500">
              {config.hasApiToken ? "(leave blank to keep current)" : "(required)"}
            </span>
            {config.apiTokenPreview && (
              <span className="ml-2 font-mono text-[10px] text-slate-500">{config.apiTokenPreview}</span>
            )}
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              autoComplete="off"
              placeholder={config.hasApiToken ? "••••••••" : "Paste Atlassian API token"}
              disabled={saving || disabled}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-sm text-slate-900 disabled:opacity-50"
              data-testid="jira-settings-apitoken-input"
            />
            <span className="mt-1 block text-[10px] text-slate-500">
              Create at{" "}
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-700 underline-offset-2 hover:underline"
                data-testid="jira-settings-apitoken-link"
              >
                id.atlassian.com → Security → API tokens
              </a>
            </span>
          </label>

          <label className="block text-xs text-slate-500">
            Default JQL query{" "}
            <span className="text-slate-500">(optional — pre-filled in Requirements import)</span>
            <input
              value={defaultJql}
              onChange={(e) => setDefaultJql(e.target.value)}
              placeholder='project = MYPROJ AND issuetype = Story AND status != Done ORDER BY created DESC'
              maxLength={500}
              disabled={saving || disabled}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
              data-testid="jira-settings-defaultjql-input"
            />
          </label>

          {!disabled && (
            <button
              type="submit"
              disabled={saving}
              className="ui-btn-primary ui-btn-xs disabled:opacity-50"
              data-testid="jira-settings-save-btn"
            >
              {saving ? <><Spinner />Saving…</> : "Save Jira settings"}
            </button>
          )}
        </form>
      </div>

      {/* Test Connection */}
      {isConfigured && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Test Connection</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Verify the saved credentials can reach your Jira instance.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onTest()}
            disabled={testing || disabled}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
            data-testid="jira-settings-test-btn"
          >
            {testing ? <><Spinner />Testing…</> : "Test Connection"}
          </button>
          {testResult !== null && (
            <div
              role="alert"
              className={`rounded-lg border px-3 py-2 text-xs ${
                testResult.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-600"
              }`}
            >
              {testResult.ok
                ? `✓ Connected successfully${testResult.serverName ? ` as "${testResult.serverName}"` : ""}.`
                : `✗ ${testResult.error ?? "Connection Failed"}`}
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
