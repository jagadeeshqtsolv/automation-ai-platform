"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";
import type { ScreenElement } from "@jagadeeshqtsolv/core";

type EnvOption = { id: string; name: string; slug: string; configJson: string };

/** Must stay in sync with capture-tree API max timeout. */
const CAPTURE_TIMEOUT_MAX_SEC = 300;

type ParsedElement = {
  nodeId: string;
  type: string;
  label?: string;
  suggestedKey: string;
  strategy: ScreenElement["strategy"];
  value: string;
  role?: string;
};

export function DeviceRecorderPanel({
  projectId,
  environments,
  disabled,
  onSaved,
}: {
  projectId: string;
  environments: EnvOption[];
  disabled: boolean;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [envId, setEnvId] = useState("");
  const [screenName, setScreenName] = useState("");
  const [treeJson, setTreeJson] = useState("");
  const [elements, setElements] = useState<ParsedElement[]>([]);
  const [busy, setBusy] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android">("ios");
  const [bundleId, setBundleId] = useState("");
  const [deviceName, setDeviceName] = useState("iPhone 15");
  const [timeoutSec, setTimeoutSec] = useState("45");
  const [connectionVerified, setConnectionVerified] = useState(false);
  const [connection, setConnection] = useState<{
    state: "idle" | "connecting" | "success" | "error";
    message?: string;
    at?: string;
  }>({ state: "idle" });

  const selectedEnv = useMemo(() => environments.find((env) => env.id === envId) ?? null, [envId, environments]);

  function preloadFromEnvironment(nextEnvId: string) {
    setEnvId(nextEnvId);
    setConnectionVerified(false);
    setConnection({ state: "idle" });
    const env = environments.find((item) => item.id === nextEnvId);
    if (env === undefined) return;
    try {
      const parsed = JSON.parse(env.configJson) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (obj.platform === "ios" || obj.platform === "android") {
          setPlatform(obj.platform);
        }
        if (typeof obj.bundleId === "string" && obj.bundleId.length > 0) {
          setBundleId(obj.bundleId);
        }
        if (typeof obj.deviceName === "string" && obj.deviceName.length > 0) {
          setDeviceName(obj.deviceName);
        }
        if (typeof obj.timeout === "number" && Number.isFinite(obj.timeout) && obj.timeout > 0) {
          const sec = Math.round(obj.timeout / 1000);
          setTimeoutSec(String(Math.min(sec, CAPTURE_TIMEOUT_MAX_SEC)));
        }
      }
    } catch {
      // ignore malformed config; user can edit fields manually
    }
  }

  async function ensureFrameworkDependencies(): Promise<boolean> {
    const statusRes = await fetch(`/api/projects/${projectId}/framework/dependencies`);
    if (statusRes.ok) {
      const status = (await statusRes.json()) as { dependenciesInstalled?: boolean };
      if (status.dependenciesInstalled === true) {
        return true;
      }
    }

    setConnection({ state: "connecting", message: "Installing framework dependencies (npm install)…" });
    const res = await fetch(`/api/projects/${projectId}/framework/dependencies`, { method: "POST" });
    if (!res.ok) {
      const msg = await readApiError(res, "Could not install framework dependencies");
      toast.error(msg);
      setConnection({ state: "error", message: msg, at: new Date().toLocaleTimeString() });
      return false;
    }
    return true;
  }

  async function testConnection() {
    if (bundleId.trim().length === 0) {
      toast.error("Bundle id is required to connect to the app.");
      setConnection({ state: "error", message: "Bundle id is required." });
      return;
    }

    const timeoutMs = Math.min(
      Math.max(5, Number.parseInt(timeoutSec, 10) || 45) * 1000,
      CAPTURE_TIMEOUT_MAX_SEC * 1000,
    );

    setBusy(true);
    setConnectionVerified(false);
    try {
      const depsOk = await ensureFrameworkDependencies();
      if (!depsOk) {
        return;
      }

      setConnection({ state: "connecting", message: "Connecting to device and capturing view tree…" });
      const res = await fetch("/api/recorder/capture-tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          environmentId: envId.length > 0 ? envId : undefined,
          platform,
          bundleId: bundleId.trim(),
          deviceName: deviceName.trim() || undefined,
          timeout: timeoutMs,
        }),
      });
      if (!res.ok) {
        const msg = await readApiError(res, "Could not connect to device");
        toast.error(msg);
        setConnection({ state: "error", message: msg, at: new Date().toLocaleTimeString() });
        return;
      }
      const body = (await res.json()) as { viewTreeJson?: string };
      if (typeof body.viewTreeJson !== "string" || body.viewTreeJson.trim().length === 0) {
        const msg = "Device returned an empty view tree.";
        toast.error(msg);
        setConnection({ state: "error", message: msg, at: new Date().toLocaleTimeString() });
        return;
      }
      setTreeJson(body.viewTreeJson);
      setConnectionVerified(true);
      setConnection({
        state: "success",
        message: "Connection verified and view tree captured.",
        at: new Date().toLocaleTimeString(),
      });
      toast.success("Device connection successful");
    } finally {
      setBusy(false);
    }
  }

  const connectionStyle =
    connection.state === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : connection.state === "error"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
        : connection.state === "connecting"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-white/10 bg-white/5 text-zinc-300";

  const testConnectionLabel =
    busy && connection.message?.includes("npm install")
      ? "Installing dependencies…"
      : busy
        ? "Testing connection…"
        : "Test connection";

  async function parseTree(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/recorder/parse-tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewTreeJson: treeJson }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not parse view tree"));
        return;
      }
      const data = (await res.json()) as { elements?: ParsedElement[] };
      setElements(Array.isArray(data.elements) ? data.elements : []);
      toast.success("View tree parsed");
    } finally {
      setBusy(false);
    }
  }

  async function saveScreen(e: FormEvent) {
    e.preventDefault();
    if (screenName.trim().length === 0) {
      toast.error("Screen name is required (e.g. Login)");
      return;
    }
    const payloadElements: ScreenElement[] = elements.map((el) => ({
      key: el.suggestedKey,
      strategy: el.strategy,
      value: el.value,
      role: el.role,
    }));
    if (payloadElements.length === 0) {
      toast.error("Parse the view tree and keep at least one element");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/recorder/save-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          screenName: screenName.trim(),
          environmentId: envId.length > 0 ? envId : undefined,
          elements: payloadElements,
          overwriteExisting: true,
        }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not save screen"));
        return;
      }
      const savedName = screenName.trim();
      setTreeJson("");
      setElements([]);
      setConnectionVerified(false);
      setConnection({ state: "idle" });
      await onSaved();
      toast.success(`Screen "${savedName}" saved`);
    } finally {
      setBusy(false);
    }
  }

  function updateElementKey(nodeId: string, key: string) {
    setElements((prev) => prev.map((el) => (el.nodeId === nodeId ? { ...el, suggestedKey: key } : el)));
  }

  return (
    <section className="space-y-4 rounded-2xl border border-sky-500/25 bg-sky-950/20 p-6">
      <header>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-sky-100">Device recorder</h2>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${connectionStyle}`}>
            {connection.state === "connecting"
              ? "Connecting..."
              : connection.state === "success"
                ? "Connected"
                : connection.state === "error"
                  ? "Connection failed"
                  : "Not connected"}
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-400">
          End users can connect from UI, fetch the live accessibility tree, then save one page class with{" "}
          <strong className="font-medium text-zinc-200">locators + methods together</strong>.
        </p>
        {connection.message !== undefined ? (
          <p className="mt-1 text-xs text-zinc-400">
            {connection.message}
            {connection.at !== undefined ? ` at ${connection.at}` : ""}
          </p>
        ) : null}
      </header>

      <ol className="list-decimal space-y-2 pl-5 text-xs text-zinc-400">
        <li>Select an environment (optional) to prefill platform and bundle details.</li>
        <li>
          Click <strong className="text-zinc-300">Test connection</strong> to install dependencies (first time)
          and verify the device.
        </li>
        <li>Parse elements, name the screen (e.g. Login), and save.</li>
      </ol>

      <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Environment
            <select
              value={envId}
              disabled={disabled || busy}
              onChange={(e) => preloadFromEnvironment(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 text-sm text-white"
            >
              <option value="">(none)</option>
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name} ({env.slug})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-zinc-400">
            Platform
            <select
              value={platform}
              disabled={disabled || busy}
              onChange={(e) => {
                setPlatform(e.target.value as "ios" | "android");
                setConnectionVerified(false);
                setConnection({ state: "idle" });
              }}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 text-sm text-white"
            >
              <option value="ios">iOS</option>
              <option value="android">Android</option>
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Bundle id
            <input
              value={bundleId}
              disabled={disabled || busy}
              onChange={(e) => {
                setBundleId(e.target.value);
                setConnectionVerified(false);
                setConnection({ state: "idle" });
              }}
              placeholder="com.example.app"
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Device name (optional)
            <input
              value={deviceName}
              disabled={disabled || busy}
              onChange={(e) => {
                setDeviceName(e.target.value);
                setConnectionVerified(false);
                setConnection({ state: "idle" });
              }}
              placeholder="Pixel 9 or iPhone 15"
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 text-sm text-white"
            />
            <span className="mt-1 block text-[11px] leading-snug text-zinc-500">
              Recording uses the full name/regex. Test runs match via{" "}
              <code className="text-zinc-400">mobilewright.config.ts</code> — use a distinctive
              substring (e.g. <code className="text-zinc-400">Pixel</code> or{" "}
              <code className="text-zinc-400">iPhone 15</code>), not only lowercase{" "}
              <code className="text-zinc-400">pixel</code>.
            </span>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Capture timeout (seconds, max {CAPTURE_TIMEOUT_MAX_SEC})
            <input
              value={timeoutSec}
              disabled={disabled || busy}
              onChange={(e) => setTimeoutSec(e.target.value)}
              inputMode="numeric"
              max={CAPTURE_TIMEOUT_MAX_SEC}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 text-sm text-white"
            />
          </label>
          <div className="text-xs text-zinc-500">
            <p className="mt-6">
              {selectedEnv === null
                ? "No environment selected. Manual values are used."
                : `Using ${selectedEnv.name} as base config.`}
            </p>
            <p className="mt-1">
              Device name must match the emulator label (e.g.{" "}
              <span className="text-zinc-400">Pixel 9</span>), not the adb model id.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void testConnection()}
          disabled={disabled || busy}
          className="rounded-lg border border-sky-400/30 bg-sky-500/20 px-4 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/30 disabled:opacity-50"
        >
          {testConnectionLabel}
        </button>
      </div>

      <form className="space-y-3" onSubmit={parseTree}>
        <label className="block text-xs text-zinc-400">
          Accessibility tree JSON
          <textarea
            value={treeJson}
            disabled={disabled || busy}
            onChange={(e) => setTreeJson(e.target.value)}
            rows={8}
            className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 font-mono text-[11px] text-zinc-200"
            placeholder={
              connectionVerified
                ? '{ "nodes": [ ... ] }'
                : "Run Test connection to capture the tree from your device"
            }
          />
        </label>
        <button
          type="submit"
          disabled={disabled || busy || treeJson.trim().length === 0}
          className="ui-btn-primary ui-btn-xs"
        >
          Parse elements
        </button>
      </form>

      {elements.length > 0 ? (
        <form className="space-y-3 border-t border-white/10 pt-4" onSubmit={saveScreen}>
          <label className="block text-xs text-zinc-400">
            Screen name
            <input
              value={screenName}
              disabled={disabled || busy}
              onChange={(e) => setScreenName(e.target.value)}
              placeholder="Login"
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 text-sm text-white"
            />
          </label>

          <div className="max-h-56 overflow-auto rounded-lg border border-white/10 bg-black/30 p-2">
            <table className="w-full text-left text-[11px] text-zinc-300">
              <thead className="text-zinc-500">
                <tr>
                  <th className="p-1">Key</th>
                  <th className="p-1">Strategy</th>
                  <th className="p-1">Value</th>
                </tr>
              </thead>
              <tbody>
                {elements.map((el) => (
                  <tr key={el.nodeId} className="border-t border-white/5">
                    <td className="p-1">
                      <input
                        value={el.suggestedKey}
                        disabled={disabled || busy}
                        onChange={(e) => updateElementKey(el.nodeId, e.target.value)}
                        className="w-full rounded border border-white/10 bg-ink-950/60 px-1 py-0.5 text-white"
                      />
                    </td>
                    <td className="p-1">{el.strategy}</td>
                    <td className="p-1 font-mono">{el.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-zinc-500">
            Saves one file under <code>pageobjects/</code> as a screen class ending in <code>Screen.ts</code> (e.g.{" "}
            <code>LoginScreen.ts</code>). Shared helpers live in <code>support/actions.ts</code>.
          </p>

          <button
            type="submit"
            disabled={disabled || busy}
            className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            Save screen to framework
          </button>
        </form>
      ) : null}
    </section>
  );
}
