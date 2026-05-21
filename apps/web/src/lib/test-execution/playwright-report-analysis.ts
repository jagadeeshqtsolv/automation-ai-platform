import { readFile } from "node:fs/promises";
import path from "node:path";
import { getProjectFrameworkRoot } from "@/lib/local-framework/paths";

/** Relative to framework root — must match mobilewright-environment-config reporter json outputFile. */
export const PLAYWRIGHT_REPORT_JSON_RELATIVE = "logs/playwright-report.json";

const MAX_CASES = 400;
const MAX_ERROR_SNIPPET = 480;

export type TestStepResultAnalysis = {
  title: string;
  durationMs: number;
  status?: "passed" | "failed" | "skipped";
  errorSnippet?: string;
  steps?: TestStepResultAnalysis[];
};

export type TestCaseResultAnalysis = {
  title: string;
  file: string;
  line?: number;
  status: "passed" | "failed" | "flaky" | "skipped";
  durationMs: number;
  errorSnippet?: string;
  /** Playwright test.step() entries from the JSON reporter (Tap, Fill, etc.). */
  steps?: TestStepResultAnalysis[];
};

export type TestRunResultsAnalysis = {
  stats: {
    expected: number;
    unexpected: number;
    flaky: number;
    skipped: number;
    durationMs?: number;
  };
  cases: TestCaseResultAnalysis[];
  truncated?: boolean;
};

type JsonReportTestStep = {
  title?: string;
  duration?: number;
  error?: { message?: string };
  steps?: JsonReportTestStep[];
};

type JsonResult = {
  status?: string;
  duration?: number;
  retry?: number;
  error?: { message?: string };
  errors?: Array<{ message?: string }>;
  steps?: JsonReportTestStep[];
};

type JsonTest = {
  results?: JsonResult[];
};

type JsonSpec = {
  title?: string;
  line?: number;
  file?: string;
  tests?: JsonTest[];
};

type JsonSuite = {
  title?: string;
  file?: string;
  line?: number;
  specs?: JsonSpec[];
  suites?: JsonSuite[];
};

type JsonReportRoot = {
  stats?: {
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
    duration?: number;
  };
  suites?: JsonSuite[];
};

function normalizeFsPath(p: string): string {
  return p.trim().replace(/\\/g, "/");
}

/**
 * Playwright's top suite title is often the spec file path. Omit it from breadcrumbs so the UI matches
 * real describe titles (and avoid odd grouping if a reporter ever nests synthetic "Before Hooks" suites).
 */
function suiteTitleContribution(suite: JsonSuite, inheritedFile: string): string | null {
  if (typeof suite.title !== "string") {
    return null;
  }
  const t = suite.title.trim();
  if (t.length === 0) {
    return null;
  }
  const suiteFile =
    typeof suite.file === "string" && suite.file.trim().length > 0
      ? normalizeFsPath(suite.file)
      : normalizeFsPath(inheritedFile);
  const normTitle = normalizeFsPath(t);
  if (suiteFile.length > 0 && (normTitle === suiteFile || normTitle === path.basename(suiteFile))) {
    return null;
  }
  const lower = t.toLowerCase();
  if (
    lower === "before hooks" ||
    lower === "after hooks" ||
    lower === "worker cleanup" ||
    lower === "worker hooks"
  ) {
    return null;
  }
  return t;
}

function parseReportSteps(raw: JsonReportTestStep[] | undefined, parentFailed: boolean): TestStepResultAnalysis[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  const out: TestStepResultAnalysis[] = [];
  for (const step of raw) {
    if (typeof step.title !== "string" || step.title.trim().length === 0) {
      continue;
    }
    const nested = parseReportSteps(step.steps, parentFailed || step.error !== undefined);
    const stepFailed = step.error !== undefined;
    out.push({
      title: step.title.trim(),
      durationMs: typeof step.duration === "number" ? step.duration : 0,
      ...(stepFailed ? { status: "failed" as const, errorSnippet: snippetFromError(step.error) } : { status: "passed" as const }),
      ...(nested.length > 0 ? { steps: nested } : {}),
    });
  }
  return out;
}

function snippetFromError(error: { message?: string } | undefined): string | undefined {
  if (error === undefined || typeof error.message !== "string") {
    return undefined;
  }
  const t = error.message.trim().replace(/\s+/g, " ");
  return t.length <= MAX_ERROR_SNIPPET ? t : `${t.slice(0, MAX_ERROR_SNIPPET)}…`;
}

function snippetFromResult(r: JsonResult | undefined): string | undefined {
  if (r === undefined) return undefined;
  const msg = r.error?.message ?? r.errors?.find((e) => typeof e.message === "string")?.message;
  if (typeof msg !== "string" || msg.trim().length === 0) return undefined;
  const t = msg.trim().replace(/\s+/g, " ");
  return t.length <= MAX_ERROR_SNIPPET ? t : `${t.slice(0, MAX_ERROR_SNIPPET)}…`;
}

function analyzeTest(fullTitle: string, file: string, line: number | undefined, test: JsonTest): TestCaseResultAnalysis {
  const results = Array.isArray(test.results) ? test.results : [];
  const last = results[results.length - 1];
  const durationMs = results.reduce((sum, x) => sum + (typeof x.duration === "number" ? x.duration : 0), 0);

  const lastStatus = typeof last?.status === "string" ? last.status : "skipped";
  const nonPassBeforeLast = results.slice(0, -1).some((x) => x.status === "failed" || x.status === "timedOut");
  const flaky =
    lastStatus === "passed" &&
    (results.length > 1 || nonPassBeforeLast || (typeof last.retry === "number" && last.retry > 0));

  let status: TestCaseResultAnalysis["status"];
  if (lastStatus === "skipped") {
    status = "skipped";
  } else if (flaky) {
    status = "flaky";
  } else if (lastStatus === "passed") {
    status = "passed";
  } else {
    status = "failed";
  }

  const errorSnippet =
    status === "failed" || status === "flaky" ? snippetFromResult(last) ?? snippetFromResult(results[0]) : undefined;

  const reportSteps = parseReportSteps(last?.steps, status === "failed" || status === "flaky");

  return {
    title: fullTitle,
    file,
    line,
    status,
    durationMs,
    errorSnippet,
    ...(reportSteps.length > 0 ? { steps: reportSteps } : {}),
  };
}

