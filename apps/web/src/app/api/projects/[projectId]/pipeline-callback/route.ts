import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { pipelineCallbackBodySchema } from "@automation-ai/core";
import { prisma } from "@/lib/prisma";
import { getProjectGitConfigView, getProjectCiToken } from "@/lib/project-git/git-config";
import { fetchAndSaveCiReport } from "@/lib/project-git/fetch-ci-report";
import { parseExecutionConfigDocument } from "@/lib/execution-config";
import { sendReportEmail } from "@/lib/send-report-email";

const paramsSchema = z.object({ projectId: z.string().uuid() });

export async function POST(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const { projectId } = params.data;

  // Authenticate via the callback token passed as a query param
  const token = new URL(req.url).searchParams.get("token");
  if (!token || token.length === 0) {
    return NextResponse.json({ error: "Missing callback token" }, { status: 401 });
  }

  const run = await prisma.testRun.findFirst({
    where: { projectId, callbackToken: token },
    select: { id: true, status: true, finishedAt: true },
  });

  // Load project info (name + ciRunConfig for reportEmails) in parallel
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, executionConfigJson: true },
  });

  if (!run) {
    return NextResponse.json({ error: "Invalid token or run not found" }, { status: 404 });
  }

  // Idempotent — ignore duplicate callbacks for an already-finished run
  if (run.finishedAt !== null) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const json: unknown = await req.json().catch(() => null);
  const parsed = pipelineCallbackBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid callback body" }, { status: 400 });
  }

  const { status, output, exitCode, pipelineUrl } = parsed.data;

  const pipelineLink = pipelineUrl ?? null;
  const outputText = output
    ? output
    : `Pipeline finished with status: ${status}\n${pipelineLink ? `\nPipeline URL: ${pipelineLink}\n` : ""}`;

  // ── Try to download the Playwright HTML report artifact (GitHub only) ───────
  let htmlReportRel: string | null = null;
  let reportAnalysis: Prisma.InputJsonValue | undefined = undefined;

  if (pipelineLink && /github\.com/i.test(pipelineLink)) {
    try {
      const [gitConfig, ciToken] = await Promise.all([
        getProjectGitConfigView(projectId),
        getProjectCiToken(projectId),
      ]);

      if (gitConfig?.remoteUrl && ciToken) {
        const ciReport = await Promise.race([
          fetchAndSaveCiReport({
            projectId,
            runId: run.id,
            pipelineUrl: pipelineLink,
            remoteUrl: gitConfig.remoteUrl,
            ciToken,
          }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 40_000)),
        ]);

        if (ciReport !== null) {
          htmlReportRel = ciReport.htmlReportRel;
          if (ciReport.analysis !== null) {
            reportAnalysis = ciReport.analysis as unknown as Prisma.InputJsonValue;
          }
        }
      }
    } catch {
      // Non-fatal — proceed without the HTML report
    }
  }

  await prisma.testRun.update({
    where: { id: run.id },
    data: {
      status,
      output: outputText,
      exitCode: exitCode ?? (status === "passed" ? 0 : 1),
      pipelineUrl: pipelineLink,
      finishedAt: new Date(),
      ...(htmlReportRel !== null ? { htmlReportRel } : {}),
      ...(reportAnalysis !== undefined ? { resultsAnalysis: reportAnalysis } : {}),
    },
  });

  // Send report email(s) if configured
  const ciRunConfig = parseExecutionConfigDocument(project?.executionConfigJson).ciRunConfig;
  const reportEmails = ciRunConfig?.reportEmails?.trim() ?? "";
  if (reportEmails.length > 0) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    // Cast stored JSON back to analysis type — it was written by parsePlaywrightReportJson
    const analysisForEmail = (reportAnalysis ?? null) as import("@/lib/test-execution/playwright-report-analysis").TestRunResultsAnalysis | null;
    sendReportEmail({
      to: reportEmails,
      status,
      projectName: project?.name ?? projectId,
      runId: run.id,
      pipelineUrl: pipelineLink,
      appUrl,
      projectId,
      analysis: analysisForEmail,
    }).catch((err: unknown) => {
      console.error("[report-email] Failed to send:", err instanceof Error ? err.message : err);
    });
  }

  return NextResponse.json({ ok: true });
}
