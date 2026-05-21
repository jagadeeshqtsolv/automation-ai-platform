import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectFrameworkRoot } from "@/lib/local-framework/paths";
import { prisma } from "@/lib/prisma";
import {
  readReportFileResponse,
  redirectToReportDirIfNeeded,
  relativeFileFromOptionalCatchAll,
} from "@/lib/test-execution/serve-playwright-html";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid(),
  path: z.array(z.string()).optional(),
});

function reportSegment(runId: string): string {
  return `/test-runs/${runId}/html-report`;
}

function isSafeHtmlReportRel(rel: string, runId: string): boolean {
  const t = rel.trim().replace(/\\/g, "/");
  if (t.includes("..") || !t.startsWith("logs/reports/")) {
    return false;
  }
  const rest = t.slice("logs/reports/".length).replace(/\/$/, "");
  return rest === runId;
}

function resolveUnderRunReportRoot(
  projectId: string,
  runId: string,
  htmlReportRel: string,
  relativeSegments: string[],
): string | null {
  if (!isSafeHtmlReportRel(htmlReportRel, runId)) {
    return null;
  }
  const base = path.join(getProjectFrameworkRoot(projectId), htmlReportRel.trim().replace(/\\/g, "/"));
  const relative = relativeFileFromOptionalCatchAll(relativeSegments);
  if (relative.length === 0 || relative.includes("..")) {
    return null;
  }
  const normalized = relative.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    return null;
  }
  const abs = path.resolve(base, normalized);
  const baseWithSep = base.endsWith(path.sep) ? base : `${base}${path.sep}`;
  if (abs !== base && !abs.startsWith(baseWithSep)) {
    return null;
  }
  return abs;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ projectId: string; runId: string; path?: string[] }> },
) {
  const raw = await context.params;
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const redirect = redirectToReportDirIfNeeded(req.url, reportSegment(parsed.data.runId));
  if (redirect !== null) {
    return redirect;
  }

  const guard = await withAuthAndProject(parsed.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const run = await prisma.testRun.findFirst({
    where: { id: parsed.data.runId, projectId: parsed.data.projectId },
    select: { htmlReportRel: true },
  });
  if (run === null) {
    return NextResponse.json({ error: "Test run not found" }, { status: 404 });
  }
  if (run.htmlReportRel === null || run.htmlReportRel.trim().length === 0) {
    return NextResponse.json(
      { error: "No archived HTML report for this run. Re-run tests after upgrading the runner." },
      { status: 404 },
    );
  }

  const abs = resolveUnderRunReportRoot(
    parsed.data.projectId,
    parsed.data.runId,
    run.htmlReportRel,
    parsed.data.path ?? [],
  );
  if (abs === null) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    await readFile(abs, { flag: "r" });
  } catch {
    return NextResponse.json({ error: "Archived report files missing on disk." }, { status: 404 });
  }

  try {
    return await readReportFileResponse({ absoluteFilePath: abs, requestUrl: req.url });
  } catch {
    return NextResponse.json({ error: "Could not read report file" }, { status: 500 });
  }
}
