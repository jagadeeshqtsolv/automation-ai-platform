const MAX_GREP_LENGTH = 200;

/** Minimal analysis shape needed to pick failed/flaky cases for rerun. */
export type RerunResultsAnalysis = {
  cases: Array<{
    title: string;
    file: string;
    status: string;
  }>;
};

export type RerunRequestParams = {
  specPaths: string[];
  environmentId: string | null;
  grep?: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLocationSuffix(file: string): string {
  return file.replace(/(?::\d+){1,3}$/, "");
}

/** Map reporter file paths to workspace-relative `tests/*.spec.ts`. */
export function normalizeTestSpecPath(file: string): string | null {
  let f = stripLocationSuffix(file.trim()).replace(/\\/g, "/");
  const testsIdx = f.indexOf("tests/");
  if (testsIdx >= 0) {
    f = f.slice(testsIdx);
  }
  if (f.startsWith("./")) {
    f = f.slice(2);
  }
  if (f.startsWith("/")) {
    f = f.slice(1);
  }
  if (!f.startsWith("tests/") || f.includes("..")) {
    return null;
  }
  if (!f.endsWith(".ts") && !f.endsWith(".tsx")) {
    return null;
  }
  return f;
}

export function parseGrepFromCommand(command: string): string | undefined {
  const match = /--grep(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([\s\S]+?)(?=\s+--|$))/.exec(command);
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  return value !== undefined && value.trim().length > 0 ? value.trim() : undefined;
}

/** Rerun the same specs (and grep filter) as a completed run. */
export function buildRerunAllParams(input: {
  specPaths: string[];
  environmentId: string | null;
  command?: string;
}): RerunRequestParams {
  return {
    specPaths: input.specPaths,
    environmentId: input.environmentId,
    ...(input.command !== undefined && input.command.length > 0
      ? { grep: parseGrepFromCommand(input.command) }
      : {}),
  };
}

export type RerunFailuresResult =
  | { ok: true; params: RerunRequestParams; failedCount: number }
  | { ok: false; reason: "no_analysis" | "no_failures" };

/** Rerun only failed/flaky cases from a prior run's JSON analysis. */
export function buildRerunFailuresParams(input: {
  specPaths: string[];
  environmentId: string | null;
  resultsAnalysis: RerunResultsAnalysis | null | undefined;
}): RerunFailuresResult {
  if (input.resultsAnalysis === null || input.resultsAnalysis === undefined) {
    return { ok: false, reason: "no_analysis" };
  }
  if (input.resultsAnalysis.cases.length === 0) {
    return { ok: false, reason: "no_failures" };
  }

  const failed = input.resultsAnalysis.cases.filter(
    (c) => c.status === "failed" || c.status === "flaky",
  );
  if (failed.length === 0) {
    return { ok: false, reason: "no_failures" };
  }

  const specSet = new Set<string>();
  const failedBasenames = new Set<string>();
  for (const c of failed) {
    const rel = normalizeTestSpecPath(c.file);
    if (rel !== null) {
      specSet.add(rel);
      continue;
    }
    const basename = c.file.trim().replace(/\\/g, "/").split("/").pop();
    if (basename !== undefined && basename.length > 0) {
      failedBasenames.add(basename);
    }
  }
  for (const p of input.specPaths) {
    const rel = normalizeTestSpecPath(p);
    if (rel !== null) {
      specSet.add(rel);
      continue;
    }
    const basename = p.trim().replace(/\\/g, "/").split("/").pop();
    if (basename !== undefined && failedBasenames.has(basename)) {
      specSet.add(p);
    }
  }

  const specPaths = Array.from(specSet);
  if (specPaths.length === 0) {
    return { ok: false, reason: "no_failures" };
  }

  const titlePatterns = failed
    .map((c) => c.title.trim())
    .filter((t) => t.length > 0)
    .map(escapeRegex);

  let grep: string | undefined;
  if (titlePatterns.length > 0) {
    const combined = titlePatterns.join("|");
    if (combined.length <= MAX_GREP_LENGTH) {
      grep = combined;
    }
  }

  return {
    ok: true,
    failedCount: failed.length,
    params: {
      specPaths,
      environmentId: input.environmentId,
      ...(grep !== undefined ? { grep } : {}),
    },
  };
}
