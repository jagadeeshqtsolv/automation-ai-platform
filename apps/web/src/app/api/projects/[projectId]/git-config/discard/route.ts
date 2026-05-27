import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { discardFiles } from "@/lib/project-git/repo-ops";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({ projectId: z.string().uuid() });
const bodySchema = z.object({
  files: z.array(z.string().min(1).max(1000)).min(1).max(200),
});

export async function POST(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const json: unknown = await req.json().catch(() => ({}));
  const body = bodySchema.safeParse(json);
  if (!body.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id: params.data.projectId },
    select: { platformType: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await discardFiles({
    projectId: params.data.projectId,
    platformType: project.platformType as "web" | "mobile",
    userId: guard.user.id,
    files: body.data.files,
  });

  return NextResponse.json({ ok: true, discarded: result.discarded });
}
