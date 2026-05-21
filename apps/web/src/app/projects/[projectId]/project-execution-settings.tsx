"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";
import type { ExecutionConfig, ExecutionProvider, ProjectPlatformType } from "@automation-ai/shared";
import { testConfigFileName, testRunnerDisplayName } from "@/lib/test-framework";

type SecretsView = {
  saucelabsAccessKeyConfigured: boolean;
  saucelabsAccessKeyPreview: string | null;
  browserstackAccessKeyConfigured: boolean;
  browserstackAccessKeyPreview: string | null;
  lambdatestAccessKeyConfigured: boolean;
  lambdatestAccessKeyPreview: string | null;
};

const PROVIDERS: Array<{ id: ExecutionProvider; label: string }> = [
  { id: "local", label: "Local" },
  { id: "saucelabs", label: "Sauce Labs" },
  { id: "browserstack", label: "BrowserStack" },
  { id: "lambdatest", label: "LambdaTest" },
  { id: "custom", label: "Custom hub" },
];

const DEFAULT_CONFIG: ExecutionConfig = { provider: "local" };

export function ProjectExecutionSettings({
  projectId,
  platformType = "mobile",
  disabled,
}: {
  projectId: string;
  platformType?: ProjectPlatformType;
  disabled: boolean;
}) {
  const runnerLabel = testRunnerDisplayName(platformType);
  const configLabel = testConfigFileName(platformType);
  const isWeb = platformType === "web";
  const toast = useToast();
  const [config, setConfig] = useState<ExecutionConfig>(DEFAULT_CONFIG);
  const [secrets, setSecrets] = useState<SecretsView | null>(null);
  const [sauceKey, setSauceKey] = useState("");
  const [bsKey, setBsKey] = useState("");
  const [ltKey, setLtKey] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/execution-config`);
    if (!res.ok) {
      toast.error("Could not load execution settings");
      return;
    }
    const body = (await res.json()) as { config: ExecutionConfig; secrets: SecretsView };
    setConfig(body.config);
    setSecrets(body.secrets);
  }, [projectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: {
        config: ExecutionConfig;
        saucelabsAccessKey?: string | null;
        browserstackAccessKey?: string | null;
        lambdatestAccessKey?: string | null;
      } = { config };

      if (sauceKey.trim().length > 0) {
        payload.saucelabsAccessKey = sauceKey.trim();
      }
      if (bsKey.trim().length > 0) {
        payload.browserstackAccessKey = bsKey.trim();
      }
      if (ltKey.trim().length > 0) {
        payload.lambdatestAccessKey = ltKey.trim();
      }

      const res = await fetch(`/api/projects/${projectId}/execution-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not save execution settings"));
        return;
      }
      setSauceKey("");
      setBsKey("");
      setLtKey("");
      await load();
      toast.success("Execution settings saved");
    } finally {
      setBusy(false);
    }
  }

  if (secrets === null) {
    return <p className="text-sm text-zinc-400">Loading execution settings…</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-white/10 bg-ink-950/30 p-4">
      <div>
        <h3 className="text-sm font-semibold text-white">Test execution</h3>
        <p className="mt-1 text-xs text-zinc-400">
          Choose where {runnerLabel} runs tests from the{" "}
          <strong className="font-medium text-zinc-300">Test execution</strong> tab. Credentials are encrypted at
          rest.
        </p>
      </div>

      <label className="block text-xs font-medium text-zinc-400">
        Provider
        <select
          value={config.provider}
          onChange={(e) =>
            setConfig((c) => ({
              ...c,
              provider: e.target.value as ExecutionProvider,
            }))
          }
          className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 text-sm text-white"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {config.provider === "saucelabs" ? (
        <SauceLabsFields
          config={config}
          secrets={secrets}
          sauceKey={sauceKey}
          onSauceKeyChange={setSauceKey}
          onChange={setConfig}
        />
      ) : null}

      {config.provider === "browserstack" ? (
        <BrowserStackFields config={config} secrets={secrets} accessKey={bsKey} onAccessKeyChange={setBsKey} onChange={setConfig} />
      ) : null}

      {config.provider === "lambdatest" ? (
        <LambdaTestFields config={config} secrets={secrets} accessKey={ltKey} onAccessKeyChange={setLtKey} onChange={setConfig} />
      ) : null}

      {config.provider === "custom" ? <CustomFields config={config} onChange={setConfig} /> : null}

      {config.provider === "local" ? (
        <p className="text-xs text-zinc-500">
          {isWeb ? (
            <>
              Uses the local browser from your environment config and{" "}
              <code className="text-zinc-400">{configLabel}</code>.
            </>
          ) : (
            <>
              Uses the local simulator/emulator from your environment config and{" "}
              <code className="text-zinc-400">{configLabel}</code>.
            </>
          )}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={disabled || busy}
        className="ui-btn-primary ui-btn-xs disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save execution settings"}
      </button>
    </form>
  );
}

function fieldClass() {
  return "mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white";
}

