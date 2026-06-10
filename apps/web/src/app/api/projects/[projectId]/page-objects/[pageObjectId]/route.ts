import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
// Use a local schema with a higher content limit — the core package caps at 120K
// which is too small for large recorded page objects (HomePage, LeadListPage etc.)
const updatePageObjectBodySchema = z.object({
  className: z.string().min(1).max(120).optional(),
  content: z.string().min(1).max(1_000_000).optional(),
  methodSummary: z.string().max(100_000).optional(),
  elementsJson: z.string().max(500_000).optional(),
});
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { inferMethodSummary } from "@/lib/page-object-utils";
import { alignPageObjectClassInContent, normalizePageClassName } from "@/lib/page-object-naming";
import { deleteFrameworkFile } from "@/lib/local-framework/delete-project";
import { syncPageObjectToDisk, writeFrameworkFiles } from "@/lib/local-framework/writer";
import { generateTestFixturesSource, TEST_FIXTURES_MODULE_PATH } from "@/lib/generate-test-fixtures";
import { getProjectPlatformType } from "@/lib/project-platform";
import { resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { removeUserFiles } from "@/lib/local-framework/user-file-tracker";

async function readCurrentFixtures(projectId: string): Promise<string | null> {
  const fixturePath = resolveFrameworkFilePath(projectId, TEST_FIXTURES_MODULE_PATH);
  if (fixturePath === null) return null;
  try {
    return await readFile(fixturePath, "utf8");
  } catch {
    return null;
  }
}

function classInFixtures(fixturesContent: string, className: string): boolean {
  return fixturesContent.includes(`{ ${className} }`);
}

async function regenerateFixtures(projectId: string, projectName: string): Promise<void> {
  try {
    const allPageObjects = await prisma.pageObject.findMany({
      where: { projectId },
      select: { className: true, modulePath: true },
      orderBy: { className: "asc" },
    });
    const platformType = await getProjectPlatformType(projectId);
    await writeFrameworkFiles({
      projectId,
      projectName,
      files: [{ relativePath: TEST_FIXTURES_MODULE_PATH, content: generateTestFixturesSource(allPageObjects, platformType) }],
      overwritePageObjects: false,
      overwriteTests: false,
    });
  } catch {
    // Non-fatal
  }
}

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  pageObjectId: z.string().uuid(),
});

export async function GET(_req: Request, context: { params: Promise<{ projectId: string; pageObjectId: string }> }) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsedParams.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const page = await prisma.pageObject.findFirst({
    where: { id: parsedParams.data.pageObjectId, projectId: parsedParams.data.projectId },
    select: {
      id: true,
      className: true,
      modulePath: true,
      methodSummary: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (page === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(page);
}

export async function PATCH(req: Request, context: { params: Promise<{ projectId: string; pageObjectId: string }> }) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsedParams.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const json: unknown = await req.json().catch(() => null);
  const parsedBody = updatePageObjectBodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const existing = await prisma.pageObject.findFirst({
    where: { id: parsedParams.data.pageObjectId, projectId: parsedParams.data.projectId },
    select: { id: true, modulePath: true, className: true, methodSummary: true, content: true },
  });
  if (existing === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = await prisma.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { name: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const data: {
    className?: string;
    content?: string;
    methodSummary?: string;
  } = {};
  if (parsedBody.data.className !== undefined) {
    data.className = normalizePageClassName(parsedBody.data.className, existing.className);
  }
  if (parsedBody.data.content !== undefined) {
    const className = normalizePageClassName(
      data.className ?? existing.className,
      existing.className,
    );
    data.content = alignPageObjectClassInContent(parsedBody.data.content, className);
    data.className = className;
    data.methodSummary = inferMethodSummary(data.content, parsedBody.data.methodSummary ?? existing.methodSummary);
  } else if (parsedBody.data.methodSummary !== undefined) {
    data.methodSummary = parsedBody.data.methodSummary;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.pageObject.update({
    where: { id: existing.id },
    data,
    select: {
      id: true,
      className: true,
      modulePath: true,
      methodSummary: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (data.content !== undefined) {
    await syncPageObjectToDisk({
      projectId: parsedParams.data.projectId,
      projectName: project.name,
      modulePath: existing.modulePath,
      content: updated.content,
      overwrite: true,
      userId: guard.user.id,
    });
  }

  // Regenerate fixtures when className changes only if the old name was present
  // (the fixture key is derived from className — renaming requires updating it)
  if (data.className !== undefined) {
    const currentFixtures = await readCurrentFixtures(parsedParams.data.projectId);
    if (currentFixtures === null || classInFixtures(currentFixtures, existing.className)) {
      await regenerateFixtures(parsedParams.data.projectId, project.name);
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ projectId: string; pageObjectId: string }> },
) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid ids" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsedParams.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const existing = await prisma.pageObject.findFirst({
    where: { id: parsedParams.data.pageObjectId, projectId: parsedParams.data.projectId },
    select: { id: true, className: true, modulePath: true },
  });
  if (existing === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const deletedProject = await prisma.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { name: true },
  });

  // Read fixtures before deleting so we know whether a regeneration is needed
  const currentFixtures = await readCurrentFixtures(parsedParams.data.projectId);

  const platformType = await getProjectPlatformType(parsedParams.data.projectId);

  await prisma.pageObject.delete({ where: { id: existing.id } });
  await deleteFrameworkFile(parsedParams.data.projectId, existing.modulePath);

  // Remove from user file tracker so the deleted file no longer shows as a pending change
  await removeUserFiles(
    parsedParams.data.projectId,
    platformType,
    guard.user.id,
    [existing.modulePath],
  ).catch(() => undefined);

  // Only regenerate if the deleted class was actually listed in fixtures
  if (deletedProject && (currentFixtures === null || classInFixtures(currentFixtures, existing.className))) {
    await regenerateFixtures(parsedParams.data.projectId, deletedProject.name);
  }

  return NextResponse.json({ ok: true });
}
