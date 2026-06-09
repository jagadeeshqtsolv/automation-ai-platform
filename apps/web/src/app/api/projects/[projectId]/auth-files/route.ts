import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
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

async function writeToDisk(projectId: string, filename: string, content: string): Promise<void> {
  const platformType = await getProjectPlatformType(projectId);
  const authDir = path.join(getProjectFrameworkRoot(projectId, platformType), ".auth");
  await mkdir(authDir, { recursive: true });
  const filePath = path.join(authDir, filename);
  // Guard traversal even after sanitizeFilename
  if (!filePath.startsWith(authDir + path.sep)) return;
  const body = content.endsWith("\n") ? content : `${content}\n`;
  await writeFile(filePath, body, "utf8");
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const guard = await withAuthAndProject(projectId);
  if ("error" in guard) return guard.error;

  const records = await prisma.projectAuthFile.findMany({
    where: { projectId },
    select: { id: true, filename: true, sizeBytes: true, updatedAt: true },
    orderBy: { filename: "asc" },
  });

  const files = records.map((r) => ({
    filename: r.filename,
    sizeBytes: r.sizeBytes,
    updatedAt: r.updatedAt.toISOString(),
  }));

  return NextResponse.json({ files });
}

const importSchema = z.object({
  filename: z.string().min(1).max(200),
  content: z.string().min(1).max(2_000_000),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const guard = await withAuthAndProject(projectId);
  if ("error" in guard) return guard.error;

  const json: unknown = await req.json().catch(() => null);
  const parsed = importSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request. Expected { filename, content }." },
      { status: 400 },
    );
  }

  const safeFilename = sanitizeFilename(parsed.data.filename);
  if (!safeFilename) {
    return NextResponse.json(
      { error: "Invalid filename. Must be a .json file with no path separators." },
      { status: 400 },
    );
  }

  // Validate content is parseable JSON
  try {
    JSON.parse(parsed.data.content);
  } catch {
    return NextResponse.json(
      { error: "File content is not valid JSON." },
      { status: 400 },
    );
  }

  const sizeBytes = Buffer.byteLength(parsed.data.content, "utf8");

  // Upsert into DB
  const record = await prisma.projectAuthFile.upsert({
    where: { projectId_filename: { projectId, filename: safeFilename } },
    create: { projectId, filename: safeFilename, content: parsed.data.content, sizeBytes },
    update: { content: parsed.data.content, sizeBytes },
    select: { filename: true, sizeBytes: true, updatedAt: true },
  });

  // Write to disk (best-effort — DB is the source of truth)
  await writeToDisk(projectId, safeFilename, parsed.data.content).catch(() => {});

  // Update playwright.config.ts with storageState immediately (web only)
  const platformType = await getProjectPlatformType(projectId);
  if (platformType === "web") {
    const configPath = resolveFrameworkFilePath(projectId, "playwright.config.ts", "web");
    if (configPath !== null) {
      await writeFile(configPath, buildPlaywrightWebConfig(null, `.auth/${safeFilename}`), "utf8").catch(() => {});
    }
  }

  return NextResponse.json(
    { filename: record.filename, sizeBytes: record.sizeBytes, updatedAt: record.updatedAt.toISOString() },
    { status: 201 },
  );
}
