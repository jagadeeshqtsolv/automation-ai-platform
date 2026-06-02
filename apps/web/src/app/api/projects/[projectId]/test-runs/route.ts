import { NextResponse } from "next/server";
import { runTestsBodySchema, detectCiProvider } from "@jagadeeshqtsolv/core";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { decryptAccessKey, parseExecutionConfigDocument } from "@/lib/execution-config";
import { executeTestRunInBackground } from "@/lib/test-execution/execute-test-run";
import { syncProjectWorkspaceToDisk } from "@/lib/local-framework/sync-workspace-to-disk";
import { listTestSpecFiles } from "@/lib/test-execution/list-test-specs";
import { summarizeResultsAnalysis } from "@/lib/test-execution/playwright-report-analysis";
import { getProjectCiConfigView, getProjectGitConfigView } from "@/lib/project-git/git-config";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
});

export async function GET(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsedParams.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  await syncProjectWorkspaceToDisk(parsedParams.data.projectId).catch(() => {});

  const [specs, runs, project, gitConfig, ciConfig] = await Promise.all([
    listTestSpecFiles(parsedParams.data.projectId),
    prisma.testRun.findMany({
      where: { projectId: parsedParams.data.projectId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        provider: true,
        status: true,
        label: true,
        specPaths: true,
        environmentId: true,
        exitCode: true,
        output: true,
        resultsAnalysis: true,
        htmlReportRel: true,
        pipelineUrl: true,
        createdAt: true,
        finishedAt: true,
      },
    }),
    prisma.project.findUnique({
      where: { id: parsedParams.data.projectId },
      select: { executionConfigJson: true },
    }),
    getProjectGitConfigView(parsedParams.data.projectId).catch(() => null),
    getProjectCiConfigView(parsedParams.data.projectId).catch(() => null),
  ]);

  const doc = parseExecutionConfigDocument(project?.executionConfigJson);

  const ciProvider = gitConfig?.remoteUrl ? detectCiProvider(gitConfig.remoteUrl) : null;

  // Compute which providers have credentials saved and are ready to use
  const bsKey = decryptAccessKey(doc.secrets.browserstackAccessKeyEnc);
  const sauceKey = decryptAccessKey(doc.secrets.saucelabsAccessKeyEnc);
  const ltKey = decryptAccessKey(doc.secrets.lambdatestAccessKeyEnc);

  const availableProviders: Array<{ provider: string; label: string }> = [
    { provider: "local", label: "Local" },
  ];
  if (doc.config.browserstack?.username && bsKey) {
    availableProviders.push({ provider: "browserstack", label: "BrowserStack" });
  }
  if (doc.config.saucelabs?.username && sauceKey) {
    availableProviders.push({ provider: "saucelabs", label: "Sauce Labs" });
  }
  if (doc.config.lambdatest?.username && ltKey) {
    availableProviders.push({ provider: "lambdatest", label: "LambdaTest" });
  }
  if (doc.config.custom?.hubUrl) {
    availableProviders.push({ provider: "custom", label: "Custom hub" });
  }
  if (ciConfig?.hasCiToken === true && ciProvider !== null) {
    availableProviders.push({ provider: "github-ci", label: "GitHub CI" });
  }

  // Default to github-ci in the panel when it's configured and no other cloud provider is saved
  const effectiveProvider =
    ciConfig?.hasCiToken === true && ciProvider !== null && doc.config.provider === "local"
      ? "github-ci"
      : doc.config.provider;

  return NextResponse.json({
    specs,
    config: { ...doc.config, provider: effectiveProvider },
    availableProviders,
    ciPipeline: {
      configured: ciConfig?.hasCiToken === true,
      provider: ciProvider,
    },
    recentRuns: runs.map((r) => ({
      id: r.id,
      provider: r.provider,
      label: r.label ?? null,
      status: r.status,
      specPaths: JSON.parse(r.specPaths) as string[],
      environmentId: r.environmentId,
      exitCode: r.exitCode,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      htmlReportRel: r.htmlReportRel,
      pipelineUrl: r.pipelineUrl ?? null,
      outputPreview: r.output.length > 2000 ? `${r.output.slice(0, 2000)}…` : r.output,
      analysisSummary: summarizeResultsAnalysis(r.resultsAnalysis),
    })),
  });
}

export async function POST(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsedParams.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const json: unknown = await req.json().catch(() => null);
  const parsed = runTestsBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Extract user-defined run label (not in core schema — read directly from raw body)
  const rawLabel =
    json !== null && typeof json === "object" && "label" in json
      ? (json as Record<string, unknown>).label
      : undefined;
  const label = typeof rawLabel === "string" && rawLabel.trim().length > 0
    ? rawLabel.trim()
    : null;

  const project = await prisma.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { executionConfigJson: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let environmentConfigJson: string | null = null;
  let environmentSlug: string | null = null;
  if (parsed.data.environmentId !== undefined) {
    const env = await prisma.environment.findFirst({
      where: { id: parsed.data.environmentId, projectId: parsedParams.data.projectId },
      select: { configJson: true, slug: true },
    });
    if (env === null) {
      return NextResponse.json({ error: "Environment not found" }, { status: 404 });
    }
    environmentConfigJson = env.configJson;
    environmentSlug = env.slug;
  } else {
    const defaultEnv = await prisma.environment.findFirst({
      where: { projectId: parsedParams.data.projectId },
      orderBy: { slug: "asc" },
      select: { configJson: true, slug: true },
    });
    environmentConfigJson = defaultEnv?.configJson ?? null;
    environmentSlug = defaultEnv?.slug ?? null;
  }

  const doc = parseExecutionConfigDocument(project.executionConfigJson);

  // Use the provider requested by the user, or fall back to the saved default
  const requestedProvider = parsed.data.provider ?? doc.config.provider;
  const runConfig = { ...doc.config, provider: requestedProvider };

  const run = await prisma.testRun.create({
    data: {
      projectId: parsedParams.data.projectId,
      provider: requestedProvider,
      status: "running",
      specPaths: JSON.stringify(parsed.data.specPaths),
      environmentId: parsed.data.environmentId ?? null,
      output: "Queued test run…\n",
      label,
    },
    select: { id: true },
  });

  const runParams = {
    projectId: parsedParams.data.projectId,
    config: runConfig,
    environmentConfigJson,
    environmentSlug,
    label,
    secrets: {
      saucelabsAccessKey: decryptAccessKey(doc.secrets.saucelabsAccessKeyEnc),
      browserstackAccessKey: decryptAccessKey(doc.secrets.browserstackAccessKeyEnc),
      lambdatestAccessKey: decryptAccessKey(doc.secrets.lambdatestAccessKeyEnc),
    },
    specPaths: parsed.data.specPaths,
    grep: parsed.data.grep,
  };

  void executeTestRunInBackground(run.id, runParams).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "Background test run failed";
    console.error(`[test-run ${run.id}]`, message);
    void prisma.testRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        output: `${message}\n`,
        finishedAt: new Date(),
      },
    });
  });

  return NextResponse.json(
    {
      runId: run.id,
      status: "running",
      ok: false,
      message: "Test run started. Logs will stream below.",
    },
    { status: 202 },
  );
}
