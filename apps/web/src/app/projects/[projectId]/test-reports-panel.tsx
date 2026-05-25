"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { executionProviderLabel, type ExecutionConfig } from "@automation-ai/core";
import {
  buildRerunAllParams,
  buildRerunFailuresParams,
  type RerunResultsAnalysis,
} from "@/lib/test-execution/rerun-params";

type ExecutionProvider = ExecutionConfig["provider"];
import type {
  AnalysisSummary,
  RecentRun,
  ResultsAnalysisBody,
  RunDetailBody,
} from "./test-run-report-types";

function ReportStepList({
  steps,
  depth = 0,
}: {
  steps: NonNullable<NonNullable<ResultsAnalysisBody["cases"]>[number]["steps"]>;
  depth?: number;
}) {
  return (
    <ul className={`mt-1 space-y-0.5 ${depth > 0 ? "ml-3 border-l border-white/10 pl-2" : ""}`}>
      {steps.map((step, i) => (
        <li key={`${step.title}-${i}`} className="text-[10px] text-zinc-400">
          <span className={step.status === "failed" ? "text-rose-300" : "text-zinc-300"}>{step.title}</span>
          {step.durationMs > 0 ? (
            <span className="ml-1 tabular-nums text-zinc-600">({step.durationMs}ms)</span>
          ) : null}
          {step.errorSnippet !== undefined && step.errorSnippet.length > 0 ? (
            <p className="mt-0.5 font-mono text-[9px] text-rose-300/80">{step.errorSnippet}</p>
          ) : null}
          {step.steps !== undefined && step.steps.length > 0 ? (
            <ReportStepList steps={step.steps} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function sortCasesForDisplay(
  cases: NonNullable<ResultsAnalysisBody["cases"]>,
): NonNullable<ResultsAnalysisBody["cases"]> {
  const list = [...cases];
  const rank = (s: string): number =>
    s === "failed" ? 0 : s === "flaky" ? 1 : s === "skipped" ? 2 : 3;
  list.sort((a, b) => rank(a.status) - rank(b.status) || a.title.localeCompare(b.title));
  return list;
}

function formatRunLog(body: RunDetailBody): string {
  const display =
    body.command.length > 0 && !body.output.includes(body.command)
      ? `$ ${body.command}\n\n${body.output}`
      : body.output;
  return display.trim().length > 0 ? display : "(no output)";
}

const POLL_MS = 1000;

function rerunAnalysisFromBody(body: ResultsAnalysisBody | null): RerunResultsAnalysis | null {
  if (body?.cases === undefined || body.cases.length === 0) {
    return null;
  }
  return { cases: body.cases };
}

type RerunContext = {
  specPaths: string[];
  environmentId: string | null;
  command: string;
  resultsAnalysis: ResultsAnalysisBody | null;
};

export function TestReportsPanel({
  projectId,
  disabled,
  highlightRunId,
  onRunFinished,
}: {
  projectId: string;
  disabled: boolean;
  highlightRunId?: string | null;
  /** Called when a rerun leaves the running state (e.g. to refresh nav highlight). */
  onRunFinished?: (runId: string, status: string) => void;
}) {
  const toast = useToast();
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null);
  const [focusedHtmlReportRel, setFocusedHtmlReportRel] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [resultsAnalysis, setResultsAnalysis] = useState<ResultsAnalysisBody | null>(null);
  const [analysisSummary, setAnalysisSummary] = useState<AnalysisSummary | undefined>(undefined);
  const [runLog, setRunLog] = useState<string | null>(null);
  const [rerunContext, setRerunContext] = useState<RerunContext | null>(null);
  const [healing, setHealing] = useState(false);
  const [healFormOpen, setHealFormOpen] = useState(false);
  const [healProblemDescription, setHealProblemDescription] = useState("");
  const [rerunning, setRerunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRunIdRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    activeRunIdRef.current = null;
  }, []);

  const applyRunDetail = useCallback((body: RunDetailBody) => {
    setRunLog(formatRunLog(body));
    setResultsAnalysis(body.resultsAnalysis ?? null);
    setAnalysisSummary(body.analysisSummary);
    setFocusedHtmlReportRel(body.htmlReportRel ?? null);
    setLastStatus(body.status);
    setRerunContext({
      specPaths: body.specPaths,
      environmentId: body.environmentId,
      command: body.command,
      resultsAnalysis: body.resultsAnalysis ?? null,
    });
  }, []);

  const loadRuns = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/test-runs`);
    if (!res.ok) {
      toast.error("Could not load test runs");
      return [];
    }
    const body = (await res.json()) as { recentRuns?: RecentRun[] };
    const runs = body.recentRuns ?? [];
    setRecentRuns(runs);
    return runs;
  }, [projectId, toast]);

  const loadRunDetail = useCallback(
    async (run: RecentRun) => {
      setFocusedRunId(run.id);
      setHealFormOpen(false);
      setHealProblemDescription("");
      setFocusedHtmlReportRel(run.htmlReportRel);
      setLastStatus(run.status);
      setResultsAnalysis(null);
      setAnalysisSummary(run.analysisSummary);
      setRunLog(run.outputPreview.length > 0 ? run.outputPreview : null);
      setRerunContext({
        specPaths: run.specPaths,
        environmentId: run.environmentId,
        command: "",
        resultsAnalysis: null,
      });

      try {
        const res = await fetch(`/api/projects/${projectId}/test-runs/${run.id}`);
        if (!res.ok) {
          return;
        }
        const body = (await res.json()) as RunDetailBody;
        applyRunDetail(body);
      } catch {
        /* keep preview */
      }
    },
    [projectId, applyRunDetail],
  );

  const pollRun = useCallback(
    async (runId: string): Promise<boolean> => {
      const res = await fetch(`/api/projects/${projectId}/test-runs/${runId}`);
      if (!res.ok) {
        return false;
      }
      const body = (await res.json()) as RunDetailBody;
      setFocusedRunId(runId);
      applyRunDetail(body);

      if (body.running) {
        return true;
      }

      stopPolling();
      setRerunning(false);
      onRunFinished?.(body.id, body.status);

      await loadRuns();

      if (body.status === "passed") {
        toast.success("Rerun completed successfully");
      } else if (body.status === "failed") {
        toast.error("Rerun finished with failures");
      } else if (body.status === "cancelled") {
        toast.info("Rerun stopped");
      } else {
        toast.info(`Rerun finished (${body.status})`);
      }
      return false;
    },
    [projectId, applyRunDetail, stopPolling, onRunFinished, toast, loadRuns],
  );

  const startPolling = useCallback(
    (runId: string) => {
      stopPolling();
      activeRunIdRef.current = runId;
      setRerunning(true);
      setFocusedRunId(runId);
      setLastStatus("running");
      setRunLog("Starting rerun…\n");

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
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const startTestRun = useCallback(
    async (payload: { specPaths: string[]; environmentId: string | null; grep?: string }) => {
      if (payload.specPaths.length === 0) {
        toast.error("No spec files to run");
        return;
      }
      if (rerunning) {
        return;
      }

      try {
        const res = await fetch(`/api/projects/${projectId}/test-runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            specPaths: payload.specPaths,
            ...(payload.environmentId !== null ? { environmentId: payload.environmentId } : {}),
            ...(payload.grep !== undefined ? { grep: payload.grep } : {}),
          }),
        });
        const body = (await res.json()) as {
          runId?: string;
          status?: string;
          error?: string;
        };

        if (res.status === 409 && typeof body.runId === "string") {
          toast.info("A test run is already in progress — showing live log");
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

        toast.info("Test run started");
        startPolling(body.runId);
      } catch {
        toast.error("Could not start test run");
        setRerunning(false);
        stopPolling();
      }
    },
    [rerunning, projectId, toast, startPolling, stopPolling],
  );

  const rerunAll = useCallback(async () => {
    if (rerunContext === null) {
      return;
    }
    const params = buildRerunAllParams({
      specPaths: rerunContext.specPaths,
      environmentId: rerunContext.environmentId,
      command: rerunContext.command,
    });
    await startTestRun(params);
  }, [rerunContext, startTestRun]);

  const rerunFailuresOnly = useCallback(async () => {
    if (rerunContext === null) {
      return;
    }
    const built = buildRerunFailuresParams({
      specPaths: rerunContext.specPaths,
      environmentId: rerunContext.environmentId,
      resultsAnalysis: rerunAnalysisFromBody(rerunContext.resultsAnalysis),
    });
    if (!built.ok) {
      if (built.reason === "no_analysis") {
        toast.error("No result analysis for this run — rerun all specs instead");
      } else {
        toast.info("No failed tests to rerun");
      }
      return;
    }
    toast.info(`Rerunning ${built.failedCount} failed test${built.failedCount === 1 ? "" : "s"}`);
    await startTestRun(built.params);
  }, [rerunContext, startTestRun, toast]);

  const stopExecution = useCallback(async () => {
    const runId = activeRunIdRef.current;
    if (runId === null || !rerunning) {
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
  }, [projectId, rerunning, toast]);

  const failureRerunPreview =
    rerunContext !== null
      ? buildRerunFailuresParams({
          specPaths: rerunContext.specPaths,
          environmentId: rerunContext.environmentId,
          resultsAnalysis: rerunAnalysisFromBody(rerunContext.resultsAnalysis),
        })
      : null;
  const canRerunFailures = failureRerunPreview?.ok === true;

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const runs = await loadRuns();
      setLoading(false);
      if (runs.length === 0) {
        return;
      }
      const inProgress = runs.find((r) => r.status === "running" && r.finishedAt === null);
      if (inProgress !== undefined && !rerunning) {
        startPolling(inProgress.id);
        return;
      }
      let preferred: RecentRun | undefined;
      if (highlightRunId !== undefined && highlightRunId !== null) {
        preferred = runs.find((r) => r.id === highlightRunId) ?? runs[0];
      } else {
        preferred = runs[0];
      }
      if (preferred !== undefined) {
        void loadRunDetail(preferred);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [loadRuns, loadRunDetail, highlightRunId]);

  useEffect(() => {
    if (highlightRunId === undefined || highlightRunId === null) {
      return;
    }
    const run = recentRuns.find((r) => r.id === highlightRunId);
    if (run !== undefined) {
      void loadRunDetail(run);
    }
  }, [highlightRunId, recentRuns, loadRunDetail]);

  const submitHeal = useCallback(async () => {
    if (focusedRunId === null) {
      return;
    }
    setHealing(true);
    try {
      const trimmed = healProblemDescription.trim();
      const res = await fetch(`/api/projects/${projectId}/test-runs/${focusedRunId}/heal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(trimmed.length > 0 ? { problemDescription: trimmed } : {}),
        }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        healedTestPaths?: string[];
        healedPagePaths?: string[];
        model?: string;
        error?: string;
      };
      if (!res.ok) {
        toast.error(body.error ?? "Heal failed");
        return;
      }
      const tests = body.healedTestPaths ?? [];
      const pages = body.healedPagePaths ?? [];
      toast.success(
        tests.length + pages.length > 0
          ? `Updated tests: ${tests.join(", ") || "—"}; page objects: ${pages.join(", ") || "—"}`
          : "Heal completed",
      );
      setHealFormOpen(false);
      setHealProblemDescription("");
      await loadRuns();
      const detailRes = await fetch(`/api/projects/${projectId}/test-runs/${focusedRunId}`);
      if (detailRes.ok) {
        const runBody = (await detailRes.json()) as RunDetailBody;
        setRunLog(formatRunLog(runBody));
      }
    } catch {
      toast.error("Heal request failed");
    } finally {
      setHealing(false);
    }
  }, [focusedRunId, projectId, toast, loadRuns, healProblemDescription]);

  const failingCaseTitles =
    resultsAnalysis?.cases
      ?.filter((c) => c.status === "failed" || c.status === "flaky")
      .map((c) => c.title) ?? [];

  const runInProgress =
    rerunning || recentRuns.some((r) => r.status === "running" && r.finishedAt === null);

  if (loading) {
    return <p className="text-sm text-zinc-400">Loading reports…</p>;
  }

  return (
    <section className="space-y-6 rounded-2xl border border-white/10 bg-ink-900/40 p-6">
      <header>
        <h2 className="text-lg font-semibold text-white">Test reports</h2>
        <p className="mt-1 text-sm text-zinc-400">
          HTML reports, pass/fail breakdown, and per-step results from finished runs. Use{" "}
          <strong className="font-medium text-zinc-300">Test execution</strong> to start a new run and watch live
          logs.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,280px)_1fr]">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Run history</h3>
            <button
              type="button"
              disabled={disabled}
              onClick={() => void loadRuns()}
              className="text-xs font-medium text-zinc-400 hover:text-white disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
          {recentRuns.length === 0 ? (
            <p className="text-sm text-zinc-500">No runs yet. Start a run from Test execution.</p>
          ) : (
            <ul className="max-h-[min(70vh,520px)] space-y-2 overflow-auto rounded-xl border border-white/10 bg-ink-950/40 p-2">
              {recentRuns.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void loadRunDetail(r)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                      focusedRunId === r.id
                        ? "border-accent/40 bg-accent/10 text-zinc-200"
                        : "border-transparent text-zinc-400 hover:border-white/10 hover:bg-white/5"
                    }`}
                  >
                    <span
                      className={
                        r.status === "passed"
                          ? "font-semibold text-accent"
                          : r.status === "failed"
                            ? "font-semibold text-rose-400"
                            : r.status === "running"
                              ? "font-semibold text-amber-300"
                              : "font-semibold text-zinc-300"
                      }
                    >
                      {r.status}
                    </span>
                    {" · "}
                    {r.provider === "ci" ? "CI Pipeline" : executionProviderLabel(r.provider as ExecutionProvider)}
                    <p className="mt-1 text-[10px] text-zinc-500">{new Date(r.createdAt).toLocaleString()}</p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">{r.specPaths.join(", ")}</p>
                    {r.analysisSummary !== undefined ? (
                      <p className="mt-1 text-[10px] text-zinc-500">
                        Passed {r.analysisSummary.passed} · Failed {r.analysisSummary.failed}
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {focusedRunId === null ? (
            <p className="text-sm text-zinc-500">Select a run to view its report.</p>
          ) : (
            <>
              {lastStatus !== null ? (
                <p className="text-sm text-zinc-300">
                  Run status:{" "}
                  <span
                    className={
                      lastStatus === "passed"
                        ? "font-semibold text-accent"
                        : lastStatus === "failed"
                          ? "font-semibold text-rose-400"
                          : lastStatus === "running"
                            ? "font-semibold text-amber-300"
                            : "font-semibold text-zinc-200"
                    }
                  >
                    {lastStatus}
                  </span>
                </p>
              ) : null}

              {lastStatus === "running" || rerunning ? (
                <p className="text-sm text-amber-200/90">Test run in progress — log updates below.</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {runInProgress ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void stopExecution()}
                    className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-950/80 disabled:opacity-50"
                  >
                    Stop
                  </button>
                ) : null}
                {rerunContext !== null && rerunContext.specPaths.length > 0 && !runInProgress ? (
                  <>
                    <button
                      type="button"
                      disabled={disabled}
                      className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-950/80 disabled:opacity-50"
                      onClick={() => void rerunAll()}
                    >
                      Rerun all
                    </button>
                    <button
                      type="button"
                      disabled={disabled || !canRerunFailures}
                      title={
                        canRerunFailures
                          ? `Rerun ${failureRerunPreview?.ok === true ? failureRerunPreview.failedCount : 0} failed test(s) only`
                          : "No failed tests in this run"
                      }
                      className="rounded-lg border border-amber-500/35 bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-950/60 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => void rerunFailuresOnly()}
                    >
                      Rerun failures only
                    </button>
                  </>
                ) : null}
                {lastStatus !== null && lastStatus !== "running" ? (
                  <>
                  <button
                    type="button"
                    disabled={disabled}
                    className="rounded-lg border border-white/15 bg-ink-950/60 px-3 py-1.5 text-xs font-medium text-accent hover:bg-white/5 disabled:opacity-50"
                    onClick={() =>
                      window.open(
                        `/api/projects/${projectId}/framework/playwright-report/index.html`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    Latest HTML report
                  </button>
                  {focusedHtmlReportRel !== null && focusedHtmlReportRel.length > 0 ? (
                    <button
                      type="button"
                      disabled={disabled}
                      className="rounded-lg border border-white/15 bg-ink-950/60 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-white/5 disabled:opacity-50"
                      onClick={() =>
                        window.open(
                          `/api/projects/${projectId}/test-runs/${focusedRunId}/html-report/`,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      This run snapshot (HTML)
                    </button>
                  ) : (
                    <span className="text-[10px] text-zinc-500">
                      No archived HTML for this run — use Latest or re-run to capture a snapshot.
                    </span>
                  )}
                  {analysisSummary !== undefined && analysisSummary.failed + analysisSummary.flaky > 0 ? (
                    <button
                      type="button"
                      disabled={disabled || healing}
                      className="rounded-lg border border-amber-500/40 bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-950/70 disabled:opacity-50"
                      onClick={() => setHealFormOpen((open) => !open)}
                    >
                      {healFormOpen ? "Hide auto-heal" : "Auto-heal failures (AI)"}
                    </button>
                  ) : null}
                  </>
                ) : null}
              </div>

              {healFormOpen &&
              analysisSummary !== undefined &&
              analysisSummary.failed + analysisSummary.flaky > 0 ? (
                <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-amber-100">How auto-heal works</h3>
                    <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
                      Sends failed/flaky cases from this run&apos;s JSON report, the run log, your page object
                      catalog, and the current spec files to the project&apos;s OpenAI model. The model returns
                      updated <code className="rounded bg-black/30 px-1">tests/*.spec.ts</code> and optionally{" "}
                      <code className="rounded bg-black/30 px-1">pageobjects/*.ts</code> files, which are written to
                      the framework on disk. Review changes, then <strong className="font-medium">Rerun</strong> to
                      verify. Requires project OpenAI settings in Setup and{" "}
                      <code className="rounded bg-black/30 px-1">logs/playwright-report.json</code> from the run.
                    </p>
                    {failingCaseTitles.length > 0 ? (
                      <p className="mt-2 text-[11px] text-amber-100/70">
                        Targets ({failingCaseTitles.length}):{" "}
                        {failingCaseTitles.slice(0, 8).join(" · ")}
                        {failingCaseTitles.length > 8 ? " …" : ""}
                      </p>
                    ) : null}
                  </div>
                  <label className="block">
                    <span className="text-xs font-medium text-amber-100/90">
                      Describe the problem <span className="font-normal text-amber-100/50">(optional)</span>
                    </span>
                    <textarea
                      value={healProblemDescription}
                      onChange={(e) => setHealProblemDescription(e.target.value)}
                      disabled={disabled || healing}
                      rows={4}
                      maxLength={4000}
                      placeholder="e.g. Login button label changed to Sign in; tests time out waiting for Catalog tab; flaky scroll on product list…"
                      className="mt-1.5 w-full resize-y rounded-lg border border-amber-500/20 bg-ink-950/60 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/40 focus:outline-none disabled:opacity-50"
                    />
                    <span className="mt-1 block text-[10px] text-amber-100/50 tabular-nums">
                      {healProblemDescription.length}/4000
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={disabled || healing}
                      className="rounded-lg bg-amber-600/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                      onClick={() => void submitHeal()}
                    >
                      {healing ? "Healing…" : "Submit auto-heal"}
                    </button>
                    <button
                      type="button"
                      disabled={healing}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white disabled:opacity-50"
                      onClick={() => {
                        setHealFormOpen(false);
                        setHealProblemDescription("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {lastStatus !== null && lastStatus !== "running" && analysisSummary !== undefined ? (
                <div className="rounded-xl border border-white/10 bg-ink-950/40 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Results analysis</h3>
                    {resultsAnalysis?.stats?.durationMs !== undefined && resultsAnalysis.stats.durationMs > 0 ? (
                      <span className="text-[11px] text-zinc-500">
                        Suite ~{(resultsAnalysis.stats.durationMs / 1000).toFixed(1)}s
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-md bg-emerald-950/80 px-2 py-0.5 text-xs font-medium text-emerald-300">
                      Passed {analysisSummary.passed}
                    </span>
                    <span className="rounded-md bg-rose-950/80 px-2 py-0.5 text-xs font-medium text-rose-300">
                      Failed {analysisSummary.failed}
                    </span>
                    <span className="rounded-md bg-amber-950/80 px-2 py-0.5 text-xs font-medium text-amber-200">
                      Flaky {analysisSummary.flaky}
                    </span>
                    <span className="rounded-md bg-zinc-800/80 px-2 py-0.5 text-xs font-medium text-zinc-300">
                      Skipped {analysisSummary.skipped}
                    </span>
                    <span className="rounded-md border border-white/10 px-2 py-0.5 text-xs text-zinc-400">
                      Total {analysisSummary.total}
                    </span>
                  </div>
                  {resultsAnalysis?.truncated === true ? (
                    <p className="mt-2 text-[11px] text-amber-300/90">
                      Case list truncated for storage — open the HTML report for the full trace.
                    </p>
                  ) : null}
                  {resultsAnalysis?.cases !== undefined && resultsAnalysis.cases.length > 0 ? (
                    <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-white/5">
                      <table className="w-full border-collapse text-left text-[11px]">
                        <thead className="sticky top-0 bg-ink-950/95 text-zinc-500">
                          <tr>
                            <th className="p-2 font-medium">Status</th>
                            <th className="p-2 font-medium">Test</th>
                            <th className="p-2 font-medium">File</th>
                            <th className="p-2 font-medium text-right">ms</th>
                          </tr>
                        </thead>
                        <tbody className="text-zinc-300">
                          {sortCasesForDisplay(resultsAnalysis.cases).map((row, i) => (
                            <tr key={`${row.title}-${i}`} className="border-t border-white/5 align-top">
                              <td className="whitespace-nowrap p-2">
                                <span
                                  className={
                                    row.status === "failed"
                                      ? "text-rose-400"
                                      : row.status === "flaky"
                                        ? "text-amber-200"
                                        : row.status === "skipped"
                                          ? "text-zinc-500"
                                          : "text-emerald-400"
                                  }
                                >
                                  {row.status}
                                </span>
                              </td>
                              <td className="p-2">
                                <span className="text-zinc-200">{row.title}</span>
                                {row.steps !== undefined && row.steps.length > 0 ? (
                                  <ReportStepList steps={row.steps} />
                                ) : null}
                                {row.errorSnippet !== undefined && row.errorSnippet.length > 0 ? (
                                  <p className="mt-1 whitespace-pre-wrap font-mono text-[10px] text-rose-300/90">
                                    {row.errorSnippet}
                                  </p>
                                ) : null}
                              </td>
                              <td className="p-2 font-mono text-[10px] text-zinc-500">
                                {row.file}
                                {row.line !== undefined ? `:${row.line}` : ""}
                              </td>
                              <td className="p-2 text-right tabular-nums text-zinc-500">{row.durationMs}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : lastStatus !== null && lastStatus !== "running" ? (
                <p className="text-[11px] text-zinc-500">
                  No structured JSON report for this run. Sync an environment so reporters write{" "}
                  <code className="rounded bg-black/30 px-1">logs/playwright-report.json</code>, then re-run tests.
                </p>
              ) : null}

              {runLog !== null ? (
                <details
                  className="rounded-xl border border-white/10 bg-black/30"
                  open={lastStatus === "running" || rerunning}
                >
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-zinc-400">
                    {lastStatus === "running" || rerunning ? "Live run log" : "Run log (from execution)"}
                  </summary>
                  <pre className="max-h-48 overflow-auto border-t border-white/5 p-3 font-mono text-[10px] leading-relaxed text-zinc-400">
                    {runLog}
                  </pre>
                </details>
              ) : null}
            </>
          )}
        </div>
      </div>
    </section>
  );
}