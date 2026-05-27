import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { upsertWebPageObjectContent } from "@/lib/upsert-web-page-object";

const pageObjectEntrySchema = z.object({
  className: z.string().min(1).max(200),
  modulePath: z.string().min(1).max(260),
  content: z.string().min(1).max(500_000),
});

const bundleSchema = z.object({
  version: z.number().optional(),
  pageObjects: z.array(pageObjectEntrySchema).min(1).max(100),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;

  const guard = await withAuthAndProject(projectId);
  if ("error" in guard) return guard.error;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const json: unknown = await req.json().catch(() => null);
  const parsed = bundleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bundle. Expected { pageObjects: [{ className, modulePath, content }] }" },
      { status: 400 },
    );
  }

  let imported = 0;
  const errors: string[] = [];

  for (const entry of parsed.data.pageObjects) {
    const modulePath = entry.modulePath.replace(/^\.\//, "").replace(/\.\./g, "");
    if (!modulePath.startsWith("pageobjects/")) {
      errors.push(`${entry.className}: modulePath must start with pageobjects/`);
      continue;
    }
    try {
      await upsertWebPageObjectContent({
        projectId,
        projectName: project.name,
        modulePath,
        content: entry.content,
        className: entry.className,
        screenName: entry.className.replace(/Page$/i, "").replace(/Screen$/i, "") || null,
      });
      imported += 1;
    } catch (err) {
      errors.push(`${entry.className}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  return NextResponse.json(
    { imported, errors: errors.length > 0 ? errors : undefined },
    { status: imported > 0 ? 201 : 400 },
  );
}