function SauceLabsFields({
  config,
  secrets,
  sauceKey,
  onSauceKeyChange,
  onChange,
}: {
  config: ExecutionConfig;
  secrets: SecretsView;
  sauceKey: string;
  onSauceKeyChange: (v: string) => void;
  onChange: (fn: (c: ExecutionConfig) => ExecutionConfig) => void;
}) {
  const s = config.saucelabs ?? {
    username: "",
    region: "us-west-1" as const,
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-zinc-400 sm:col-span-2">
        Username
        <input
          value={s.username}
          onChange={(e) =>
            onChange((c) => ({
              ...c,
              saucelabs: { ...s, username: e.target.value },
            }))
          }
          className={fieldClass()}
          required
        />
      </label>
      <label className="text-xs text-zinc-400 sm:col-span-2">
        Access key
        <input
          type="password"
          value={sauceKey}
          onChange={(e) => onSauceKeyChange(e.target.value)}
          placeholder={secrets.saucelabsAccessKeyConfigured ? secrets.saucelabsAccessKeyPreview ?? "••••" : "Required"}
          className={fieldClass()}
          autoComplete="off"
        />
      </label>
      <label className="text-xs text-zinc-400">
        Region
        <select
          value={s.region}
          onChange={(e) =>
            onChange((c) => ({
              ...c,
              saucelabs: { ...s, region: e.target.value as "us-west-1" | "eu-central-1" | "apac-southeast-1" },
            }))
          }
          className={fieldClass()}
        >
          <option value="us-west-1">US West</option>
          <option value="eu-central-1">EU Central</option>
          <option value="apac-southeast-1">APAC</option>
        </select>
      </label>
      <label className="text-xs text-zinc-400">
        Device name
        <input
          value={s.deviceName ?? ""}
          onChange={(e) => onChange((c) => ({ ...c, saucelabs: { ...s, deviceName: e.target.value } }))}
          placeholder="iPhone 15"
          className={fieldClass()}
        />
      </label>
      <label className="text-xs text-zinc-400">
        Platform version
        <input
          value={s.platformVersion ?? ""}
          onChange={(e) => onChange((c) => ({ ...c, saucelabs: { ...s, platformVersion: e.target.value } }))}
          placeholder="17"
          className={fieldClass()}
        />
      </label>
      <label className="text-xs text-zinc-400 sm:col-span-2">
        App (storage id or URL)
        <input
          value={s.app ?? ""}
          onChange={(e) => onChange((c) => ({ ...c, saucelabs: { ...s, app: e.target.value } }))}
          placeholder="storage:filename=MyApp.ipa"
          className={fieldClass()}
        />
      </label>
    </div>
  );
}

function BrowserStackFields({
  config,
  secrets,
  accessKey,
  onAccessKeyChange,
  onChange,
}: {
  config: ExecutionConfig;
  secrets: SecretsView;
  accessKey: string;
  onAccessKeyChange: (v: string) => void;
  onChange: (fn: (c: ExecutionConfig) => ExecutionConfig) => void;
}) {
  const b = config.browserstack ?? { username: "" };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-zinc-400 sm:col-span-2">
        Username
        <input
          value={b.username}
          onChange={(e) => onChange((c) => ({ ...c, browserstack: { ...b, username: e.target.value } }))}
          className={fieldClass()}
          required
        />
      </label>
      <label className="text-xs text-zinc-400 sm:col-span-2">
        Access key
        <input
          type="password"
          value={accessKey}
          onChange={(e) => onAccessKeyChange(e.target.value)}
          placeholder={secrets.browserstackAccessKeyConfigured ? "Leave blank to keep" : "Required"}
          className={fieldClass()}
        />
      </label>
    </div>
  );
}

function LambdaTestFields({
  config,
  secrets,
  accessKey,
  onAccessKeyChange,
  onChange,
}: {
  config: ExecutionConfig;
  secrets: SecretsView;
  accessKey: string;
  onAccessKeyChange: (v: string) => void;
  onChange: (fn: (c: ExecutionConfig) => ExecutionConfig) => void;
}) {
  const l = config.lambdatest ?? { username: "" };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-xs text-zinc-400 sm:col-span-2">
        Username
        <input
          value={l.username}
          onChange={(e) => onChange((c) => ({ ...c, lambdatest: { ...l, username: e.target.value } }))}
          className={fieldClass()}
          required
        />
      </label>
      <label className="text-xs text-zinc-400 sm:col-span-2">
        Access key
        <input
          type="password"
          value={accessKey}
          onChange={(e) => onAccessKeyChange(e.target.value)}
          placeholder={secrets.lambdatestAccessKeyConfigured ? "Leave blank to keep" : "Required"}
          className={fieldClass()}
        />
      </label>
    </div>
  );
}

function CustomFields({
  config,
  onChange,
}: {
  config: ExecutionConfig;
  onChange: (fn: (c: ExecutionConfig) => ExecutionConfig) => void;
}) {
  const c = config.custom ?? { hubUrl: "https://hub.example.com/wd/hub", capabilitiesJson: "{}" };
  return (
    <div className="space-y-3">
      <label className="text-xs text-zinc-400">
        Appium hub URL
        <input
          value={c.hubUrl}
          onChange={(e) => onChange((cfg) => ({ ...cfg, custom: { ...c, hubUrl: e.target.value } }))}
          className={fieldClass()}
          required
        />
      </label>
      <label className="text-xs text-zinc-400">
        Capabilities JSON
        <textarea
          value={c.capabilitiesJson}
          onChange={(e) => onChange((cfg) => ({ ...cfg, custom: { ...c, capabilitiesJson: e.target.value } }))}
          rows={6}
          className={`${fieldClass()} font-mono text-[11px]`}
        />
      </label>
    </div>
  );
}
