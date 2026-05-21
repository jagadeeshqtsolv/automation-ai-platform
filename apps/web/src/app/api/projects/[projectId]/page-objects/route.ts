import { NextResponse } from "next/server";
import { z } from "zod";
import { createPageObjectBodySchema } from "@automation-ai/shared";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { normalizePageObjectFile } from "@/lib/page-object-naming";
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

  const pageObjects = await prisma.pageObject.findMany({
    where: { projectId: parsed.data.projectId },
    orderBy: { modulePath: "asc" },
    select: {
      id: true,
      className: true,
      modulePath: true,
      methodSummary: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(pageObjects);
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
  const parsedBody = createPageObjectBodySchema.omit({ projectId: true }).safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { id: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const normalized = normalizePageObjectFile({
    path: parsedBody.data.modulePath,
    content: parsedBody.data.content,
    className: parsedBody.data.className,
  });
  const modulePath = normalized.path.trim().replace(/^\.\//, "");
  if (modulePath.includes("..")) {
    return NextResponse.json({ error: "Invalid modulePath" }, { status: 400 });
  }

  try {
    const created = await prisma.pageObject.create({
      data: {
        projectId: parsedParams.data.projectId,
        className: normalized.className,
        modulePath,
        content: normalized.content,
        methodSummary: parsedBody.data.methodSummary ?? "",
      },
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
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create page object (duplicate modulePath?)" }, { status: 409 });
  }
}
