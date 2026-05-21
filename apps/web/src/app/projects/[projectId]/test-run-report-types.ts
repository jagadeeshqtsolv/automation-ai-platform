import type { ExecutionConfig } from "@automation-ai/shared";

export type AnalysisSummary = {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  total: number;
};

export type ResultsAnalysisBody = {
  stats?: {
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
    durationMs?: number;
  };
  cases?: Array<{
    title: string;
    file: string;
    line?: number;
    status: string;
    durationMs: number;
    errorSnippet?: string;
    steps?: Array<{
      title: string;
      durationMs: number;
      status?: string;
      errorSnippet?: string;
      steps?: Array<{ title: string; durationMs: number; status?: string }>;
    }>;
  }>;
  truncated?: boolean;
};

export type RecentRun = {
  id: string;
  provider: string;
  status: string;
  specPaths: string[];
  environmentId: string | null;
  exitCode: number | null;
  outputPreview: string;
  createdAt: string;
  finishedAt: string | null;
  analysisSummary?: AnalysisSummary;
  htmlReportRel: string | null;
};

export type RunDetailBody = {
  id: string;
  status: string;
  output: string;
  command: string;
  specPaths: string[];
  environmentId: string | null;
  exitCode: number | null;
  running: boolean;
  error?: string;
  resultsAnalysis?: ResultsAnalysisBody | null;
  analysisSummary?: AnalysisSummary;
  htmlReportRel?: string | null;
};

export type RecentRunsResponse = {
  specs?: Array<{ path: string; name: string }>;
  config: ExecutionConfig;
  recentRuns: RecentRun[];
};
