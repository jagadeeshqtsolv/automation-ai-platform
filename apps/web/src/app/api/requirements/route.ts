import { NextResponse } from "next/server";
import { createRequirementBodySchema } from "@jagadeeshqtsolv/core";
import { getAccessibleProject } from "@/lib/auth/access";
import { requireApiUser, requireProjectAccess } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { syncRequirementToDisk } from "@/lib/local-framework/sync-workspace-to-disk";

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const json: unknown = await req.json().catch(() => null);
  const parsed = createRequirementBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const access = await requireProjectAccess(auth.id, parsed.data.projectId);
  if (access instanceof NextResponse) {
    return access;
  }

  const project = await getAccessibleProject(auth.id, parsed.data.projectId);
  if (project === null) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const requirement = await prisma.requirement.create({
    data: {
      projectId: parsed.data.projectId,
      title: parsed.data.title ?? null,
      content: parsed.data.content,
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
    projectId: project.id,
    projectName: project.name,
    requirement,
    userId: auth.id,
  });

  return NextResponse.json(requirement, { status: 201 });
}
