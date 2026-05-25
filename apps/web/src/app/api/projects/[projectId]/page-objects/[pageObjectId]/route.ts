import { NextResponse } from "next/server";
import { z } from "zod";
import { updatePageObjectBodySchema } from "@automation-ai/core";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { inferMethodSummary } from "@/lib/page-object-utils";
import { alignPageObjectClassInContent, normalizePageClassName } from "@/lib/page-object-naming";
import { deleteFrameworkFile } from "@/lib/local-framework/delete-project";
import { syncPageObjectToDisk } from "@/lib/local-framework/writer";

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
    select: { id: true, modulePath: true },
  });
  if (existing === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.pageObject.delete({ where: { id: existing.id } });
  await deleteFrameworkFile(parsedParams.data.projectId, existing.modulePath);
  return NextResponse.json({ ok: true });
}
