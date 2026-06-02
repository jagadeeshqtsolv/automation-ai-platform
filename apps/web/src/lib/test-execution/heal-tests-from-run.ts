import path from "node:path";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateText } from "ai";
import { resolveAIModel } from "@/lib/project-ai-config";
import { buildPageObjectLibraryCatalog } from "@/lib/page-object-library-context";
import type { PageObjectLibraryEntry } from "@/lib/generate-mobilewright-bundle";
import { sanitizeGeneratedTestFileContent } from "@/lib/sanitize-generated-test-file";
import { getProjectPlatformType } from "@/lib/project-platform";
import { resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { syncProjectWorkspaceToDisk } from "@/lib/local-framework/sync-workspace-to-disk";
import { writeFrameworkFiles } from "@/lib/local-framework/writer";
import { upsertPageObjectFromHeal } from "@/lib/persist-page-objects";
import { testConfigFileName, testRunnerDisplayName } from "@/lib/test-framework";
import { listTestSpecFiles } from "@/lib/test-execution/list-test-specs";
import {
  applyStrictModePatchesToPageObjects,
  collectStrictModeHealTargets,
} from "@/lib/test-execution/heal-locator-strict-mode";
import type {
  TestCaseResultAnalysis,
  TestRunResultsAnalysis,
  TestStepResultAnalysis,
} from "@/lib/test-execution/playwright-report-analysis";

const fileEntrySchema = z.object({
  path: z.string().min(1).max(260),
  content: z.string().min(1).max(200_000),
});

const healResponseSchema = z
  .object({
    testFiles: z.array(fileEntrySchema).max(20).optional().default([]),
    pageObjectFiles: z.array(fileEntrySchema).max(20).optional().default([]),
  })
  .refine((d) => d.testFiles.length + d.pageObjectFiles.length > 0, {
    message: "At least one test or page object file is required",
  });

/** Strip Playwright location suffixes like :42 or :42:10 from file paths in JSON reports. */
function stripLocationSuffix(file: string): string {
  return file.replace(/(?::\d+){1,3}$/, "");
}

function normalizeTestRelative(file: string): string | null {
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

function resolveHealedTestRel(modelPath: string, filesNeeded: Set<string>): string | null {
  const rel = normalizeTestRelative(modelPath);

  // 1. Exact normalized match
  if (rel !== null && filesNeeded.has(rel)) return rel;

  // 2. Basename match (handles missing tests/ prefix or slight path differences)
  const bn = rel !== null
    ? path.basename(rel)
    : path.basename(stripLocationSuffix(modelPath.trim()).replace(/\\/g, "/"));
  for (const need of filesNeeded) {
    if (path.basename(need) === bn) return need;
  }

  // 3. Partial suffix match (e.g. model returns "spec.ts" path with different root)
  for (const need of filesNeeded) {
    if (modelPath.endsWith(path.basename(need)) || need.endsWith(bn)) return need;
  }

  // 4. Last resort: if there is exactly one file needed and the model path looks like a spec, use it
  if (filesNeeded.size === 1 && /\.(spec|test)\.(ts|tsx|js)$/.test(modelPath)) {
    return [...filesNeeded][0]!;
  }

  return null;
}

function analysisFromJson(raw: unknown): TestRunResultsAnalysis | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  return raw as TestRunResultsAnalysis;
}

function failingCases(analysis: TestRunResultsAnalysis | null): TestCaseResultAnalysis[] {
  if (analysis === null || !Array.isArray(analysis.cases)) {
    return [];
  }
  return analysis.cases.filter((c) => c.status === "failed" || c.status === "flaky");
}

function compactFailedSteps(steps: TestStepResultAnalysis[] | undefined, depth = 0): unknown[] {
  if (steps === undefined || steps.length === 0 || depth > 4) {
    return [];
  }
  const out: unknown[] = [];
  for (const step of steps) {
    const nested = compactFailedSteps(step.steps, depth + 1);
    if (step.status === "failed" || nested.length > 0) {
      out.push({
        title: step.title,
        status: step.status,
        errorSnippet: step.errorSnippet,
        ...(nested.length > 0 ? { steps: nested } : {}),
      });
    }
  }
  return out;
}

function collectStepErrorSnippets(steps: TestStepResultAnalysis[] | undefined): string[] {
  if (steps === undefined || steps.length === 0) {
    return [];
  }
  const parts: string[] = [];
  for (const step of steps) {
    if (step.errorSnippet !== undefined && step.errorSnippet.length > 0) {
      parts.push(step.errorSnippet);
    }
    parts.push(...collectStepErrorSnippets(step.steps));
  }
  return parts;
}

/** Map reporter file paths to workspace-relative tests/*.spec.ts paths. */
async function resolveFilesNeededForFailures(
  projectId: string,
  failures: TestCaseResultAnalysis[],
): Promise<Set<string>> {
  const filesNeeded = new Set<string>();
  const unmatchedBasenames = new Set<string>();

  for (const c of failures) {
    const rel = normalizeTestRelative(c.file);
    if (rel !== null) {
      filesNeeded.add(rel);
      continue;
    }
    const bn = path.basename(stripLocationSuffix(c.file.trim()));
    if (/\.(spec|test)\.(ts|tsx|js|mjs)$/i.test(bn)) {
      unmatchedBasenames.add(bn);
    }
  }

  if (unmatchedBasenames.size > 0) {
    const specs = await listTestSpecFiles(projectId);
    for (const bn of unmatchedBasenames) {
      const hit = specs.find((s) => path.basename(s.path) === bn);
      if (hit !== undefined) {
        filesNeeded.add(hit.path);
      }
    }
  }

  return filesNeeded;
}

export type HealChangedFile = {
  path: string;
  linesAdded: number;
  linesRemoved: number;
  before: string;
  after: string;
};

export type HealTestRunResult = {
  healedTestPaths: string[];
  healedPagePaths: string[];
  model: string;
  changedFiles: HealChangedFile[];
};

function lineStats(before: string, after: string): { added: number; removed: number } {
  const beforeSet = new Set(before.split("\n"));
  const afterLines = after.split("\n");
  const beforeLines = before.split("\n");
  const afterSet = new Set(afterLines);
  return {
    added: afterLines.filter((l) => !beforeSet.has(l)).length,
    removed: beforeLines.filter((l) => !afterSet.has(l)).length,
  };
}

function removeTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, "$1");
}

