import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectFrameworkRoot } from "@/lib/local-framework/paths";
import { PLAYWRIGHT_HTML_REPORT_DIR } from "@/lib/test-execution/playwright-html-report";
import {
  readReportFileResponse,
  redirectToReportDirIfNeeded,
  relativeFileFromOptionalCatchAll,
} from "@/lib/test-execution/serve-playwright-html";

const REPORT_SEGMENT = "/framework/playwright-report";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  path: z.array(z.string()).optional(),
});

function resolveUnderReportRoot(projectId: string, relativeSegments: string[]): string | null {
  const root = path.join(getProjectFrameworkRoot(projectId), PLAYWRIGHT_HTML_REPORT_DIR);
  const relative = relativeFileFromOptionalCatchAll(relativeSegments);
  if (relative.length === 0 || relative.includes("..")) {
    return null;
  }
  const normalized = relative.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    return null;
  }
  const abs = path.resolve(root, normalized);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (abs !== root && !abs.startsWith(rootWithSep)) {
    return null;
  }
  return abs;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ projectId: string; path?: string[] }> },
) {
  const redirect = redirectToReportDirIfNeeded(req.url, REPORT_SEGMENT);
  if (redirect !== null) {
    return redirect;
  }

  const raw = await context.params;
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsed.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const abs = resolveUnderReportRoot(parsed.data.projectId, parsed.data.path ?? []);
  if (abs === null) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    await readFile(abs, { flag: "r" });
  } catch {
    return NextResponse.json(
      { error: "Report not found. Run tests once with HTML reporter enabled." },
      { status: 404 },
    );
  }

  try {
    return await readReportFileResponse({ absoluteFilePath: abs, requestUrl: req.url });
  } catch {
    return NextResponse.json({ error: "Could not read report file" }, { status: 500 });
  }
}
