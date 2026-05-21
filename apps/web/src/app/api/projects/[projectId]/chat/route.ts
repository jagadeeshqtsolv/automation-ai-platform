import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { handleProjectChatMessage } from "@/lib/project-chat/handle-project-chat";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
});

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
});

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
  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { id: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reply = await handleProjectChatMessage({
    projectId: parsedParams.data.projectId,
    message: parsedBody.data.message,
  });

  return NextResponse.json(reply);
}
