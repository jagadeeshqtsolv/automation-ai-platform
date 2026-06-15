"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/toast-provider";
import type { ExecutionConfig, ProjectPlatformType } from "@jagadeeshqtsolv/core";
import { testConfigFileName } from "@/lib/test-framework";
import { readApiError } from "@/lib/api-response";

type SecretsInfo = {
  browserstackAccessKeyConfigured: boolean;
  browserstackAccessKeyPreview: string | null;
};

type CiInfo = {
  hasCiToken: boolean;
  ciTokenPreview: string | null;
  workflowFile: string;
};

type CiRunConfigResponse = {
  reportEmails?: string;
};

type ConfigResponse = {
  config: ExecutionConfig;
  secrets: SecretsInfo;
  ciRunConfig?: CiRunConfigResponse;
};

type Provider = "browserstack" | "github-ci";

export function ProjectExecutionSettings({
  projectId,
  platformType = "mobile",
  disabled,
}: {
  projectId: string;
  platformType?: ProjectPlatformType;
  disabled: boolean;
}) {
  const toast = useToast();
  const configLabel = testConfigFileName(platformType);

  const [loaded, setLoaded] = useState(false);
  const [response, setResponse] = useState<ConfigResponse | null>(null);
  const [provider, setProvider] = useState<Provider>("browserstack");
  const [ciInfo, setCiInfo] = useState<CiInfo | null>(null);
  const [ciToken, setCiToken] = useState("");
  const [workflowFile, setWorkflowFile] = useState("run-tests.yml");
  const [reportEmails, setReportEmails] = useState("");
  const [savingCi, setSavingCi] = useState(false);

  // BrowserStack fields — shared
  const [bsUsername, setBsUsername] = useState("");
  const [bsAccessKey, setBsAccessKey] = useState("");
  // BrowserStack web-only
  const [bsBrowser, setBsBrowser] = useState<"chrome" | "firefox" | "edge" | "safari">("chrome");
  const [bsBrowserVersion, setBsBrowserVersion] = useState("latest");
  const [bsOs, setBsOs] = useState<"Windows" | "OS X">("Windows");
  const [bsOsVersion, setBsOsVersion] = useState("11");
  // BrowserStack mobile-only
  const [bsDeviceName, setBsDeviceName] = useState("");
  const [bsAppUrl, setBsAppUrl] = useState("");

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; plan?: string; parallelSessions?: number; error?: string } | null>(null);

  const load = useCallback(async () => {
    const [execRes, gitRes] = await Promise.all([
      fetch(`/api/projects/${projectId}/execution-config`),
      fetch(`/api/projects/${projectId}/git-config`),
    ]);
    if (!execRes.ok) return;
    const body = (await execRes.json()) as ConfigResponse;
    setResponse(body);
    const p: Provider = body.config.provider === "browserstack" ? "browserstack" : "browserstack";
    setProvider(p);
    if (body.config.browserstack) {
      const bs = body.config.browserstack;
      setBsUsername(bs.username ?? "");
      setBsBrowser((bs.browser as typeof bsBrowser) ?? "chrome");
      setBsBrowserVersion(bs.browserVersion ?? "latest");
      setBsOs((bs.os as typeof bsOs) ?? "Windows");
      setBsOsVersion(bs.osVersion ?? (bs.os === "OS X" ? "Sonoma" : "11"));
      setBsDeviceName(bs.deviceName ?? "");
      setBsAppUrl(bs.appUrl ?? "");
    }
    if (body.ciRunConfig?.reportEmails !== undefined) {
      setReportEmails(body.ciRunConfig.reportEmails);
    }
    if (gitRes.ok) {
      const gitBody = (await gitRes.json()) as {
        ciConfig: { hasCiToken: boolean; ciTokenPreview: string | null; workflowFile: string } | null;
      };
      if (gitBody.ciConfig) {
        setCiInfo(gitBody.ciConfig);
        setWorkflowFile(gitBody.ciConfig.workflowFile);
        if (gitBody.ciConfig.hasCiToken) {
          setProvider("github-ci");
        }
      }
    }
    setLoaded(true);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onTestBrowserStack() {
    setTesting(true);
    setTestResult(null);
    try {
      const body: Record<string, string> = {};
      if (bsUsername.trim()) body.username = bsUsername.trim();
      if (bsAccessKey.trim()) body.accessKey = bsAccessKey.trim();

      const res = await fetch(`/api/projects/${projectId}/execution-config/test-browserstack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await res.json()) as typeof testResult;
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  async function onSaveGithubCi(e: FormEvent) {
    e.preventDefault();
    setSavingCi(true);
    try {
      // Save token + workflow file
      const payload: Record<string, string | null> = {
        gitWorkflowFile: workflowFile.trim() || "run-tests.yml",
      };
      if (ciToken.trim().length > 0) payload.gitCiToken = ciToken.trim();
      const res = await fetch(`/api/projects/${projectId}/git-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not save GitHub CI settings"));
        return;
      }

      // Save reportEmails as part of ciRunConfig
      await fetch(`/api/projects/${projectId}/execution-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: response?.config ?? { provider: "local" },
          ciRunConfig: { reportEmails: reportEmails.trim() },
        }),
      });

      setCiToken("");
      await load();
      toast.success("GitHub CI settings saved");
    } finally {
      setSavingCi(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      type SavePayload = {
        config: ExecutionConfig;
        browserstackAccessKey?: string | null;
      };

      const payload: SavePayload =
        provider === "browserstack"
          ? {
              config: {
                provider: "browserstack",
                browserstack: platformType === "web"
                  ? {
                      username: bsUsername.trim(),
                      browser: bsBrowser,
                      browserVersion: bsBrowserVersion.trim() || "latest",
                      os: bsOs,
                      osVersion: bsOsVersion.trim() || (bsOs === "OS X" ? "Sonoma" : "11"),
                    }
                  : {
                      username: bsUsername.trim(),
                      ...(bsDeviceName.trim() ? { deviceName: bsDeviceName.trim() } : {}),
                      ...(bsOsVersion.trim() ? { osVersion: bsOsVersion.trim() } : {}),
                      ...(bsAppUrl.trim() ? { appUrl: bsAppUrl.trim() } : {}),
                    },
              },
              ...(bsAccessKey.trim().length > 0 ? { browserstackAccessKey: bsAccessKey.trim() } : {}),
            }
          : { config: { provider: "browserstack" as const } };

      const res = await fetch(`/api/projects/${projectId}/execution-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        toast.error(await readApiError(res, "Could not save execution settings"));
        return;
      }

      setBsAccessKey("");
      setTestResult(null);
      await load();
      toast.success("Execution settings saved");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <p className="text-sm text-slate-500">Loading execution settings…</p>;
  }

  return (
    <>
    <form onSubmit={(e) => void onSave(e)} className="space-y-4" data-testid="execution-settings-form">
      {/* Provider picker */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">Execution Provider</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <ProviderCard
            active={provider === "browserstack"}
            disabled={disabled || saving}
            onClick={() => setProvider("browserstack")}
            title="BrowserStack"
            testId="execution-provider-browserstack-btn"
            description={
              platformType === "mobile"
                ? "Run tests on BrowserStack real devices and emulators via the cloud"
                : "Run tests on BrowserStack Automate across browsers via the cloud"
            }
          />
          {platformType === "web" && (
            <ProviderCard
              active={provider === "github-ci"}
              disabled={disabled || saving}
              onClick={() => setProvider("github-ci")}
              title="GitHub CI"
              testId="execution-provider-github-ci-btn"
              description="Trigger a GitHub Actions workflow_dispatch — tests run on your own CI runners"
            />
          )}
        </div>
      </div>

      {/* BrowserStack config */}
      {provider === "browserstack" && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">BrowserStack settings</h3>
            {response?.secrets.browserstackAccessKeyConfigured && (
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-700">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Access Key saved
                {response.secrets.browserstackAccessKeyPreview && (
                  <span className="font-mono text-slate-500">{response.secrets.browserstackAccessKeyPreview}</span>
                )}
              </span>
            )}
          </div>

          {/* Credentials — same for web and mobile */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-slate-500">
              Username <span className="text-rose-600">(required)</span>
              <input
                value={bsUsername}
                onChange={(e) => setBsUsername(e.target.value)}
                required
                placeholder="your-bs-username"
                disabled={disabled || saving}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
                data-testid="execution-bs-username-input"
              />
            </label>
            <label className="block text-xs text-slate-500">
              Access Key{" "}
              <span className="text-slate-500">
                {response?.secrets.browserstackAccessKeyConfigured
                  ? "(leave blank to keep current)"
                  : "(required)"}
              </span>
              <input
                type="password"
                value={bsAccessKey}
                onChange={(e) => setBsAccessKey(e.target.value)}
                autoComplete="off"
                placeholder={response?.secrets.browserstackAccessKeyConfigured ? "••••••••" : "Your access key"}
                disabled={disabled || saving}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-sm text-slate-900 disabled:opacity-50"
                data-testid="execution-bs-accesskey-input"
              />
            </label>
          </div>

          {/* Web-specific fields */}
          {platformType === "web" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-slate-500">
                  Browser
                  <select
                    value={bsBrowser}
                    onChange={(e) => setBsBrowser(e.target.value as typeof bsBrowser)}
                    disabled={disabled || saving}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
                  >
                    <option value="chrome">Chrome</option>
                    <option value="firefox">Firefox</option>
                    <option value="edge">Edge</option>
                    <option value="safari">Safari</option>
                  </select>
                </label>
                <label className="block text-xs text-slate-500">
                  Browser version
                  <input
                    value={bsBrowserVersion}
                    onChange={(e) => setBsBrowserVersion(e.target.value)}
                    placeholder="latest"
                    disabled={disabled || saving}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-slate-500">
                  Operating system
                  <select
                    value={bsOs}
                    onChange={(e) => {
                      const next = e.target.value as typeof bsOs;
                      setBsOs(next);
                      setBsOsVersion(next === "OS X" ? "Sonoma" : "11");
                    }}
                    disabled={disabled || saving}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
                  >
                    <option value="Windows">Windows</option>
                    <option value="OS X">macOS</option>
                  </select>
                </label>
                <label className="block text-xs text-slate-500">
                  OS version
                  <select
                    value={bsOsVersion}
                    onChange={(e) => setBsOsVersion(e.target.value)}
                    disabled={disabled || saving}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
                  >
                    {bsOs === "Windows" ? (
                      <>
                        <option value="11">Windows 11</option>
                        <option value="10">Windows 10</option>
                        <option value="8.1">Windows 8.1</option>
                      </>
                    ) : (
                      <>
                        <option value="Sonoma">macOS Sonoma</option>
                        <option value="Ventura">macOS Ventura</option>
                        <option value="Monterey">macOS Monterey</option>
                        <option value="Big Sur">macOS Big Sur</option>
                      </>
                    )}
                  </select>
                </label>
              </div>
              <p className="text-[11px] text-slate-500">
                AutomationAI will generate <code className="text-slate-600">browserstack.yml</code> and a{" "}
                <code className="text-slate-600">test:bs</code> script. Run{" "}
                <code className="rounded bg-slate-50 px-1 text-slate-600">npm run test:bs</code> from the
                framework folder to execute on BrowserStack.
              </p>
            </>
          )}

          {/* Mobile-specific fields */}
          {platformType === "mobile" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-slate-500">
                  Device name
                  <input
                    value={bsDeviceName}
                    onChange={(e) => setBsDeviceName(e.target.value)}
                    placeholder="iPhone 14"
                    disabled={disabled || saving}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
                  />
                </label>
                <label className="block text-xs text-slate-500">
                  OS version
                  <input
                    value={bsOsVersion}
                    onChange={(e) => setBsOsVersion(e.target.value)}
                    placeholder="16"
                    disabled={disabled || saving}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
                  />
                </label>
              </div>
              <label className="block text-xs text-slate-500">
                App URL / path
                <input
                  value={bsAppUrl}
                  onChange={(e) => setBsAppUrl(e.target.value)}
                  placeholder="bs://… or /path/to/MyApp.ipa"
                  disabled={disabled || saving}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
                />
                <span className="mt-1 block text-[10px] text-slate-500">
                  BrowserStack app URL (<code className="text-slate-500">bs://…</code>) returned after uploading your app, or a local path
                </span>
              </label>
            </>
          )}

          {/* Test Connection */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void onTestBrowserStack()}
              disabled={testing || saving || disabled || (!bsUsername.trim() && !response?.secrets.browserstackAccessKeyConfigured)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
              data-testid="execution-bs-test-btn"
            >
              {testing ? <><BsSpinner />Testing…</> : "Test Connection"}
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
                  ? `✓ Connected${testResult.plan ? ` — ${testResult.plan}` : ""}${testResult.parallelSessions !== undefined ? ` · ${testResult.parallelSessions} parallel sessions` : ""}.`
                  : `✗ ${testResult.error ?? "Connection Failed"}`}
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-500">
            Find your credentials at{" "}
            <span className="text-slate-500">browserstack.com → Account → Settings</span>
          </p>
        </div>
      )}

      {provider !== "github-ci" && !disabled && (
        <button type="submit" disabled={saving} className="ui-btn-primary ui-btn-xs disabled:opacity-50" data-testid="execution-settings-save-btn">
          {saving ? "Saving…" : "Save execution settings"}
        </button>
      )}
    </form>

    {/* GitHub CI config — outside the main form, has its own submit */}
    {provider === "github-ci" && (
      <form onSubmit={(e) => void onSaveGithubCi(e)} className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-4 space-y-4" data-testid="github-ci-form">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">GitHub Actions settings</h3>
          {ciInfo?.hasCiToken && (
            <span className="flex items-center gap-1.5 text-[11px] text-emerald-700">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Token configured
              {ciInfo.ciTokenPreview && (
                <span className="font-mono text-slate-500">{ciInfo.ciTokenPreview}</span>
              )}
            </span>
          )}
        </div>

        <label className="block text-xs text-slate-500">
          Personal access token{" "}
          <span className="text-slate-500">
            {ciInfo?.hasCiToken ? "(leave blank to keep current)" : "(required)"}
          </span>
          <input
            type="password"
            value={ciToken}
            onChange={(e) => setCiToken(e.target.value)}
            autoComplete="off"
            placeholder={ciInfo?.hasCiToken ? "••••••••" : "ghp_…"}
            disabled={disabled || savingCi}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-sm text-slate-900 disabled:opacity-50"
            data-testid="github-ci-token-input"
          />
          <span className="mt-1 block text-[10px] text-slate-500">
            GitHub PAT with <code className="text-slate-500">repo</code> + <code className="text-slate-500">workflow</code> scopes.
            Generate at GitHub → Settings → Developer settings → Personal access tokens.
          </span>
        </label>

        <label className="block text-xs text-slate-500">
          Workflow file
          <input
            value={workflowFile}
            onChange={(e) => setWorkflowFile(e.target.value)}
            placeholder="run-tests.yml"
            maxLength={200}
            disabled={disabled || savingCi}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
            data-testid="github-ci-workflow-file-input"
          />
          <span className="mt-1 block text-[10px] text-slate-500">
            File name inside <code className="text-slate-500">.github/workflows/</code> — default is <code className="text-slate-500">run-tests.yml</code>, auto-generated when the project is created.
          </span>
        </label>

        <label className="block text-xs text-slate-500">
          Report emails
          <input
            value={reportEmails}
            onChange={(e) => setReportEmails(e.target.value)}
            placeholder="alice@example.com, bob@example.com"
            maxLength={1000}
            disabled={disabled || savingCi}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
            data-testid="github-ci-report-emails-input"
          />
          <span className="mt-1 block text-[10px] text-slate-500">
            Comma-separated email addresses. The workflow will email the test report to these addresses after each run.
            Requires GitHub secrets: <code className="text-slate-500">MAIL_SERVER</code>, <code className="text-slate-500">MAIL_PORT</code>, <code className="text-slate-500">MAIL_USERNAME</code>, <code className="text-slate-500">MAIL_PASSWORD</code>.
          </span>
        </label>

        {!disabled && (
          <button
            type="submit"
            disabled={savingCi}
            className="ui-btn-primary ui-btn-xs disabled:opacity-50"
            data-testid="github-ci-save-btn"
          >
            {savingCi ? "Saving…" : "Save GitHub CI settings"}
          </button>
        )}
      </form>
    )}
    </>
  );
}

function ProviderCard({
  active,
  disabled,
  onClick,
  title,
  description,
  testId,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  description: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-accent/40 bg-accent/10 ring-1 ring-green-400/20"
          : "border-slate-200 bg-slate-50 hover:border-slate-200 hover:bg-slate-50"
      }`}
      data-testid={testId}
    >
      <p className={`text-sm font-semibold ${active ? "text-green-700" : "text-slate-700"}`}>{title}</p>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
    </button>
  );
}

function BsSpinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/20 border-t-current" />
  );
}
