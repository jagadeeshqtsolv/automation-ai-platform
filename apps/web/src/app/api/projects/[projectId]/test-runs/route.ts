import { NextResponse } from "next/server";
import { runTestsBodySchema } from "@automation-ai/shared";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { decryptAccessKey, parseExecutionConfigDocument } from "@/lib/execution-config";
import { executeTestRunInBackground } from "@/lib/test-execution/execute-test-run";
import { syncProjectWorkspaceToDisk } from "@/lib/local-framework/sync-workspace-to-disk";
import { listTestSpecFiles } from "@/lib/test-execution/list-test-specs";
import { summarizeResultsAnalysis } from "@/lib/test-execution/playwright-report-analysis";
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

  await syncProjectWorkspaceToDisk(parsedParams.data.projectId);

  const [specs, runs, project] = await Promise.all([
    listTestSpecFiles(parsedParams.data.projectId),
    prisma.testRun.findMany({
      where: { projectId: parsedParams.data.projectId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        provider: true,
        status: true,
        specPaths: true,
        environmentId: true,
        exitCode: true,
        output: true,
        resultsAnalysis: true,
        htmlReportRel: true,
        createdAt: true,
        finishedAt: true,
      },
    }),
    prisma.project.findUnique({
      where: { id: parsedParams.data.projectId },
      select: { executionConfigJson: true },
    }),
  ]);

  const doc = parseExecutionConfigDocument(project?.executionConfigJson);

  return NextResponse.json({
    specs,
    config: doc.config,
    recentRuns: runs.map((r) => ({
      id: r.id,
      provider: r.provider,
      status: r.status,
      specPaths: JSON.parse(r.specPaths) as string[],
      environmentId: r.environmentId,
      exitCode: r.exitCode,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
      htmlReportRel: r.htmlReportRel,
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

  const running = await prisma.testRun.findFirst({
    where: { projectId: parsedParams.data.projectId, status: "running", finishedAt: null },
    select: { id: true },
  });
  if (running !== null) {
    return NextResponse.json(
      { error: "A test run is already in progress for this project", runId: running.id },
      { status: 409 },
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { executionConfigJson: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let environmentConfigJson: string | null = null;
  if (parsed.data.environmentId !== undefined) {
    const env = await prisma.environment.findFirst({
      where: { id: parsed.data.environmentId, projectId: parsedParams.data.projectId },
      select: { configJson: true },
    });
    if (env === null) {
      return NextResponse.json({ error: "Environment not found" }, { status: 404 });
    }
    environmentConfigJson = env.configJson;
  } else {
    const defaultEnv = await prisma.environment.findFirst({
      where: { projectId: parsedParams.data.projectId },
      orderBy: { slug: "asc" },
      select: { configJson: true },
    });
    environmentConfigJson = defaultEnv?.configJson ?? null;
  }

  const doc = parseExecutionConfigDocument(project.executionConfigJson);

  const run = await prisma.testRun.create({
    data: {
      projectId: parsedParams.data.projectId,
      provider: doc.config.provider,
      status: "running",
      specPaths: JSON.stringify(parsed.data.specPaths),
      environmentId: parsed.data.environmentId ?? null,
      output: "Queued test run…\n",
    },
    select: { id: true },
  });

  const runParams = {
    projectId: parsedParams.data.projectId,
    config: doc.config,
    environmentConfigJson,
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
