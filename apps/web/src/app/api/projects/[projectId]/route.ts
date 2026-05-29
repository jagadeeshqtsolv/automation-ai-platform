import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, requireProjectAccess } from "@/lib/auth/api-auth";
import { deleteProjectFrameworkDir } from "@/lib/local-framework/delete-project";
import { prisma } from "@/lib/prisma";
import { PROJECT_NAME_MAX } from "@jagadeeshqtsolv/core";

const renameBodySchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(PROJECT_NAME_MAX).trim(),
});

const paramsSchema = z.object({
  projectId: z.string().uuid(),
});

export async function GET(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const access = await requireProjectAccess(auth.id, parsedParams.data.projectId);
  if (access instanceof NextResponse) {
    return access;
  }

  const project = await prisma.project.findUnique({
    where: { id: parsedParams.data.projectId },
    include: {
      environments: {
        orderBy: { slug: "asc" },
        select: { id: true, name: true, slug: true, description: true, configJson: true, createdAt: true, updatedAt: true },
      },
      pageObjects: {
        orderBy: { modulePath: "asc" },
        select: {
          id: true,
          className: true,
          modulePath: true,
          methodSummary: true,
          screenName: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      requirements: {
        orderBy: { createdAt: "desc" },
        include: {
          testPlans: {
            orderBy: { createdAt: "desc" },
            take: 5,
            include: {
              generatedCodes: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  createdAt: true,
                  model: true,
                  typescript: true,
                  environmentId: true,
                  environment: { select: { id: true, name: true, slug: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (project === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: project.organizationId, userId: auth.id } },
    select: { role: true },
  });

  return NextResponse.json({ ...project, currentUserRole: membership?.role ?? "member" });
}

export async function PATCH(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const access = await requireProjectAccess(auth.id, params.data.projectId);
  if (access instanceof NextResponse) return access;

  // Only owners can rename
  const project = await prisma.project.findUnique({
    where: { id: params.data.projectId },
    select: { organizationId: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: project.organizationId, userId: auth.id } },
    select: { role: true },
  });
  if (membership?.role !== "owner") {
    return NextResponse.json({ error: "Only project owners can rename projects" }, { status: 403 });
  }

  const json: unknown = await req.json().catch(() => ({}));
  const body = renameBodySchema.safeParse(json);
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Invalid name" }, { status: 400 });
  }

  const updated = await prisma.project.update({
    where: { id: params.data.projectId },
    data: { name: body.data.name },
    select: { id: true, name: true },
  });

  return NextResponse.json({ ok: true, name: updated.name });
}

export async function DELETE(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const access = await requireProjectAccess(auth.id, parsedParams.data.projectId);
  if (access instanceof NextResponse) {
    return access;
  }

  const project = await prisma.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { id: true, organizationId: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: project.organizationId, userId: auth.id } },
    select: { role: true },
  });
  if (membership?.role !== "owner") {
    return NextResponse.json({ error: "Only project owners can delete projects" }, { status: 403 });
  }

  const disk = await deleteProjectFrameworkDir(parsedParams.data.projectId);
  if (!disk.ok) {
    return NextResponse.json(
      { error: `Project was not deleted: ${disk.error}` },
      { status: 500 },
    );
  }

  await prisma.project.delete({ where: { id: project.id } });

  return NextResponse.json({ ok: true });
}
