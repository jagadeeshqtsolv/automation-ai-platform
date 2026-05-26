"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";
import type { WebPageElement, WebPageElementActionKind } from "@automation-ai/core";

type EnvOption = { id: string; name: string; slug: string; configJson: string };

type ParsedElement = {
  nodeId: string;
  tagName?: string;
  suggestedKey: string;
  strategy: WebPageElement["strategy"];
  value: string;
  role?: string;
  frame?: string;
  shadowHost?: string;
  actionKind: WebPageElementActionKind;
};

function domSnapshotTextFromCaptureResponse(body: {
  domSnapshot?: unknown;
  domSnapshotJson?: string;
}): string | null {
  if (body.domSnapshot !== undefined && body.domSnapshot !== null) {
    return JSON.stringify(body.domSnapshot, null, 2);
  }
  if (typeof body.domSnapshotJson === "string" && body.domSnapshotJson.trim().length > 0) {
    return body.domSnapshotJson.trim().replace(/^\uFEFF/, "");
  }
  return null;
}

export function BrowserRecorderPanel({
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
  const [pageName, setPageName] = useState("");
  const [domJson, setDomJson] = useState("");
  const [elements, setElements] = useState<ParsedElement[]>([]);
  const [busy, setBusy] = useState(false);
  const [baseURL, setBaseURL] = useState("https://example.com");
  const [startPath, setStartPath] = useState("/");
  const [browser, setBrowser] = useState<"chromium" | "firefox" | "webkit">("chromium");
  const [captureVerified, setCaptureVerified] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [session, setSession] = useState<{
    state: "idle" | "connecting" | "success" | "error";
    message?: string;
    at?: string;
  }>({ state: "idle" });
  const [activeTabUrl, setActiveTabUrl] = useState<string | null>(null);
  const tabCountRef = useRef(0);

  const recorderPayload = useCallback(
    (action: "start" | "capture" | "stop" | "status" | "events") => ({
      projectId,
      action,
      environmentId: envId.length > 0 ? envId : undefined,
      baseURL: baseURL.trim(),
      startPath: startPath.trim() || "/",
      browser,
      headless: false,
    }),
    [projectId, envId, baseURL, startPath, browser],
  );

  const refreshBrowserStatus = useCallback(async () => {
    const res = await fetch("/api/recorder/capture-dom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(recorderPayload("status")),
    });
    if (res.ok) {
      const body = (await res.json()) as { running?: boolean };
      setBrowserOpen(body.running === true);
    }
  }, [recorderPayload]);

  useEffect(() => {
    void refreshBrowserStatus();
  }, [refreshBrowserStatus]);

  useEffect(() => {
    if (!browserOpen) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/recorder/capture-dom", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(recorderPayload("events")),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { events?: Array<{ type: string; url?: string; at: string }> };
        const events = body.events ?? [];
        for (const evt of events) {
          if (evt.type === "newTab") {
            tabCountRef.current += 1;
            setActiveTabUrl(evt.url ?? null);
            toast.info(`New tab opened${evt.url ? `: ${evt.url}` : ""}`);
          } else if (evt.type === "closeTab") {
            tabCountRef.current = Math.max(0, tabCountRef.current - 1);
            if (tabCountRef.current === 0) setActiveTabUrl(null);
            toast.info("Tab closed — back to previous tab");
          }
        }
      } catch {
        // non-critical polling — ignore errors
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [browserOpen, recorderPayload, toast]);

  const selectedEnv = useMemo(() => environments.find((env) => env.id === envId) ?? null, [envId, environments]);

  function preloadFromEnvironment(nextEnvId: string) {
    setEnvId(nextEnvId);
    setCaptureVerified(false);
    setSession({ state: "idle" });
    const env = environments.find((item) => item.id === nextEnvId);
    if (env === undefined) return;
    try {
      const parsed = JSON.parse(env.configJson) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        if (typeof obj.baseURL === "string" && obj.baseURL.length > 0) {
          setBaseURL(obj.baseURL);
        }
        if (obj.browser === "chromium" || obj.browser === "firefox" || obj.browser === "webkit") {
          setBrowser(obj.browser);
        }
      }
    } catch {
      // ignore malformed config
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

    setSession({ state: "connecting", message: "Installing framework dependencies (npm install)…" });
    const res = await fetch(`/api/projects/${projectId}/framework/dependencies`, { method: "POST" });
    if (!res.ok) {
      const msg = await readApiError(res, "Could not install framework dependencies");
      toast.error(msg);
      setSession({ state: "error", message: msg, at: new Date().toLocaleTimeString() });
      return false;
    }
    return true;
  }

  async function openBrowser() {
    if (baseURL.trim().length < 4) {
      toast.error("Base URL is required (e.g. https://app.example.com).");
      setSession({ state: "error", message: "Base URL is required." });
      return;
    }

    setBusy(true);
    try {
      const depsOk = await ensureFrameworkDependencies();
      if (!depsOk) return;

      setSession({
        state: "connecting",
        message: "Opening headed browser on the server…",
      });

      const res = await fetch("/api/recorder/capture-dom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recorderPayload("start")),
      });
      if (!res.ok) {
        const msg = await readApiError(res, "Could not open browser");
        toast.error(msg);
        setSession({ state: "error", message: msg, at: new Date().toLocaleTimeString() });
        return;
      }
      setBrowserOpen(true);
      setActiveTabUrl(null);
      tabCountRef.current = 0;
      setSession({
        state: "success",
        message: "Browser is open — navigate, then click Capture current page.",
        at: new Date().toLocaleTimeString(),
      });
      toast.success("Browser opened");
    } finally {
      setBusy(false);
    }
  }

  async function captureCurrentPage() {
    setBusy(true);
    try {
      setSession({ state: "connecting", message: "Capturing DOM from the current page…" });
      const res = await fetch("/api/recorder/capture-dom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recorderPayload("capture")),
      });
      if (!res.ok) {
        const msg = await readApiError(res, "Could not capture DOM");
        toast.error(msg);
        setSession({ state: "error", message: msg, at: new Date().toLocaleTimeString() });
        return;
      }
      const body = (await res.json()) as { domSnapshot?: unknown; domSnapshotJson?: string };
      const snapshotText = domSnapshotTextFromCaptureResponse(body);
      if (snapshotText === null) {
        toast.error("Browser returned an empty DOM snapshot.");
        return;
      }
      setDomJson(snapshotText);
      setCaptureVerified(true);
      setSession({
        state: "success",
        message: "DOM captured — parse elements below.",
        at: new Date().toLocaleTimeString(),
      });
      toast.success("DOM captured");
    } finally {
      setBusy(false);
    }
  }

  async function closeBrowser() {
    setBusy(true);
    try {
      await fetch("/api/recorder/capture-dom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recorderPayload("stop")),
      });
      setBrowserOpen(false);
      setActiveTabUrl(null);
      tabCountRef.current = 0;
      setSession({ state: "idle", message: "Browser closed." });
      toast.success("Browser closed");
    } finally {
      setBusy(false);
    }
  }

  const sessionStyle =
    session.state === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : session.state === "error"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
        : session.state === "connecting"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-white/10 bg-white/5 text-zinc-300";

  const openBrowserLabel =
    busy && session.message?.includes("npm install")
      ? "Installing dependencies…"
      : busy
        ? "Opening browser…"
        : browserOpen
          ? "Browser open"
          : "Open browser";

  async function parseDom(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/recorder/parse-tree", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewTreeJson: domJson }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not parse DOM snapshot"));
        return;
      }
      const data = (await res.json()) as {
        elements?: ParsedElement[];
        truncated?: boolean;
        totalMatched?: number;
        maxElements?: number;
      };
      setElements(Array.isArray(data.elements) ? data.elements : []);
      if (data.truncated === true && typeof data.totalMatched === "number") {
        const max = data.maxElements ?? 80;
        toast.info(
          `Parsed ${max} of ${data.totalMatched} elements (limit ${max}). Prefer test-id and id locators; remove rows you do not need before saving.`,
        );
      } else {
        toast.success("DOM parsed into locators");
      }
    } finally {
      setBusy(false);
    }
  }

  async function savePage(e: FormEvent) {
    e.preventDefault();
    if (pageName.trim().length === 0) {
      toast.error("Page name is required (e.g. Login)");
      return;
    }
    const payloadElements: WebPageElement[] = elements.map((el) => ({
      key: el.suggestedKey,
      strategy: el.strategy,
      value: el.value,
      role: el.role,
      frame: el.frame,
      shadowHost: el.shadowHost,
      actionKind: el.actionKind,
    }));
    if (payloadElements.length === 0) {
      toast.error("Parse the DOM and keep at least one element");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/recorder/save-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          pageName: pageName.trim(),
          environmentId: envId.length > 0 ? envId : undefined,
          elements: payloadElements,
          overwriteExisting: true,
        }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not save page"));
        return;
      }
      const savedName = pageName.trim();
      setDomJson("");
      setElements([]);
      setCaptureVerified(false);
      setSession({ state: "idle" });
      await onSaved();
      toast.success(`Page "${savedName}" saved`);
    } finally {
      setBusy(false);
    }
  }

  function updateElementKey(nodeId: string, key: string) {
    setElements((prev) => prev.map((el) => (el.nodeId === nodeId ? { ...el, suggestedKey: key } : el)));
  }

  return (
    <section className="space-y-4 rounded-2xl border border-violet-500/25 bg-violet-950/20 p-6">
      <header>
        <RecorderStatusHeader browserOpen={browserOpen} session={session} sessionStyle={sessionStyle} />
        <p className="mt-1 text-sm text-zinc-400">
          Opens a normal browser window (no Playwright Inspector). Navigate freely, then capture the current page when
          you are ready.
        </p>
        {session.message !== undefined ? (
          <p className="mt-1 text-xs text-zinc-400">
            {session.message}
            {session.at !== undefined ? ` at ${session.at}` : ""}
          </p>
        ) : null}
      </header>

      <ol className="list-decimal space-y-2 pl-5 text-xs text-zinc-400">
        <li>Select an environment to prefill baseURL and browser.</li>
        <li>Click Open browser (runs on the machine hosting this app).</li>
        <li>Navigate in that window, then click Capture current page.</li>
        <li>Parse elements, name the page, and save.</li>
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
            Browser
            <select
              value={browser}
              disabled={disabled || busy}
              onChange={(e) => {
                setBrowser(e.target.value as "chromium" | "firefox" | "webkit");
                setCaptureVerified(false);
                setSession({ state: "idle" });
              }}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 text-sm text-white"
            >
              <option value="chromium">Chromium</option>
              <option value="firefox">Firefox</option>
              <option value="webkit">WebKit</option>
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs text-zinc-400">
            Base URL
            <input
              value={baseURL}
              disabled={disabled || busy}
              onChange={(e) => {
                setBaseURL(e.target.value);
                setCaptureVerified(false);
                setSession({ state: "idle" });
              }}
              placeholder="https://app.example.com"
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 text-sm text-white"
            />
          </label>
          <label className="block text-xs text-zinc-400">
            Start path
            <input
              value={startPath}
              disabled={disabled || busy}
              onChange={(e) => setStartPath(e.target.value)}
              placeholder="/"
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 text-sm text-white"
            />
          </label>
        </div>
        <p className="text-[11px] text-zinc-500">
          {selectedEnv === null
            ? "No environment selected — manual baseURL is used."
            : `Using ${selectedEnv.name} as base config.`}
        </p>
        {activeTabUrl !== null && (
          <div className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
            <span className="mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-sky-400" />
            <span>
              <span className="font-medium">New tab active</span>
              {activeTabUrl.length > 0 && (
                <span className="ml-1 font-mono text-sky-400/80 break-all">{activeTabUrl}</span>
              )}
              <span className="ml-2 text-sky-500/70">— next capture will be from this tab</span>
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void openBrowser()}
            disabled={disabled || busy || browserOpen}
            className="rounded-lg border border-violet-400/30 bg-violet-500/20 px-4 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/30 disabled:opacity-50"
          >
            {openBrowserLabel}
          </button>
          <button
            type="button"
            onClick={() => void captureCurrentPage()}
            disabled={disabled || busy || !browserOpen}
            className="rounded-lg border border-emerald-400/30 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            {busy ? "Capturing…" : "Capture current page"}
          </button>
          <button
            type="button"
            onClick={() => void closeBrowser()}
            disabled={disabled || busy || !browserOpen}
            className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-50"
          >
            Close browser
          </button>
        </div>
      </div>

      <form className="space-y-3" onSubmit={parseDom}>
        <label className="block text-xs text-zinc-400">
          DOM snapshot JSON
          <textarea
            value={domJson}
            disabled={disabled || busy}
            onChange={(e) => setDomJson(e.target.value)}
            rows={8}
            className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 font-mono text-[11px] text-zinc-200"
            placeholder={
              captureVerified ? '{ "nodes": [ ... ] }' : "Capture from the browser to fill this field"
            }
          />
        </label>
        <button
          type="submit"
          disabled={disabled || busy || domJson.trim().length === 0}
          className="ui-btn-primary ui-btn-xs"
        >
          Parse elements
        </button>
      </form>

      {elements.length > 0 ? (
        <form className="space-y-3 border-t border-white/10 pt-4" onSubmit={savePage}>
          <label className="block text-xs text-zinc-400">
            Page name
            <input
              value={pageName}
              disabled={disabled || busy}
              onChange={(e) => setPageName(e.target.value)}
              placeholder="Login"
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-2 text-sm text-white"
            />
          </label>

          <ElementsTable elements={elements} disabled={disabled} busy={busy} onKeyChange={updateElementKey} />

          <p className="text-[11px] text-zinc-500">
            Saves pageobjects/LoginPage.ts with Playwright Page + webLocator helpers.
          </p>

          <button
            type="submit"
            disabled={disabled || busy}
            className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Save page to framework
          </button>
        </form>
      ) : null}
    </section>
  );
}

