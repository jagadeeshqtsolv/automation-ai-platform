import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { getProjectPlatformType } from "@/lib/project-platform";
import { buildPlaywrightWebConfig } from "@/lib/playwright-web-environment-config";

function sanitizeFilename(name: string): string | null {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "");
  if (!base.endsWith(".json") || base.length < 6 || base.includes("..")) return null;
  return base;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string; filename: string }> },
) {
  const { projectId, filename } = await context.params;
  const guard = await withAuthAndProject(projectId);
  if ("error" in guard) return guard.error;

  const safeFilename = sanitizeFilename(filename);
  if (!safeFilename) {
    return NextResponse.json({ error: "Invalid filename." }, { status: 400 });
  }

  const record = await prisma.projectAuthFile.findUnique({
    where: { projectId_filename: { projectId, filename: safeFilename } },
    select: { filename: true, content: true, sizeBytes: true, updatedAt: true },
  });

  if (!record) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  return NextResponse.json({
    filename: record.filename,
    content: record.content,
    sizeBytes: record.sizeBytes,
    updatedAt: record.updatedAt.toISOString(),
  });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ projectId: string; filename: string }> },
) {
  const { projectId, filename } = await context.params;
  const guard = await withAuthAndProject(projectId);
  if ("error" in guard) return guard.error;

  const safeFilename = sanitizeFilename(filename);
  if (!safeFilename) {
    return NextResponse.json({ error: "Invalid filename." }, { status: 400 });
  }

  const deleted = await prisma.projectAuthFile.deleteMany({
    where: { projectId, filename: safeFilename },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "File not found." }, { status: 404 });
  }

  const platformType = await getProjectPlatformType(projectId);

  // Remove from disk (best-effort — DB deletion is authoritative)
  try {
    const authDir = path.join(getProjectFrameworkRoot(projectId, platformType), ".auth");
    const filePath = path.join(authDir, safeFilename);
    if (filePath.startsWith(authDir + path.sep)) {
      await rm(filePath, { force: true });
    }
  } catch { /* non-fatal */ }

  // Update playwright.config.ts — switch to next file or remove storageState (web only)
  if (platformType === "web") {
    const configPath = resolveFrameworkFilePath(projectId, "playwright.config.ts", "web");
    if (configPath !== null) {
      const next = await prisma.projectAuthFile.findFirst({
        where: { projectId },
        orderBy: { updatedAt: "desc" },
        select: { filename: true },
      });
      await writeFile(
        configPath,
        buildPlaywrightWebConfig(null, next ? `.auth/${next.filename}` : undefined),
        "utf8",
      ).catch(() => {});
    }
  }

  return NextResponse.json({ deleted: safeFilename });
}
