import { NextResponse } from "next/server";
import { z } from "zod";
import { updateEnvironmentBodySchema } from "@jagadeeshqtsolv/core";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { normalizeConfigJsonString } from "@/lib/config-json";
import { syncEnvironmentToDisk } from "@/lib/sync-environment-disk";
import { writeProjectTestConfig } from "@/lib/local-framework/project-config-writer";
import { resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { unlink } from "node:fs/promises";
import { getProjectPlatformType } from "@/lib/project-platform";
import { recordUserFiles } from "@/lib/local-framework/user-file-tracker";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  environmentId: z.string().uuid(),
});

export async function PATCH(req: Request, context: { params: Promise<{ projectId: string; environmentId: string }> }) {
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
  const parsedBody = updateEnvironmentBodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const env = await prisma.environment.findFirst({
    where: { id: parsedParams.data.environmentId, projectId: parsedParams.data.projectId },
    select: { id: true },
  });
  if (env === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let nextConfig: string | undefined;
  if (parsedBody.data.configJson !== undefined) {
    const cfg = normalizeConfigJsonString(parsedBody.data.configJson);
    if (!cfg.ok) {
      return NextResponse.json({ error: cfg.error }, { status: 400 });
    }
    nextConfig = cfg.value;
  }

  const data: {
    name?: string;
    description?: string | null;
    configJson?: string;
  } = {};
  if (parsedBody.data.name !== undefined) {
    data.name = parsedBody.data.name;
  }
  if (parsedBody.data.description !== undefined) {
    data.description = parsedBody.data.description;
  }
  if (nextConfig !== undefined) {
    data.configJson = nextConfig;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const updated = await prisma.environment.update({
    where: { id: env.id },
    data,
    select: { id: true, name: true, slug: true, description: true, configJson: true, createdAt: true, updatedAt: true },
  });

  let configObj: Record<string, unknown> = {};
  try {
    configObj = JSON.parse(updated.configJson) as Record<string, unknown>;
  } catch {
    configObj = {};
  }
  const diskPayload = JSON.stringify({ name: updated.name, slug: updated.slug, ...configObj }, null, 2);
  await syncEnvironmentToDisk({
    projectId: parsedParams.data.projectId,
    slug: updated.slug,
    configJson: diskPayload,
  });

  const platformType = await getProjectPlatformType(parsedParams.data.projectId);
  await writeProjectTestConfig(parsedParams.data.projectId, updated.configJson);

  await recordUserFiles(
    parsedParams.data.projectId,
    platformType,
    guard.user.id,
    [`environments/${updated.slug}.json`],
  ).catch(() => {});

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ projectId: string; environmentId: string }> },
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

  const env = await prisma.environment.findFirst({
    where: { id: parsedParams.data.environmentId, projectId: parsedParams.data.projectId },
    select: { id: true, slug: true },
  });
  if (env === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.environment.delete({ where: { id: env.id } });

  const envFile = resolveFrameworkFilePath(parsedParams.data.projectId, `environments/${env.slug}.json`);
  if (envFile !== null) {
    await unlink(envFile).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
