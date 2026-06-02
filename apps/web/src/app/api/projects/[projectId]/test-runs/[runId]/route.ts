import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { summarizeResultsAnalysis } from "@/lib/test-execution/playwright-report-analysis";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid(),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string; runId: string }> },
) {
  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsed.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const run = await prisma.testRun.findFirst({
    where: { id: parsed.data.runId, projectId: parsed.data.projectId },
    select: {
      id: true,
      status: true,
      provider: true,
      exitCode: true,
      output: true,
      command: true,
      specPaths: true,
      environmentId: true,
      resultsAnalysis: true,
      htmlReportRel: true,
      pipelineUrl: true,
      label: true,
      createdAt: true,
      finishedAt: true,
    },
  });

  if (run === null) {
    return NextResponse.json({ error: "Test run not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: run.id,
    status: run.status,
    provider: run.provider,
    label: run.label ?? null,
    exitCode: run.exitCode,
    output: run.output,
    command: run.command,
    specPaths: JSON.parse(run.specPaths) as string[],
    environmentId: run.environmentId,
    createdAt: run.createdAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    running: run.status === "running" && run.finishedAt === null,
    resultsAnalysis: run.resultsAnalysis,
    analysisSummary: summarizeResultsAnalysis(run.resultsAnalysis),
    htmlReportRel: run.htmlReportRel,
    pipelineUrl: run.pipelineUrl ?? null,
  });
}
