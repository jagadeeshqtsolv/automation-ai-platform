import { NextResponse } from "next/server";
import { z } from "zod";
import { createEnvironmentBodySchema } from "@automation-ai/shared";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { normalizeConfigJsonString } from "@/lib/config-json";
import { ensureProjectFrameworkScaffold } from "@/lib/local-framework/ensure-project-scaffold";
import { writeProjectTestConfig } from "@/lib/local-framework/project-config-writer";
import { projectPlatformTypeSchema } from "@automation-ai/shared";
import { syncEnvironmentToDisk } from "@/lib/sync-environment-disk";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
});

export async function GET(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsed.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const environments = await prisma.environment.findMany({
    where: { projectId: parsed.data.projectId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, description: true, configJson: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(environments);
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
  const parsedBody = createEnvironmentBodySchema
    .omit({ projectId: true })
    .safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { id: true, name: true, platformType: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const platformType = projectPlatformTypeSchema.parse(project.platformType);

  const cfg = normalizeConfigJsonString(parsedBody.data.configJson);
  if (!cfg.ok) {
    return NextResponse.json({ error: cfg.error }, { status: 400 });
  }

  try {
    const env = await prisma.environment.create({
      data: {
        projectId: parsedParams.data.projectId,
        name: parsedBody.data.name,
        slug: parsedBody.data.slug,
        description: parsedBody.data.description ?? null,
        configJson: cfg.value,
      },
      select: { id: true, name: true, slug: true, description: true, configJson: true, createdAt: true, updatedAt: true },
    });

    await ensureProjectFrameworkScaffold({
      projectId: parsedParams.data.projectId,
      projectName: project.name,
      platformType,
      environmentConfigJson: cfg.value,
    });

    const diskPayload = JSON.stringify(
      { name: env.name, slug: env.slug, ...JSON.parse(cfg.value) as Record<string, unknown> },
      null,
      2,
    );
    await syncEnvironmentToDisk({
      projectId: parsedParams.data.projectId,
      slug: env.slug,
      configJson: diskPayload,
    });

    await writeProjectTestConfig(parsedParams.data.projectId, cfg.value);

    return NextResponse.json(env, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create environment (duplicate slug?)" }, { status: 409 });
  }
}