function extractHealJson(text: string): unknown {
  const trimmed = text.trim();

  // 1. Direct parse
  try { return JSON.parse(trimmed); } catch {}

  // 2. Strip markdown code fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fenced) {
    const inner = fenced[1]!.trim();
    try { return JSON.parse(inner); } catch {}
    try { return JSON.parse(removeTrailingCommas(inner)); } catch {}
  }

  // 3. Trailing comma fix on full text
  const commaFixed = removeTrailingCommas(trimmed);
  try { return JSON.parse(commaFixed); } catch {}

  // 4. Find the outermost balanced { } — walk char-by-char respecting strings/escapes
  const start = commaFixed.indexOf("{");
  if (start !== -1) {
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < commaFixed.length; i++) {
      const c = commaFixed[i]!;
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) { return JSON.parse(commaFixed.slice(start, i + 1)); } }
    }
    // Truncated response — try parsing what we have after removing trailing commas
    const partial = removeTrailingCommas(commaFixed.slice(start));
    try { return JSON.parse(partial); } catch {}
  }

  throw new SyntaxError("No valid JSON object found in model response");
}

export async function healTestsFromRun(params: {
  projectId: string;
  runId: string;
  problemDescription?: string;
}): Promise<HealTestRunResult> {
  const run = await prisma.testRun.findFirst({
    where: { id: params.runId, projectId: params.projectId },
    select: {
      id: true,
      resultsAnalysis: true,
      output: true,
      command: true,
      project: { select: { id: true, name: true } },
    },
  });

  if (run === null) {
    throw new Error("Test run not found");
  }

  const analysis = analysisFromJson(run.resultsAnalysis);
  const failures = failingCases(analysis);
  if (failures.length === 0) {
    throw new Error("No failed or flaky cases in this run — nothing to heal.");
  }

  const filesNeeded = await resolveFilesNeededForFailures(params.projectId, failures);
  if (filesNeeded.size === 0) {
    throw new Error(
      "Failures reference paths outside tests/*. Could not map report files — open the HTML report for details.",
    );
  }

  await syncProjectWorkspaceToDisk(params.projectId);

  const fileSnapshots: Array<{ path: string; content: string }> = await Promise.all(
    [...filesNeeded].map(async (rel) => {
      const abs = resolveFrameworkFilePath(params.projectId, rel);
      if (abs === null) return null;
      const content = await readFile(abs, "utf8").catch(() => null);
      if (content === null) throw new Error(`Could not read ${rel} from framework workspace`);
      return { path: rel, content };
    }),
  ).then((results) => results.filter((r): r is { path: string; content: string } => r !== null));

  if (fileSnapshots.length === 0) {
    throw new Error("No readable spec files matched failing tests.");
  }

  const pages = await prisma.pageObject.findMany({
    where: { projectId: params.projectId },
    orderBy: { modulePath: "asc" },
    select: { modulePath: true, className: true, content: true, methodSummary: true },
  });

  const specContent = fileSnapshots.map((f) => f.content).join("\n");
  const relevantPages = pages.filter(
    (p) => specContent.includes(p.className) || specContent.includes(p.modulePath),
  );
  const libraryForCatalog = relevantPages.length > 0 ? relevantPages : pages;

  const library: PageObjectLibraryEntry[] = pages.map((p) => ({
    modulePath: p.modulePath,
    className: p.className,
    content: p.content,
    methodSummary: p.methodSummary,
  }));

  const catalog = buildPageObjectLibraryCatalog(
    libraryForCatalog.map((p) => ({
      modulePath: p.modulePath,
      className: p.className,
      content: p.content,
      methodSummary: p.methodSummary,
    })),
  );

  const healLogText = [
    ...failures.map((f) => f.errorSnippet ?? ""),
    run.output,
    ...failures.flatMap((f) => collectStepErrorSnippets(f.steps)),
  ].join("\n");

  const strictTargets = collectStrictModeHealTargets(healLogText);
  const strictPatches = applyStrictModePatchesToPageObjects(
    library.map((p) => ({ modulePath: p.modulePath, content: p.content })),
    strictTargets,
  );

  const healedPagePaths: string[] = [];
  for (const patch of strictPatches) {
    const mod = await upsertPageObjectFromHeal({
      projectId: params.projectId,
      projectName: run.project.name,
      path: patch.modulePath,
      content: patch.content,
    });
    if (mod !== null) {
      healedPagePaths.push(mod);
      const idx = library.findIndex((p) => p.modulePath === mod);
      if (idx >= 0) {
        library[idx] = { ...library[idx], content: patch.content };
      }
    }
  }

  const failureDigest = failures.slice(0, 20).map((f) => ({
    title: f.title,
    file: f.file,
    workspaceFile: normalizeTestRelative(f.file) ?? path.basename(stripLocationSuffix(f.file)),
    line: f.line,
    status: f.status,
    errorSnippet: f.errorSnippet ?? "",
    failedSteps: compactFailedSteps(f.steps),
  }));

  const userProblem =
    params.problemDescription !== undefined && params.problemDescription.trim().length > 0
      ? params.problemDescription.trim()
      : null;

  const platform = await getProjectPlatformType(params.projectId);
  const runnerName = testRunnerDisplayName(platform);
  const configName = testConfigFileName(platform);
  const isWeb = platform === "web";

  const { model, modelId } = await resolveAIModel(run.project.id);

  const { text: raw } = await generateText({
    model,
    system: [
      `You repair ${runnerName} TypeScript tests and page objects from Playwright failure output.`,
      'Return ONLY raw JSON — no markdown, no code fences, no commentary. Format: { "testFiles": [...], "pageObjectFiles": [...] } — each entry { "path", "content" } with FULL file contents.',
      "Include testFiles entries for EVERY failing spec listed under 'Specs to repair' (use exact paths like tests/foo.spec.ts).",
      isWeb
        ? "Include pageObjectFiles when locator or page-class fixes are required (paths under pageobjects/, e.g. pageobjects/LoginPage.ts). Use click*/fill*/check* methods and webLocator — never raw page.locator().click(). Checkboxes: checkWhenVisible via check{Key}/uncheck{Key}, not click*."
        : "Include pageObjectFiles when locator or screen-class fixes are required (paths under pageobjects/, e.g. pageobjects/CatalogScreen.ts).",
      "Playwright strict mode violation (locator matched multiple elements): update the matching entry in `private static readonly L` with `index: 0` to target the first match, or use a more specific strategy/css. Prefer pageObjectFiles over changing tests.",
      "When the user provides a problem description, treat it as authoritative context for intent (expected UI, timing, environment) alongside stack traces.",
      "Rules:",
      "- Output complete file contents for each changed file.",
      "- Preserve test() titles and tag arrays unless clearly wrong.",
      isWeb
        ? "- Fix isolation: each test reaches its UI from a known entry (page.goto or fixture navigation) — never rely on prior tests."
        : "- Fix isolation: each test reaches its UI from app launch — never rely on prior tests.",
      "- Use only fixture parameters from the catalog; never import page object classes in testFiles.",
      "- Import { test, expect } from '../support/fixtures' unless expect is unused.",
      isWeb
        ? "- Web tests use the `page` fixture and page object fixtures (loginPage, etc.) — not `screen` or @mobilewright/core sleep."
        : "- Call only methods that exist on fixtures per catalog — never invent expectElementVisible('Key').",
      `- Environment and timeouts come from ${configName}.`,
      "- No // or /* */ comments in generated TypeScript.",
    ].join("\n"),
    temperature: 0.1,
    messages: [
      {
        role: "user",
        content: [
          ...(userProblem !== null
            ? ["### User problem description", userProblem, ""]
            : []),
          "### Page object / fixture catalog",
          catalog,
          "",
          "### Failing cases (JSON reporter)",
          JSON.stringify(failureDigest, null, 2),
          "",
          ...(strictPatches.length > 0
            ? [
              "### Locator auto-fix already applied (index: 0 = first match)",
              strictPatches.map((p) => p.modulePath).join(", "),
              "",
            ]
            : []),
          "### Specs to repair (exact paths required in testFiles[].path)",
          [...filesNeeded].join("\n"),
          "",
          "### Run command / log tail",
          run.command.length > 0 ? `$ ${run.command}` : "(no command)",
          run.output.length > 0 ? `\n${run.output.slice(-24_000)}` : "",
          "",
          "### Spec files (repair all that have failures)",
          ...fileSnapshots.map((f) => [`--- FILE ${f.path} ---`, f.content].join("\n")),
        ].join("\n"),
      },
    ],
  });

  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Model returned empty heal response");
  }

  let parsedJson: unknown;
  try {
    parsedJson = extractHealJson(raw);
  } catch (err) {
    const snippet = raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
    throw new Error(
      `Model returned non-JSON heal response: ${err instanceof SyntaxError ? err.message : String(err)}. Raw (first 400 chars): ${snippet}`,
    );
  }

  const healed = healResponseSchema.parse(parsedJson);
  const pageClasses = library.map((p) => p.className);

  const diskByRel = new Map<string, string>();
  const healedTestPaths: string[] = [];

  for (const f of healed.testFiles) {
    const targetRel = resolveHealedTestRel(f.path, filesNeeded);
    if (targetRel === null) {
      continue;
    }
    const sanitized = sanitizeGeneratedTestFileContent(f.content, undefined, pageClasses, undefined, {
      platform,
    });
    diskByRel.set(targetRel, sanitized);
  }

  for (const rel of diskByRel.keys()) {
    healedTestPaths.push(rel);
  }

  if (diskByRel.size === 0 && healed.pageObjectFiles.length === 0 && healedPagePaths.length === 0) {
    const returnedPaths = healed.testFiles.map((f) => f.path).join(", ") || "(none)";
    const expectedPaths = [...filesNeeded].join(", ");
    throw new Error(
      `Model did not return matching test files. Expected paths: ${expectedPaths}. Model returned: ${returnedPaths}.`,
    );
  }

  if (diskByRel.size > 0) {
    await writeFrameworkFiles({
      projectId: params.projectId,
      projectName: run.project.name,
      files: [...diskByRel.entries()].map(([relativePath, content]) => ({ relativePath, content })),
      overwritePageObjects: false,
      overwriteTests: true,
      environment: null,
    });
  }

  for (const f of healed.pageObjectFiles) {
    const mod = await upsertPageObjectFromHeal({
      projectId: params.projectId,
      projectName: run.project.name,
      path: f.path,
      content: f.content,
    });
    if (mod !== null && !healedPagePaths.includes(mod)) {
      healedPagePaths.push(mod);
    }
  }

  if (healedTestPaths.length === 0 && healedPagePaths.length === 0) {
    throw new Error("Heal produced no updates (no matching tests or page objects were applied).");
  }

  await syncProjectWorkspaceToDisk(params.projectId);

  const changedFiles: HealChangedFile[] = [];

  for (const [rel, after] of diskByRel) {
    const before = fileSnapshots.find((f) => f.path === rel)?.content ?? "";
    const { added, removed } = lineStats(before, after);
    changedFiles.push({ path: rel, linesAdded: added, linesRemoved: removed, before, after });
  }

  for (const f of healed.pageObjectFiles) {
    const rel = f.path.trim().replace(/^\.\//, "");
    if (!healedPagePaths.some((p) => p.endsWith(rel) || rel.endsWith(p))) continue;
    const before = library.find((p) => p.modulePath === rel)?.content ?? "";
    const { added, removed } = lineStats(before, f.content);
    changedFiles.push({ path: rel, linesAdded: added, linesRemoved: removed, before, after: f.content });
  }

  return { healedTestPaths, healedPagePaths, model: modelId, changedFiles };
}
