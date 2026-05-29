import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import {
  getFrameworkDependencyStatus,
  installFrameworkDependencies,
  isFrameworkDependencyInstallInFlight,
} from "@/lib/local-framework/install-dependencies";
import type { ProjectPlatformType } from "@jagadeeshqtsolv/core";
import { ensureProjectFrameworkScaffold } from "@/lib/local-framework/ensure-project-scaffold";
import { prisma } from "@/lib/prisma";

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

  const status = await getFrameworkDependencyStatus(parsed.data.projectId);
  return NextResponse.json({
    ...status,
    installInFlight: isFrameworkDependencyInstallInFlight(parsed.data.projectId),
  });
}

export async function POST(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsed.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { name: true, platformType: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await ensureProjectFrameworkScaffold({ projectId: parsed.data.projectId, projectName: project.name, platformType: project.platformType as ProjectPlatformType });
  const install = await installFrameworkDependencies(parsed.data.projectId);
  const status = await getFrameworkDependencyStatus(parsed.data.projectId);

  if (!install.ok) {
    return NextResponse.json(
      {
        ...status,
        installInFlight: false,
        error: install.error,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ...status,
    installInFlight: false,
  });
}
