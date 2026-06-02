"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { executionProviderLabel, type ExecutionConfig } from "@jagadeeshqtsolv/core";

type ExecutionProvider = ExecutionConfig["provider"];
import type {
  AnalysisSummary,
  RecentRun,
  ResultsAnalysisBody,
  RunDetailBody,
} from "./test-run-report-types";

type DiffLine = { type: "same" | "removed" | "added"; text: string };

function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0) as number[]);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: "same", text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", text: b[j - 1] });
      j--;
    } else {
      result.unshift({ type: "removed", text: a[i - 1] });
      i--;
    }
  }
  return result;
}

function DiffView({ before, after }: { before: string; after: string }) {
  const lines = diffLines(before, after);
  const CONTEXT = 4;

  const visible = new Set<number>();
  lines.forEach((l, i) => {
    if (l.type !== "same") {
      for (let k = Math.max(0, i - CONTEXT); k <= Math.min(lines.length - 1, i + CONTEXT); k++) {
        visible.add(k);
      }
    }
  });

  if (visible.size === 0) {
    return <p className="px-3 py-2 text-[10px] text-slate-400">No line-level changes detected.</p>;
  }

  const hunks: Array<Array<{ idx: number; line: DiffLine }>> = [];
  let currentHunk: Array<{ idx: number; line: DiffLine }> = [];
  let lastVisible = -2;

  [...visible].sort((a, b) => a - b).forEach((idx) => {
    if (idx > lastVisible + 1 && currentHunk.length > 0) {
      hunks.push(currentHunk);
      currentHunk = [];
    }
    currentHunk.push({ idx, line: lines[idx] });
    lastVisible = idx;
  });
  if (currentHunk.length > 0) hunks.push(currentHunk);

  return (
    <div className="overflow-x-auto">
      {hunks.map((hunk, hi) => (
        <div key={hi}>
          {hi > 0 && (
            <div className="bg-slate-800 px-3 py-0.5 text-[9px] text-slate-500">···</div>
          )}
          {hunk.map(({ idx, line }) => {
            const prefix = line.type === "added" ? "+" : line.type === "removed" ? "-" : " ";
            const bg =
              line.type === "added"
                ? "bg-emerald-950/60 text-emerald-300"
                : line.type === "removed"
                  ? "bg-rose-950/60 text-rose-300"
                  : "text-slate-400";
            return (
              <div key={idx} className={`flex ${bg}`}>
                <span className="w-8 shrink-0 select-none border-r border-slate-700 px-1.5 text-right text-[9px] opacity-50 tabular-nums">
                  {idx + 1}
                </span>
                <span className="w-4 shrink-0 select-none px-1 text-[10px] font-bold">{prefix}</span>
                <span className="flex-1 whitespace-pre font-mono text-[10px] leading-relaxed">{line.text}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function HealChangesPanel({
  changes,
}: {
  changes: Array<{ path: string; linesAdded: number; linesRemoved: number; before: string; after: string }>;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-semibold text-amber-800">
        Auto-heal changes — {changes.length} file{changes.length === 1 ? "" : "s"} updated
      </p>
      {changes.map((f, i) => (
        <div key={f.path} className="overflow-hidden rounded-lg border border-slate-700 bg-slate-900">
          <button
            type="button"
            onClick={() => setOpenIdx(openIdx === i ? null : i)}
            className="flex w-full items-center justify-between bg-slate-800 px-3 py-2 text-left hover:bg-slate-700"
          >
            <span className="truncate font-mono text-[11px] text-slate-300">{f.path}</span>
            <span className="ml-3 flex shrink-0 items-center gap-2 text-[10px]">
              {f.linesAdded > 0 && <span className="text-emerald-400">+{f.linesAdded}</span>}
              {f.linesRemoved > 0 && <span className="text-rose-400">-{f.linesRemoved}</span>}
              <span className="text-slate-500">{openIdx === i ? "▴" : "▾"}</span>
            </span>
          </button>
          {openIdx === i ? (
            <div className="max-h-[480px] overflow-auto border-t border-slate-700">
              <DiffView before={f.before} after={f.after} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ReportStepList({
  steps,
  depth = 0,
}: {
  steps: NonNullable<NonNullable<ResultsAnalysisBody["cases"]>[number]["steps"]>;
  depth?: number;
}) {
  return (
    <ul className={`mt-1 space-y-0.5 ${depth > 0 ? "ml-3 border-l border-slate-200 pl-2" : ""}`}>
      {steps.map((step, i) => (
        <li key={`${step.title}-${i}`} className="text-[10px] text-slate-500">
          <span className={step.status === "failed" ? "text-rose-600" : "text-slate-600"}>{step.title}</span>
          {step.durationMs > 0 ? (
            <span className="ml-1 tabular-nums text-slate-400">({step.durationMs}ms)</span>
          ) : null}
          {step.errorSnippet !== undefined && step.errorSnippet.length > 0 ? (
            <p className="mt-0.5 font-mono text-[9px] text-rose-600/80">{step.errorSnippet}</p>
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


export function TestReportsPanel({
  projectId,
  disabled,
  highlightRunId,
  onRunFinished,
  onNavigate,
}: {
  projectId: string;
  disabled: boolean;
  highlightRunId?: string | null;
  /** Called when a rerun leaves the running state (e.g. to refresh nav highlight). */
  onRunFinished?: (runId: string, status: string) => void;
  /** Called to navigate to another workspace tab. */
  onNavigate?: (tab: import("./project-workspace-nav").WorkspaceTab) => void;
}) {
  const toast = useToast();
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [focusedRunId, setFocusedRunId] = useState<string | null>(null);
  const [focusedPipelineUrl, setFocusedPipelineUrl] = useState<string | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [resultsAnalysis, setResultsAnalysis] = useState<ResultsAnalysisBody | null>(null);
  const [analysisSummary, setAnalysisSummary] = useState<AnalysisSummary | undefined>(undefined);
  const [runLog, setRunLog] = useState<string | null>(null);
  const [focusedProvider, setFocusedProvider] = useState<string | null>(null);
  const [healing, setHealing] = useState(false);
  const [healFormOpen, setHealFormOpen] = useState(false);
  const [healProblemDescription, setHealProblemDescription] = useState("");
  const [healChanges, setHealChanges] = useState<Array<{ path: string; linesAdded: number; linesRemoved: number; before: string; after: string }> | null>(null);
  const [runLogOpen, setRunLogOpen] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [healLog, setHealLog] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const prevHighlightRunIdRef = useRef<string | null | undefined>(undefined);

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
    setFocusedPipelineUrl(body.pipelineUrl ?? null);
    setFocusedProvider(body.provider);
    setLastStatus(body.status);
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
      setHealLog(null);
      setRunLogOpen(false);
      setFocusedPipelineUrl(run.pipelineUrl ?? null);
      setFocusedProvider(run.provider);
      setLastStatus(run.status);
      setResultsAnalysis(null);
      setAnalysisSummary(run.analysisSummary);
      setRunLog(run.outputPreview.length > 0 ? run.outputPreview : null);

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
    // Only navigate when highlightRunId itself changes, not every time recentRuns refreshes.
    // Without this guard, loadRuns() calls inside submitHeal trigger this effect and
    // loadRunDetail resets healChanges/healLog, wiping the just-displayed heal result.
    if (highlightRunId === prevHighlightRunIdRef.current) {
      return;
    }
    const run = recentRuns.find((r) => r.id === highlightRunId);
    if (run !== undefined) {
      prevHighlightRunIdRef.current = highlightRunId;
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
        changedFiles?: Array<{ path: string; linesAdded: number; linesRemoved: number; before: string; after: string }>;
        error?: string;
      };
      if (!res.ok) {
        toast.error(body.error ?? "Heal failed");
        return;
      }
      const tests = body.healedTestPaths ?? [];
      const pages = body.healedPagePaths ?? [];
      const allHealed = [...tests, ...pages];
      toast.success(
        allHealed.length > 0
          ? `Healed ${allHealed.length} file(s)`
          : "Heal Completed",
      );
      const logSummary =
        allHealed.length > 0
          ? `Updated ${allHealed.length} file(s): ${allHealed.map((f) => f.split("/").pop()).join(", ")}`
          : "Heal analysis complete — model found no changes needed";
      setHealFormOpen(false);
      setHealProblemDescription("");
      setHealChanges(body.changedFiles ?? null);
      setHealLog(logSummary);
      setRunLogOpen(true);
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
    return <p className="text-sm text-slate-500">Loading reports…</p>;
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
              <path strokeLinecap="round" d="M14 4v4h4M8 12h8M8 16h5" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Test Reports</h2>
            <p className="text-xs text-slate-500">
              Pass/fail breakdown · step details ·{" "}
              <button type="button" onClick={() => onNavigate?.("test-execution")} className="text-green-700 hover:underline">
                Start a new run
              </button>
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,280px)_1fr] lg:divide-x lg:divide-slate-100">
        {/* Left — run history */}
        <div className="bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <svg className="h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Run History</p>
            </div>
            <button type="button" disabled={disabled} onClick={() => void loadRuns()}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 disabled:opacity-40 transition"
              title="Refresh" data-testid="reports-refresh-btn">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
          {recentRuns.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 bg-white py-10 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
                <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="mt-2.5 text-sm font-medium text-slate-500">No runs yet</p>
              <p className="mt-0.5 text-xs text-slate-400">Start a run from Test Execution.</p>
            </div>
          ) : (
            <ul className="max-h-[min(70vh,520px)] space-y-1.5 overflow-auto pr-0.5">
              {recentRuns.map((r) => {
                const isActive = focusedRunId === r.id;
                const statusDot =
                  r.status === "passed"  ? "bg-emerald-500 shadow-emerald-200 shadow-sm" :
                  r.status === "failed"  ? "bg-rose-500 shadow-rose-200 shadow-sm" :
                  r.status === "running" ? "bg-amber-400 shadow-amber-200 shadow-sm" :
                                           "bg-slate-400";
                const activeStyle =
                  r.status === "passed"  ? "border-emerald-200 bg-emerald-50/70 shadow-emerald-100" :
                  r.status === "failed"  ? "border-rose-200 bg-rose-50/60 shadow-rose-100" :
                  r.status === "running" ? "border-amber-200 bg-amber-50/60 shadow-amber-100" :
                                           "border-cyan-200 bg-cyan-50 shadow-cyan-100";
                const dt = new Date(r.createdAt);
                const dateStr = dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                const timeStr = dt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setHealChanges(null);
                        setHealLog(null);
                        void loadRunDetail(r);
                      }}
                      data-testid={`reports-run-item-${r.id}`}
                      className={`group w-full rounded-xl border px-3 py-3 text-left shadow-sm transition-all duration-150 ${
                        isActive
                          ? `${activeStyle} shadow-sm`
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 hover:shadow-md"
                      }`}
                    >
                      {/* Name row: label (if set) or date as primary identifier */}
                      <div className="flex items-start justify-between gap-2">
                        <span
                          title={r.label ?? undefined}
                          className={`min-w-0 flex-1 truncate text-[11px] font-bold leading-snug ${
                            isActive ? "text-slate-900" : "text-slate-800"
                          }`}
                        >
                          {r.label !== null && r.label.length > 0
                            ? r.label
                            : `${dateStr} · ${timeStr}`}
                        </span>
                        <span className={`mt-px shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-medium ${
                          isActive ? "bg-white/70 text-slate-600" : "bg-slate-100 text-slate-500"
                        }`}>
                          {r.provider === "ci" ? "CI" : executionProviderLabel(r.provider as ExecutionProvider)}
                        </span>
                      </div>
                      {/* Status row */}
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot} ${r.status === "running" ? "animate-pulse" : ""}`} />
                        <span className={`text-[10px] font-semibold ${
                          r.status === "passed"  ? "text-emerald-700" :
                          r.status === "failed"  ? "text-rose-600" :
                          r.status === "running" ? "text-amber-700" :
                                                   "text-slate-500"
                        }`}>
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </span>
                        {/* Show date/time only when label is present (otherwise it's the name) */}
                        {r.label !== null && r.label.length > 0 && (
                          <span className="ml-1 text-[10px] text-slate-400">{dateStr} · {timeStr}</span>
                        )}
                      </div>
                      {/* Pass / fail pills */}
                      {r.analysisSummary !== undefined ? (
                        <div className="mt-1.5 flex items-center gap-1.5 pl-3.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                            Pass {r.analysisSummary.passed}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                            Fail {r.analysisSummary.failed}
                          </span>
                          {r.analysisSummary.flaky > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              ≈ {r.analysisSummary.flaky}
                            </span>
                          )}
                          <span className="ml-auto text-[9px] text-slate-400 tabular-nums">
                            {r.analysisSummary.total} total
                          </span>
                        </div>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right — run detail */}
        <div className="min-w-0 p-5 space-y-4">
          {focusedRunId === null ? (
            <div className="flex flex-col items-center py-16 text-center">
              <svg className="h-10 w-10 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
                <path strokeLinecap="round" d="M14 4v4h4M8 12h8M8 16h5" />
              </svg>
              <p className="mt-3 text-sm font-medium text-slate-500">Select a run to view its report</p>
            </div>
          ) : (
            <>
              {/* Run name / label header */}
              {(() => {
                const focusedRun = recentRuns.find((r) => r.id === focusedRunId);
                const focusedLabel = focusedRun?.label ?? null;
                const focusedDt = focusedRun ? new Date(focusedRun.createdAt) : null;
                const focusedDateStr = focusedDt
                  ? focusedDt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                  : null;
                const focusedTimeStr = focusedDt
                  ? focusedDt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
                  : null;
                return (
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="truncate text-sm font-bold text-slate-900" title={focusedLabel ?? undefined}>
                      {focusedLabel !== null && focusedLabel.length > 0
                        ? focusedLabel
                        : focusedDateStr
                          ? `Run · ${focusedDateStr} ${focusedTimeStr ?? ""}`
                          : "Test Run"}
                    </h3>
                    {focusedLabel !== null && focusedLabel.length > 0 && focusedDateStr !== null && (
                      <p className="mt-0.5 text-[11px] text-slate-400">{focusedDateStr} · {focusedTimeStr}</p>
                    )}
                  </div>
                );
              })()}

              {lastStatus !== null && (
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                    lastStatus === "passed"   ? "bg-green-50 text-green-700 ring-1 ring-green-200" :
                    lastStatus === "failed"   ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200" :
                    lastStatus === "running"  ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200" :
                                               "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                  }`}>
                    {lastStatus === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
                    {lastStatus ? lastStatus.charAt(0).toUpperCase() + lastStatus.slice(1) : ""}
                  </span>
                  {(lastStatus === "running" || rerunning) && (
                    <span className="text-xs text-amber-700">Test run in progress — log updating below…</span>
                  )}
                </div>
              )}

              {focusedPipelineUrl !== null ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
                  <svg className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <span>{focusedProvider === "browserstack" ? "BrowserStack run:" : "CI run:"}</span>
                  <a
                    href={focusedPipelineUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-mono text-green-700 hover:underline"
                  >
                    {focusedPipelineUrl}
                  </a>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {runInProgress ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void stopExecution()}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    data-testid="reports-stop-btn"
                  >
                    Stop
                  </button>
                ) : null}
                {lastStatus !== null && lastStatus !== "running" ? (
                  <>
                  {focusedProvider !== "ci" && focusedProvider !== "browserstack" ? (
                    <button
                      type="button"
                      disabled={disabled}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-slate-50 disabled:opacity-50"
                      onClick={() =>
                        window.open(
                          `/api/projects/${projectId}/framework/playwright-report/index.html`,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                      data-testid="reports-html-btn"
                    >
                      HTML report
                    </button>
                  ) : null}
                  {(lastStatus === "failed" || (analysisSummary !== undefined && analysisSummary.failed + analysisSummary.flaky > 0)) ? (
                    <button
                      type="button"
                      disabled={disabled || healing}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                      onClick={() => setHealFormOpen((open) => !open)}
                      data-testid="reports-autoheal-toggle-btn"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      {healFormOpen ? "Hide" : "Auto-heal with AI"}
                    </button>
                  ) : null}
                  </>
                ) : null}
              </div>

              {healFormOpen &&
              (lastStatus === "failed" || (analysisSummary !== undefined && analysisSummary.failed + analysisSummary.flaky > 0)) ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-amber-800">How auto-heal works</h3>
                    <p className="mt-1 text-xs leading-relaxed text-amber-800/80">
                      Sends failed/flaky cases from this run&apos;s JSON report, the run log, your page object
                      catalog, and the current spec files to the project&apos;s OpenAI model. The model returns
                      updated <code className="rounded bg-slate-100 px-1">tests/*.spec.ts</code> and optionally{" "}
                      <code className="rounded bg-slate-100 px-1">pageobjects/*.ts</code> files, which are written to
                      the framework on disk. Review changes, then <strong className="font-medium">Rerun</strong> to
                      verify. Requires project OpenAI settings in Setup and{" "}
                      <code className="rounded bg-slate-100 px-1">logs/playwright-report.json</code> from the run.
                    </p>
                    {failingCaseTitles.length > 0 ? (
                      <p className="mt-2 text-[11px] text-amber-800/70">
                        Targets ({failingCaseTitles.length}):{" "}
                        {failingCaseTitles.slice(0, 8).join(" · ")}
                        {failingCaseTitles.length > 8 ? " …" : ""}
                      </p>
                    ) : null}
                  </div>
                  <label className="block">
                    <span className="text-xs font-medium text-amber-800/90">
                      Describe the problem <span className="font-normal text-amber-800/50">(optional)</span>
                    </span>
                    <textarea
                      value={healProblemDescription}
                      onChange={(e) => setHealProblemDescription(e.target.value)}
                      disabled={disabled || healing}
                      rows={4}
                      maxLength={4000}
                      placeholder="e.g. Login button label changed to Sign in; tests time out waiting for Catalog tab; flaky scroll on product list…"
                      className="mt-1.5 w-full resize-y rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-amber-200 focus:outline-none disabled:opacity-50"
                      data-testid="reports-heal-description-textarea"
                    />
                    <span className="mt-1 block text-[10px] text-amber-800/50 tabular-nums">
                      {healProblemDescription.length}/4000
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={disabled || healing}
                      className="rounded-lg bg-amber-600/90 px-3 py-1.5 text-xs font-medium text-slate-900 hover:bg-amber-600 disabled:opacity-50"
                      onClick={() => void submitHeal()}
                      data-testid="reports-heal-submit-btn"
                    >
                      {healing ? "Healing…" : "Submit auto-heal"}
                    </button>
                    <button
                      type="button"
                      disabled={healing}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50"
                      onClick={() => {
                        setHealFormOpen(false);
                        setHealProblemDescription("");
                      }}
                      data-testid="reports-heal-cancel-btn"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {lastStatus !== null && lastStatus !== "running" && analysisSummary !== undefined ? (
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Results analysis</h3>
                    {resultsAnalysis?.stats?.durationMs !== undefined && resultsAnalysis.stats.durationMs > 0 ? (
                      <span className="text-[11px] text-slate-500">
                        Suite ~{(resultsAnalysis.stats.durationMs / 1000).toFixed(1)}s
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Passed {analysisSummary.passed}
                    </span>
                    <span className="rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-600">
                      Failed {analysisSummary.failed}
                    </span>
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Flaky {analysisSummary.flaky}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Skipped {analysisSummary.skipped}
                    </span>
                    <span className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-500">
                      Total {analysisSummary.total}
                    </span>
                  </div>
                  {resultsAnalysis?.truncated === true ? (
                    <p className="mt-2 text-[11px] text-amber-700">
                      Case list truncated for storage — open the HTML report for the full trace.
                    </p>
                  ) : null}
                  {resultsAnalysis?.cases !== undefined && resultsAnalysis.cases.length > 0 ? (
                    <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-200">
                      <table className="w-full border-collapse text-left text-[11px]">
                        <thead className="sticky top-0 bg-white text-slate-500">
                          <tr>
                            <th className="p-2 font-medium">Status</th>
                            <th className="p-2 font-medium">Test</th>
                            <th className="p-2 font-medium">File</th>
                            <th className="p-2 font-medium text-right">ms</th>
                          </tr>
                        </thead>
                        <tbody className="text-slate-600">
                          {sortCasesForDisplay(resultsAnalysis.cases).map((row, i) => (
                            <tr key={`${row.title}-${i}`} className="border-t border-slate-200 align-top">
                              <td className="whitespace-nowrap p-2">
                                <span
                                  className={
                                    row.status === "failed"
                                      ? "text-rose-600"
                                      : row.status === "flaky"
                                        ? "text-amber-700"
                                        : row.status === "skipped"
                                          ? "text-slate-500"
                                          : "text-emerald-700"
                                  }
                                >
                                  {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                                </span>
                              </td>
                              <td className="p-2">
                                <span className="text-slate-700">{row.title}</span>
                                {row.steps !== undefined && row.steps.length > 0 ? (
                                  <ReportStepList steps={row.steps} />
                                ) : null}
                                {row.errorSnippet !== undefined && row.errorSnippet.length > 0 ? (
                                  <p className="mt-1 whitespace-pre-wrap font-mono text-[10px] text-rose-600/90">
                                    {row.errorSnippet}
                                  </p>
                                ) : null}
                              </td>
                              <td className="p-2 font-mono text-[10px] text-slate-500">
                                {row.file}
                                {row.line !== undefined ? `:${row.line}` : ""}
                              </td>
                              <td className="p-2 text-right tabular-nums text-slate-500">{row.durationMs}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              ) : lastStatus !== null && lastStatus !== "running" ? (
                <p className="text-[11px] text-slate-500">
                  No structured JSON report for this run. Sync an environment so reporters write{" "}
                  <code className="rounded bg-slate-100 px-1">logs/playwright-report.json</code>, then re-run tests.
                </p>
              ) : null}

              {(healLog !== null || (healChanges !== null && healChanges.length > 0)) ? (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <h3 className="text-sm font-semibold text-amber-800">Auto-heal result</h3>
                  </div>
                  {healLog !== null && (
                    <p className="text-xs text-amber-700/90">{healLog}</p>
                  )}
                  {healChanges !== null && healChanges.length > 0 && (
                    <HealChangesPanel changes={healChanges} />
                  )}
                </div>
              ) : null}

              {runLog !== null ? (
                <details
                  className="overflow-hidden rounded-xl border border-slate-200"
                  open={lastStatus === "running" || rerunning || runLogOpen}
                  onToggle={(e) => setRunLogOpen((e.currentTarget as HTMLDetailsElement).open)}
                >
                  <summary className="flex cursor-pointer items-center gap-2 bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                    <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z" />
                    </svg>
                    {lastStatus === "running" || rerunning ? "Live run log" : "Run log"}
                    {(lastStatus === "running" || rerunning) && <span className="ml-1 h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
                    {healChanges !== null && healChanges.length > 0 && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-700">auto-heal applied</span>}
                  </summary>
                  <pre className="max-h-56 overflow-x-auto whitespace-pre-wrap break-all bg-slate-900 p-4 font-mono text-[10px] leading-relaxed text-slate-300">
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