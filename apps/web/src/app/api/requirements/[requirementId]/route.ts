import { NextResponse } from "next/server";
import { updateRequirementBodySchema } from "@automation-ai/shared";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { syncRequirementToDisk } from "@/lib/local-framework/sync-workspace-to-disk";
import { deleteRequirementForProject } from "@/lib/requirements/mutations";

const paramsSchema = z.object({
  requirementId: z.string().uuid(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ requirementId: string }> },
) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid requirement id" }, { status: 400 });
  }

  const json: unknown = await req.json().catch(() => null);
  const parsedBody = updateRequirementBodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const existing = await prisma.requirement.findUnique({
    where: { id: parsedParams.data.requirementId },
    select: {
      id: true,
      projectId: true,
      project: { select: { name: true } },
    },
  });
  if (existing === null) {
    return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
  }

  const guard = await withAuthAndProject(existing.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const title =
    parsedBody.data.title === undefined
      ? undefined
      : parsedBody.data.title.trim().length > 0
        ? parsedBody.data.title.trim()
        : null;

  const requirement = await prisma.requirement.update({
    where: { id: existing.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      content: parsedBody.data.content,
    },
    select: {
      id: true,
      projectId: true,
      title: true,
      content: true,
      createdAt: true,
    },
  });

  await syncRequirementToDisk({
    projectId: existing.projectId,
    projectName: existing.project.name,
    requirement,
  });

  return NextResponse.json({
    ...requirement,
    createdAt: requirement.createdAt.toISOString(),
  });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ requirementId: string }> },
) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid requirement id" }, { status: 400 });
  }

  const existing = await prisma.requirement.findUnique({
    where: { id: parsedParams.data.requirementId },
    select: { id: true, projectId: true },
  });
  if (existing === null) {
    return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
  }

  const guard = await withAuthAndProject(existing.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const result = await deleteRequirementForProject(existing.projectId, existing.id);
  if (result === "not_found") {
    return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: "requirement" as const });
}