function walkSuite(
  suite: JsonSuite,
  inheritedFile: string,
  titleParts: string[],
  out: TestCaseResultAnalysis[],
): void {
  const file =
    typeof suite.file === "string" && suite.file.trim().length > 0
      ? normalizeFsPath(suite.file)
      : normalizeFsPath(inheritedFile);
  const contrib = suiteTitleContribution(suite, inheritedFile);
  const nextTitles = contrib !== null ? [...titleParts, contrib] : titleParts;

  for (const spec of suite.specs ?? []) {
    const specTitle = typeof spec.title === "string" ? spec.title : "";
    const fullTitle = [...nextTitles.filter(Boolean), specTitle].join(" › ");
    const line = typeof spec.line === "number" ? spec.line : undefined;
    const specFile =
      typeof spec.file === "string" && spec.file.trim().length > 0 ? normalizeFsPath(spec.file) : file;
    for (const test of spec.tests ?? []) {
      out.push(analyzeTest(fullTitle, specFile, line, test));
    }
  }

  for (const child of suite.suites ?? []) {
    walkSuite(child, file, nextTitles, out);
  }
}

/** Parses Playwright / Mobilewright JSON reporter document into a compact analysis shape. */
export function parsePlaywrightReportJson(raw: string): TestRunResultsAnalysis | null {
  let root: unknown;
  try {
    root = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (root === null || typeof root !== "object" || Array.isArray(root)) {
    return null;
  }

  const doc = root as JsonReportRoot;
  const cases: TestCaseResultAnalysis[] = [];
  for (const suite of doc.suites ?? []) {
    walkSuite(suite, "", [], cases);
  }

  const truncated = cases.length > MAX_CASES;
  const capped = truncated ? cases.slice(0, MAX_CASES) : cases;

  const statsFromReport =
    doc.stats !== undefined && typeof doc.stats === "object" && doc.stats !== null
      ? {
          expected: typeof doc.stats.expected === "number" ? doc.stats.expected : 0,
          unexpected: typeof doc.stats.unexpected === "number" ? doc.stats.unexpected : 0,
          flaky: typeof doc.stats.flaky === "number" ? doc.stats.flaky : 0,
          skipped: typeof doc.stats.skipped === "number" ? doc.stats.skipped : 0,
          durationMs: typeof doc.stats.duration === "number" ? doc.stats.duration : undefined,
        }
      : null;

  if (statsFromReport !== null) {
    return {
      stats: statsFromReport,
      cases: capped,
      ...(truncated ? { truncated: true } : {}),
    };
  }

  const derived = capped.reduce(
    (acc, c) => {
      if (c.status === "passed") acc.expected += 1;
      else if (c.status === "flaky") acc.flaky += 1;
      else if (c.status === "skipped") acc.skipped += 1;
      else acc.unexpected += 1;
      return acc;
    },
    { expected: 0, unexpected: 0, flaky: 0, skipped: 0 },
  );

  return {
    stats: derived,
    cases: capped,
    ...(truncated ? { truncated: true } : {}),
  };
}

export async function loadPlaywrightReportAnalysis(projectId: string): Promise<TestRunResultsAnalysis | null> {
  const root = getProjectFrameworkRoot(projectId);
  const abs = path.join(root, PLAYWRIGHT_REPORT_JSON_RELATIVE);
  try {
    const raw = await readFile(abs, "utf8");
    return parsePlaywrightReportJson(raw);
  } catch {
    return null;
  }
}

export type AnalysisSummary = {
  passed: number;
  failed: number;
  flaky: number;
  skipped: number;
  total: number;
};

/** Compact counts for list views — prefers reporter `stats`, falls back to per-case rollups. */
export function summarizeResultsAnalysis(analysis: unknown): AnalysisSummary | undefined {
  if (analysis === null || analysis === undefined || typeof analysis !== "object" || Array.isArray(analysis)) {
    return undefined;
  }

  const obj = analysis as TestRunResultsAnalysis;
  const stats = obj.stats;
  const cases = Array.isArray(obj.cases) ? obj.cases : [];

  if (stats !== undefined && typeof stats === "object") {
    const passed = typeof stats.expected === "number" ? stats.expected : 0;
    const failed = typeof stats.unexpected === "number" ? stats.unexpected : 0;
    const flaky = typeof stats.flaky === "number" ? stats.flaky : 0;
    const skipped = typeof stats.skipped === "number" ? stats.skipped : 0;
    const total = passed + failed + flaky + skipped;
    if (total === 0) {
      return undefined;
    }
    return {
      passed,
      failed,
      flaky,
      skipped,
      total,
    };
  }

  if (cases.length === 0) {
    return undefined;
  }

  let passed = 0;
  let failed = 0;
  let flaky = 0;
  let skipped = 0;
  for (const c of cases) {
    if (c.status === "passed") passed += 1;
    else if (c.status === "flaky") flaky += 1;
    else if (c.status === "skipped") skipped += 1;
    else failed += 1;
  }
  const total = passed + failed + flaky + skipped;
  if (total === 0) {
    return undefined;
  }
  return { passed, failed, flaky, skipped, total };
}
