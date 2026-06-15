"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import {
  ciProviderLabel,
  executionProviderLabel,
  type CiProvider,
  type ExecutionConfig,
  type ExecutionProvider,
  type ProjectPlatformType,
} from "@jagadeeshqtsolv/core";
import { testConfigFileName } from "@/lib/test-framework";
import type { RunDetailBody } from "./test-run-report-types";

type SpecFile = { path: string; name: string };

const POLL_MS = 1000;

export function TestExecutionPanel({
  projectId,
  platformType = "mobile",
  environments,
  disabled,
  onRunFinished,
  onNavigate,
}: {
  projectId: string;
  platformType?: ProjectPlatformType;
  environments: Array<{ id: string; name: string; slug: string }>;
  disabled: boolean;
  /** Called when a run leaves the running state (for Test Reports highlight). */
  onRunFinished?: (runId: string, status: string) => void;
  /** Called to navigate to another workspace tab. */
  onNavigate?: (tab: import("./project-workspace-nav").WorkspaceTab) => void;
}) {
  const toast = useToast();
  const [specs, setSpecs] = useState<SpecFile[]>([]);
  const [config, setConfig] = useState<ExecutionConfig | null>(null);
  const [availableProviders, setAvailableProviders] = useState<Array<{ provider: string; label: string }>>([]);
  const [selectedProvider, setSelectedProvider] = useState<ExecutionProvider | "github-ci" | "">("");
  const [loadError, setLoadError] = useState(false);
  const [ciPipeline, setCiPipeline] = useState<{ configured: boolean; provider: CiProvider | null }>({
    configured: false,
    provider: null,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [environmentId, setEnvironmentId] = useState("");
  const [grep, setGrep] = useState("");
  const [runLabel, setRunLabel] = useState("");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [activePipelineUrl, setActivePipelineUrl] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    activeRunIdRef.current = null;
  }, []);

  const load = useCallback(async () => {
    setLoadError(false);
    const res = await fetch(`/api/projects/${projectId}/test-runs`);
    if (!res.ok) {
      setLoadError(true);
      toast.error("Could not load test specs");
      return;
    }
    const body = (await res.json()) as {
      specs: SpecFile[];
      config: ExecutionConfig;
      availableProviders?: Array<{ provider: string; label: string }>;
      ciPipeline?: { configured: boolean; provider: CiProvider | null };
    };
    setSpecs(body.specs ?? []);
    setSelected(new Set((body.specs ?? []).map((s) => s.path)));
    setConfig(body.config ?? { provider: "local" });
    if (body.availableProviders) {
      setAvailableProviders(body.availableProviders);
      setSelectedProvider((body.config?.provider ?? "local") as ExecutionProvider | "github-ci");
    }
    if (body.ciPipeline) setCiPipeline(body.ciPipeline);
  }, [projectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  useEffect(() => {
    const el = logRef.current;
    if (el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [output]);

  const pollRun = useCallback(
    async (runId: string): Promise<boolean> => {
      const res = await fetch(`/api/projects/${projectId}/test-runs/${runId}`);
      if (!res.ok) {
        return false;
      }
      const body = (await res.json()) as RunDetailBody;
      const display =
        body.command.length > 0 && !body.output.includes(body.command)
          ? `$ ${body.command}\n\n${body.output}`
          : body.output;
      setOutput(display.length > 0 ? display : "Waiting for output…\n");
      setLastStatus(body.status);
      if (body.pipelineUrl) setActivePipelineUrl(body.pipelineUrl);

      if (body.running) {
        return true;
      }

      stopPolling();
      setRunning(false);
      onRunFinished?.(body.id, body.status);

      if (body.status === "passed") {
        toast.success("Test run passed");
      } else if (body.status === "failed") {
        toast.error("Test run finished with failures");
      } else if (body.status === "cancelled") {
        toast.info("Test run stopped");
      } else {
        toast.info(`Test run finished (${body.status})`);
      }
      return false;
    },
    [projectId, stopPolling, toast, onRunFinished],
  );

  const startPolling = useCallback(
    (runId: string) => {
      stopPolling();
      activeRunIdRef.current = runId;
      setRunning(true);
      setLastStatus("running");
      setOutput("Starting test run…\n");

      void pollRun(runId);
      pollRef.current = setInterval(() => {
        const id = activeRunIdRef.current;
        if (id === null) {
          return;
        }
        void pollRun(id).then((stillRunning) => {
          if (!stillRunning) {
            stopPolling();
          }
        });
      }, POLL_MS);
    },
    [pollRun, stopPolling],
  );


  function toggleSpec(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(specs.map((s) => s.path)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function stopExecution() {
    const runId = activeRunIdRef.current;
    if (runId === null || !running) {
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/test-runs/${runId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        toast.error(body.error ?? "Could not stop test run");
        return;
      }
      toast.info("Stopping test run…");
    } catch {
      toast.error("Could not stop test run");
    }
  }

  async function runViaCi() {
    if (selected.size === 0) {
      toast.error("Select at least one spec file");
      return;
    }
    if (running) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/git-config/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specPaths: [...selected],
          ...(environmentId.length > 0 ? { environmentId } : {}),
          ...(grep.trim().length > 0 ? { grep: grep.trim() } : {}),
          ...(runLabel.trim().length > 0 ? { label: runLabel.trim() } : {}),
        }),
      });
      const body = (await res.json()) as { runId?: string; error?: string };

      if (!res.ok) {
        toast.error(body.error ?? "Could not trigger CI pipeline");
        return;
      }
      if (typeof body.runId !== "string") {
        toast.error("Pipeline trigger did not return a run id");
        return;
      }
      startPolling(body.runId);
    } catch {
      toast.error("Could not trigger CI pipeline");
      setRunning(false);
      stopPolling();
    }
  }

  async function runTests() {
    if (selected.size === 0) {
      toast.error("Select at least one spec file");
      return;
    }
    if (running) {
      return;
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/test-runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          specPaths: [...selected],
          ...(environmentId.length > 0 ? { environmentId } : {}),
          ...(grep.trim().length > 0 ? { grep: grep.trim() } : {}),
          ...(selectedProvider.length > 0 && selectedProvider !== "github-ci" ? { provider: selectedProvider } : {}),
          ...(runLabel.trim().length > 0 ? { label: runLabel.trim() } : {}),
        }),
      });
      const body = (await res.json()) as {
        runId?: string;
        status?: string;
        error?: string;
      };

      if (!res.ok) {
        toast.error(body.error ?? "Could not start test run");
        return;
      }

      if (typeof body.runId !== "string") {
        toast.error("Test run did not return a run id");
        return;
      }

      startPolling(body.runId);
    } catch {
      toast.error("Could not start test run");
      setRunning(false);
      stopPolling();
    }
  }

  if (config === null) {
    if (loadError) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-rose-600">Could not load test configuration.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-medium text-green-700 hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const providerName = selectedProvider === "github-ci"
    ? "GitHub CI"
    : selectedProvider
    ? executionProviderLabel(selectedProvider as ExecutionProvider)
    : executionProviderLabel(config.provider);

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100 text-green-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14l11-7L8 5z" fill="currentColor" fillOpacity="0.2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14l11-7L8 5z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Test Execution</h2>
            <p className="text-xs text-slate-500">
              Select specs and run · view results in{" "}
              <button type="button" onClick={() => onNavigate?.("test-reports")} className="text-green-700 hover:underline">
                Test Reports
              </button>
            </p>
          </div>
        </div>
        {/* Status badge */}
        {lastStatus !== null && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            lastStatus === "passed"   ? "bg-green-50 text-green-700 ring-1 ring-green-200" :
            lastStatus === "failed"   ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200" :
            lastStatus === "running"  ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200" :
            lastStatus === "cancelled"? "bg-slate-100 text-slate-500 ring-1 ring-slate-200" :
                                        "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
          }`}>
            {lastStatus === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
            {lastStatus ? lastStatus.charAt(0).toUpperCase() + lastStatus.slice(1) : ""} {running ? "(live)" : ""}
          </span>
        )}
      </div>

      <div className="space-y-4 px-5 pb-5">
        {/* Run label */}
        <label className="block text-xs font-semibold text-slate-600">
          Run label
          <span className="ml-1 font-normal text-slate-400">(optional)</span>
          <input
            value={runLabel}
            disabled={disabled || running}
            onChange={(e) => setRunLabel(e.target.value)}
            maxLength={120}
            placeholder="e.g. Sprint 42 regression, smoke before deploy…"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 disabled:opacity-50"
            data-testid="execution-run-label-input"
          />
        </label>

        {/* Provider */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-600">Execution Provider</p>
          <div className="grid grid-cols-2 gap-2">
            {(["github-ci", "browserstack"] as const).map((key) => {
              const configured = availableProviders.some((p) => p.provider === key);
              const label = key === "github-ci" ? "GitHub CI" : "BrowserStack";
              const active = selectedProvider === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={disabled || running || !configured}
                  onClick={() => setSelectedProvider(key as typeof selectedProvider)}
                  data-testid={`execution-provider-${key}-btn`}
                  className={`rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-not-allowed ${
                    active && configured
                      ? "border-green-300 bg-green-50 ring-1 ring-green-300/40"
                      : configured
                        ? "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                        : "border-slate-100 bg-slate-50 opacity-50"
                  }`}
                >
                  <p className={`text-xs font-semibold ${active && configured ? "text-green-700" : "text-slate-700"}`}>{label}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {configured ? (active ? "Selected" : "Configured") : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onNavigate?.("setup"); }}
                        className="text-amber-600 hover:underline"
                      >
                        Configure in Setup
                      </button>
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Environment + Grep */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-600">
            Environment
            <select value={environmentId} disabled={disabled}
              onChange={(e) => setEnvironmentId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs"
              data-testid="execution-environment-select">
              <option value="">Default ({testConfigFileName(platformType)})</option>
              {environments.map((env) => <option key={env.id} value={env.id}>{env.name} ({env.slug})</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Filter by title
            <input value={grep} disabled={disabled} onChange={(e) => setGrep(e.target.value)}
              placeholder="@smoke"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs placeholder:text-slate-400"
              data-testid="execution-grep-input" />
          </label>
        </div>


        {/* Spec files */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-xs font-semibold text-slate-700">
              Spec Files
              {specs.length > 0 && (
                <span className="ml-1.5 font-normal text-slate-400">{selected.size}/{specs.length}</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => void load()} disabled={disabled || running}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                title="Refresh list" data-testid="execution-refresh-specs-btn">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              {specs.length > 0 && <>
                <button type="button" onClick={selectAll} disabled={disabled || running}
                  className="text-[11px] font-semibold text-green-700 hover:underline disabled:opacity-40"
                  data-testid="execution-select-all-btn">All</button>
                <button type="button" onClick={clearSelection} disabled={disabled || running}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 disabled:opacity-40"
                  data-testid="execution-clear-selection-btn">None</button>
              </>}
            </div>
          </div>
          {specs.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <p className="text-sm font-medium text-slate-600">No spec files yet</p>
              <p className="mt-0.5 text-xs text-slate-400">Generate tests from Test Plans, then click refresh.</p>
            </div>
          ) : (
            <ul className="max-h-56 overflow-auto divide-y divide-slate-100">
              {specs.map((s) => (
                <li key={s.path}>
                  <label className="flex min-w-0 cursor-pointer items-center gap-2.5 px-4 py-2 hover:bg-slate-50">
                    <input type="checkbox" checked={selected.has(s.path)} disabled={disabled || running}
                      onChange={() => toggleSpec(s.path)} className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-green-600" />
                    <span title={s.path} className="truncate font-mono text-[11px] text-slate-600">{s.path}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {running ? (
            <button type="button" disabled={disabled} onClick={() => void stopExecution()}
              className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
              data-testid="execution-stop-btn">
              Stop
            </button>
          ) : null}
          <button type="button" disabled={disabled || running}
            onClick={() => selectedProvider === "github-ci" ? void runViaCi() : void runTests()}
            className="ui-btn-primary" data-testid="execution-run-btn">
            {running ? (
              <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-900/20 border-t-slate-900" />Running…</>
            ) : selectedProvider === "github-ci" ? "Run via GitHub CI"
              : `Run on ${providerName}`}
          </button>
          {ciPipeline.configured && ciPipeline.provider !== null && !running &&
            !availableProviders.some((p) => p.provider === "github-ci") && (
            <button type="button" disabled={disabled || running} onClick={() => void runViaCi()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-xs hover:bg-slate-50 disabled:opacity-50"
              data-testid="execution-run-ci-btn">
              <PipelineIcon />
              Run via {ciProviderLabel(ciPipeline.provider)}
            </button>
          )}
          {activePipelineUrl !== null && (
            <a href={activePipelineUrl} target="_blank" rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-xs hover:bg-slate-50">
              <CiLinkIcon />
              View run
            </a>
          )}
        </div>

        {/* Live log */}
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Live Log</h3>
            {running && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
          </div>
          {output !== null ? (
            <pre ref={logRef}
              className="max-h-[min(60vh,28rem)] overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-slate-300 shadow-sm">
              {output}
            </pre>
          ) : (
            <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50 py-10 text-center">
              <svg className="h-8 w-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
              </svg>
              <p className="mt-2 text-sm font-medium text-slate-500">No output yet</p>
              <p className="mt-0.5 text-xs text-slate-400">Start a run to stream output here.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PipelineIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function CiLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}
