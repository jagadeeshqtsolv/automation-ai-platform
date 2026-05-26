"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/toast-provider";
import type { ExecutionConfig, ProjectPlatformType } from "@automation-ai/core";
import { testConfigFileName } from "@/lib/test-framework";
import { readApiError } from "@/lib/api-response";

type SecretsInfo = {
  browserstackAccessKeyConfigured: boolean;
  browserstackAccessKeyPreview: string | null;
};

type ConfigResponse = {
  config: ExecutionConfig;
  secrets: SecretsInfo;
};

type Provider = "local" | "browserstack";

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
  const [provider, setProvider] = useState<Provider>("local");

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
    const res = await fetch(`/api/projects/${projectId}/execution-config`);
    if (!res.ok) return;
    const body = (await res.json()) as ConfigResponse;
    setResponse(body);
    const p: Provider = body.config.provider === "browserstack" ? "browserstack" : "local";
    setProvider(p);
    if (body.config.browserstack) {
      const bs = body.config.browserstack;
      setBsUsername(bs.username ?? "");
      // web fields
      setBsBrowser((bs.browser as typeof bsBrowser) ?? "chrome");
      setBsBrowserVersion(bs.browserVersion ?? "latest");
      setBsOs((bs.os as typeof bsOs) ?? "Windows");
      setBsOsVersion(bs.osVersion ?? (bs.os === "OS X" ? "Sonoma" : "11"));
      // mobile fields
      setBsDeviceName(bs.deviceName ?? "");
      setBsAppUrl(bs.appUrl ?? "");
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
          : { config: { provider: "local" } };

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
    return <p className="text-sm text-zinc-400">Loading execution settings…</p>;
  }

  return (
    <form onSubmit={(e) => void onSave(e)} className="space-y-4" data-testid="execution-settings-form">
      {/* Provider picker */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-400">Execution provider</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <ProviderCard
            active={provider === "local"}
            disabled={disabled || saving}
            onClick={() => setProvider("local")}
            title="Local"
            description={`Run ${configLabel} tests on this server using your environment config`}
            testId="execution-provider-local-btn"
          />
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
        </div>
      </div>

      {/* BrowserStack config */}
      {provider === "browserstack" && (
        <div className="rounded-xl border border-white/10 bg-ink-950/40 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">BrowserStack settings</h3>
            {response?.secrets.browserstackAccessKeyConfigured && (
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Access key saved
                {response.secrets.browserstackAccessKeyPreview && (
                  <span className="font-mono text-zinc-500">{response.secrets.browserstackAccessKeyPreview}</span>
                )}
              </span>
            )}
          </div>

          {/* Credentials — same for web and mobile */}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-400">
              Username <span className="text-rose-300">(required)</span>
              <input
                value={bsUsername}
                onChange={(e) => setBsUsername(e.target.value)}
                required
                placeholder="your-bs-username"
                disabled={disabled || saving}
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                data-testid="execution-bs-username-input"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Access key{" "}
              <span className="text-zinc-500">
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
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 font-mono text-sm text-white disabled:opacity-50"
                data-testid="execution-bs-accesskey-input"
              />
            </label>
          </div>

          {/* Web-specific fields */}
          {platformType === "web" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-zinc-400">
                  Browser
                  <select
                    value={bsBrowser}
                    onChange={(e) => setBsBrowser(e.target.value as typeof bsBrowser)}
                    disabled={disabled || saving}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    <option value="chrome">Chrome</option>
                    <option value="firefox">Firefox</option>
                    <option value="edge">Edge</option>
                    <option value="safari">Safari</option>
                  </select>
                </label>
                <label className="block text-xs text-zinc-400">
                  Browser version
                  <input
                    value={bsBrowserVersion}
                    onChange={(e) => setBsBrowserVersion(e.target.value)}
                    placeholder="latest"
                    disabled={disabled || saving}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-zinc-400">
                  Operating system
                  <select
                    value={bsOs}
                    onChange={(e) => {
                      const next = e.target.value as typeof bsOs;
                      setBsOs(next);
                      setBsOsVersion(next === "OS X" ? "Sonoma" : "11");
                    }}
                    disabled={disabled || saving}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    <option value="Windows">Windows</option>
                    <option value="OS X">macOS</option>
                  </select>
                </label>
                <label className="block text-xs text-zinc-400">
                  OS version
                  <select
                    value={bsOsVersion}
                    onChange={(e) => setBsOsVersion(e.target.value)}
                    disabled={disabled || saving}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
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
              <p className="text-[11px] text-zinc-400">
                AutomationAI will generate <code className="text-zinc-300">browserstack.yml</code> and a{" "}
                <code className="text-zinc-300">test:bs</code> script. Run{" "}
                <code className="rounded bg-white/5 px-1 text-zinc-300">npm run test:bs</code> from the
                framework folder to execute on BrowserStack.
              </p>
            </>
          )}

          {/* Mobile-specific fields */}
          {platformType === "mobile" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs text-zinc-400">
                  Device name
                  <input
                    value={bsDeviceName}
                    onChange={(e) => setBsDeviceName(e.target.value)}
                    placeholder="iPhone 14"
                    disabled={disabled || saving}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                  />
                </label>
                <label className="block text-xs text-zinc-400">
                  OS version
                  <input
                    value={bsOsVersion}
                    onChange={(e) => setBsOsVersion(e.target.value)}
                    placeholder="16"
                    disabled={disabled || saving}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                  />
                </label>
              </div>
              <label className="block text-xs text-zinc-400">
                App URL / path
                <input
                  value={bsAppUrl}
                  onChange={(e) => setBsAppUrl(e.target.value)}
                  placeholder="bs://… or /path/to/MyApp.ipa"
                  disabled={disabled || saving}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                />
                <span className="mt-1 block text-[10px] text-zinc-500">
                  BrowserStack app URL (<code className="text-zinc-400">bs://…</code>) returned after uploading your app, or a local path
                </span>
              </label>
            </>
          )}

          {/* Test connection */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void onTestBrowserStack()}
              disabled={testing || saving || disabled || (!bsUsername.trim() && !response?.secrets.browserstackAccessKeyConfigured)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.07] disabled:opacity-50 transition"
              data-testid="execution-bs-test-btn"
            >
              {testing ? <><BsSpinner />Testing…</> : "Test connection"}
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
                  ? `✓ Connected${testResult.plan ? ` — ${testResult.plan}` : ""}${testResult.parallelSessions !== undefined ? ` · ${testResult.parallelSessions} parallel sessions` : ""}.`
                  : `✗ ${testResult.error ?? "Connection failed"}`}
              </div>
            )}
          </div>

          <p className="text-[11px] text-zinc-500">
            Find your credentials at{" "}
            <span className="text-zinc-400">browserstack.com → Account → Settings</span>
          </p>
        </div>
      )}

      {!disabled && (
        <button type="submit" disabled={saving} className="ui-btn-primary ui-btn-xs disabled:opacity-50" data-testid="execution-settings-save-btn">
          {saving ? "Saving…" : "Save execution settings"}
        </button>
      )}
    </form>
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
          ? "border-accent/40 bg-accent/10 ring-1 ring-accent/30"
          : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
      }`}
      data-testid={testId}
    >
      <p className={`text-sm font-semibold ${active ? "text-accent" : "text-zinc-200"}`}>{title}</p>
      <p className="mt-0.5 text-xs text-zinc-400">{description}</p>
    </button>
  );
}

function BsSpinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/20 border-t-current" />
  );
}
