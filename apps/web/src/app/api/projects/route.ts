import { NextResponse } from "next/server";
import { createProjectBodySchema } from "@automation-ai/shared";
import { requireApiUser, requireOrgAccess } from "@/lib/auth/api-auth";
import { listAccessibleProjectIds } from "@/lib/auth/access";
import { scheduleFrameworkDependencyInstall } from "@/lib/local-framework/install-dependencies";
import { ensureProjectFrameworkScaffold } from "@/lib/local-framework/ensure-project-scaffold";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId");

  if (organizationId === null || organizationId.length === 0) {
    return NextResponse.json({ error: "organizationId query parameter is required" }, { status: 400 });
  }

  const orgCheck = await requireOrgAccess(auth.id, organizationId);
  if (orgCheck instanceof NextResponse) {
    return orgCheck;
  }

  const projectIds = await listAccessibleProjectIds(auth.id, organizationId);
  if (projectIds.length === 0) {
    return NextResponse.json([]);
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, organizationId: true, platformType: true },
  });

  return NextResponse.json(
    projects.map((p) => ({
      id: p.id,
      name: p.name,
      organizationId: p.organizationId,
      platformType: p.platformType,
      createdAt: p.createdAt.toISOString(),
    })),
  );
}

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const json: unknown = await req.json().catch(() => null);
  const parsed = createProjectBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const orgCheck = await requireOrgAccess(auth.id, parsed.data.organizationId);
  if (orgCheck instanceof NextResponse) {
    return orgCheck;
  }

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      organizationId: parsed.data.organizationId,
      platformType: parsed.data.platformType,
    },
    select: { id: true, name: true, createdAt: true, organizationId: true, platformType: true },
  });

  await ensureProjectFrameworkScaffold({
    projectId: project.id,
    projectName: project.name,
    platformType: parsed.data.platformType,
  });
  scheduleFrameworkDependencyInstall(project.id);

  return NextResponse.json(
    {
      id: project.id,
      name: project.name,
      organizationId: project.organizationId,
      platformType: project.platformType,
      createdAt: project.createdAt.toISOString(),
      frameworkReady: false,
      frameworkInstallPending: true,
    },
    { status: 201 },
  );
}