function RecorderStatusHeader({
  browserOpen,
  session,
  sessionStyle,
}: {
  browserOpen: boolean;
  session: { state: string };
  sessionStyle: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-semibold text-violet-100">Browser recorder</h2>
      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${sessionStyle}`}>
        {browserOpen
          ? "Browser open"
          : session.state === "connecting"
            ? "Opening…"
            : session.state === "success"
              ? "Ready"
              : session.state === "error"
                ? "Error"
                : "Not connected"}
      </span>
    </div>
  );
}

function ElementsTable({
  elements,
  disabled,
  busy,
  onKeyChange,
}: {
  elements: ParsedElement[];
  disabled: boolean;
  busy: boolean;
  onKeyChange: (nodeId: string, key: string) => void;
}) {
  return (
    <div className="max-h-56 overflow-auto rounded-lg border border-white/10 bg-black/30 p-2">
      <table className="w-full text-left text-[11px] text-zinc-300">
        <thead className="text-zinc-500">
          <tr>
            <th className="p-1">Key</th>
            <th className="p-1">Strategy</th>
            <th className="p-1">Value</th>
            <th className="p-1">Kind</th>
            <th className="p-1">Tag</th>
          </tr>
        </thead>
        <tbody>
          {elements.map((el) => (
            <tr key={el.nodeId} className="border-t border-white/5">
              <td className="p-1">
                <input
                  value={el.suggestedKey}
                  disabled={disabled || busy}
                  onChange={(e) => onKeyChange(el.nodeId, e.target.value)}
                  className="w-full rounded border border-white/10 bg-ink-950/60 px-1 py-0.5 text-white"
                />
              </td>
              <td className="p-1">{el.strategy}</td>
              <td className="p-1 font-mono">{el.value}</td>
              <td className="p-1 text-zinc-500">{el.actionKind}</td>
              <td className="p-1 text-zinc-500">{el.tagName ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
