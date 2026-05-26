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
} from "@automation-ai/core";
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
}: {
  projectId: string;
  platformType?: ProjectPlatformType;
  environments: Array<{ id: string; name: string; slug: string }>;
  disabled: boolean;
  /** Called when a run leaves the running state (for Test Reports highlight). */
  onRunFinished?: (runId: string, status: string) => void;
}) {
  const toast = useToast();
  const [specs, setSpecs] = useState<SpecFile[]>([]);
  const [config, setConfig] = useState<ExecutionConfig | null>(null);
  const [availableProviders, setAvailableProviders] = useState<Array<{ provider: string; label: string }>>([]);
  const [selectedProvider, setSelectedProvider] = useState<ExecutionProvider | "">("");
  const [loadError, setLoadError] = useState(false);
  const [ciPipeline, setCiPipeline] = useState<{ configured: boolean; provider: CiProvider | null }>({
    configured: false,
    provider: null,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [environmentId, setEnvironmentId] = useState("");
  const [grep, setGrep] = useState("");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
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
      // Default selection to the saved provider
      setSelectedProvider((body.config?.provider ?? "local") as ExecutionProvider);
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

  useEffect(() => {
    if (running || activeRunIdRef.current !== null) {
      return;
    }
    void (async () => {
      const res = await fetch(`/api/projects/${projectId}/test-runs`);
      if (!res.ok) {
        return;
      }
      const body = (await res.json()) as { recentRuns: Array<{ id: string; status: string; finishedAt: string | null }> };
      const inProgress = body.recentRuns.find((r) => r.status === "running" && r.finishedAt === null);
      if (inProgress !== undefined) {
        startPolling(inProgress.id);
      }
    })();
  }, [projectId, running, startPolling]);

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
        }),
      });
      const body = (await res.json()) as { runId?: string; error?: string };

      if (res.status === 409 && typeof body.runId === "string") {
        toast.info("Resuming in-progress run");
        startPolling(body.runId);
        return;
      }
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
          ...(selectedProvider.length > 0 ? { provider: selectedProvider } : {}),
        }),
      });
      const body = (await res.json()) as {
        runId?: string;
        status?: string;
        error?: string;
      };

      if (res.status === 409 && typeof body.runId === "string") {
        toast.info("Resuming in-progress test run");
        startPolling(body.runId);
        return;
      }

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
          <p className="text-sm text-rose-400">Could not load test configuration.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-medium text-accent hover:underline"
          >
            Retry
          </button>
        </div>
      );
    }
    return <p className="text-sm text-zinc-400">Loading…</p>;
  }

  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-ink-900/40 p-6">
      <header>
        <h2 className="text-lg font-semibold text-white">Test execution</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Select specs and stream live CLI output here. When a run finishes, open{" "}
          <strong className="font-medium text-zinc-300">Test reports</strong> for HTML, pass/fail tables, and step
          details.
        </p>
      </header>

      <div className="rounded-xl border border-white/10 bg-ink-950/30 px-4 py-3">
        {availableProviders.length > 1 ? (
          <label className="block text-xs font-medium text-zinc-400">
            Execution provider
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value as ExecutionProvider)}
              disabled={disabled || running}
              className="mt-1 block w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
              data-testid="execution-provider-select"
            >
              {availableProviders.map((p) => (
                <option key={p.provider} value={p.provider}>{p.label}</option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-zinc-400">
            Provider:{" "}
            <span className="font-medium text-white">
              {selectedProvider ? executionProviderLabel(selectedProvider as ExecutionProvider) : executionProviderLabel(config.provider)}
            </span>
          </p>
        )}
      </div>

      <div className="space-y-2 rounded-xl border border-white/10 bg-ink-950/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white">
            Spec files
            {specs.length > 0 ? (
              <span className="ml-2 font-normal text-zinc-500">
                ({selected.size}/{specs.length} selected)
              </span>
            ) : null}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={disabled || running}
              className="text-xs font-medium text-zinc-400 hover:text-white disabled:opacity-50"
              data-testid="execution-refresh-specs-btn"
            >
              Refresh list
            </button>
            {specs.length > 0 ? (
              <>
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={disabled || running}
                  className="text-xs font-medium text-accent hover:underline disabled:opacity-50"
                  data-testid="execution-select-all-btn"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={disabled || running}
                  className="text-xs font-medium text-zinc-400 hover:underline disabled:opacity-50"
                  data-testid="execution-clear-selection-btn"
                >
                  Clear
                </button>
              </>
            ) : null}
          </div>
        </div>
        {specs.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No spec files in <code className="text-zinc-400">frameworks/…/tests/</code> yet. Generate tests from
            Test plans, then click Refresh list.
          </p>
        ) : (
          <ul className="max-h-56 space-y-0.5 overflow-auto rounded-lg border border-white/5 bg-black/20 p-2">
            {specs.map((s) => (
              <li key={s.path}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5">
                  <input
                    type="checkbox"
                    checked={selected.has(s.path)}
                    disabled={disabled || running}
                    onChange={() => toggleSpec(s.path)}
                    className="rounded border-white/20"
                  />
                  <span className="font-mono text-xs text-zinc-300">{s.path}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1 text-xs font-medium text-zinc-400">
          Environment (optional)
          <select
            value={environmentId}
            disabled={disabled}
            onChange={(e) => setEnvironmentId(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white"
            data-testid="execution-environment-select"
          >
            <option value="">Default from {testConfigFileName(platformType)}</option>
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name} ({env.slug})
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1 text-xs font-medium text-zinc-400">
          Grep / title filter (optional)
          <input
            value={grep}
            disabled={disabled}
            onChange={(e) => setGrep(e.target.value)}
            placeholder="@smoke"
            className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white"
            data-testid="execution-grep-input"
          />
        </label>
        <div className="flex shrink-0 flex-wrap gap-2">
          {running ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => void stopExecution()}
              className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-4 py-2 text-sm font-medium text-rose-100 hover:bg-rose-950/80 disabled:opacity-50"
              data-testid="execution-stop-btn"
            >
              Stop
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled || running}
            onClick={() => void runTests()}
            className="ui-btn-primary"
            data-testid="execution-run-btn"
          >
            {running
              ? "Running…"
              : `Run on ${executionProviderLabel((selectedProvider || config.provider) as ExecutionProvider)}`}
          </button>
          {ciPipeline.configured && ciPipeline.provider !== null && !running && (
            <button
              type="button"
              disabled={disabled || running}
              onClick={() => void runViaCi()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/15 disabled:opacity-50 transition"
              data-testid="execution-run-ci-btn"
            >
              <PipelineIcon />
              Run via {ciProviderLabel(ciPipeline.provider)}
            </button>
          )}
        </div>
      </div>

      {lastStatus !== null ? (
        <p className="text-sm text-zinc-300">
          Status:{" "}
          <span
            className={
              lastStatus === "passed"
                ? "font-semibold text-accent"
                : lastStatus === "failed"
                  ? "font-semibold text-rose-400"
                  : lastStatus === "running"
                    ? "font-semibold text-amber-300"
                    : lastStatus === "cancelled"
                      ? "font-semibold text-zinc-400"
                      : "font-semibold text-zinc-200"
            }
          >
            {lastStatus}
            {running ? " (live)" : ""}
          </span>
        </p>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-white">Live log</h3>
        {output !== null ? (
          <pre
            ref={logRef}
            className="max-h-[min(60vh,28rem)] overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-zinc-200"
          >
            {output}
          </pre>
        ) : (
          <p className="text-sm text-zinc-500">
            Start a run to stream output here.{" "}
            {ciPipeline.configured && ciPipeline.provider !== null && (
              <span className="text-zinc-600">
                CI pipeline runs report back when they finish.
              </span>
            )}
          </p>
        )}
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
