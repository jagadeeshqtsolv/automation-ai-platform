import { NextResponse } from "next/server";
import { z } from "zod";
import { updateUserGitConfigBodySchema } from "@jagadeeshqtsolv/core";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getUserGitConfigView, saveUserGitConfig } from "@/lib/project-git/user-git-config";

const paramsSchema = z.object({ projectId: z.string().uuid() });

export async function GET(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const userConfig = await getUserGitConfigView(params.data.projectId, guard.user.id);
  return NextResponse.json({ userConfig });
}

export async function PATCH(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const json: unknown = await req.json().catch(() => null);
  const parsed = updateUserGitConfigBodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  await saveUserGitConfig(params.data.projectId, guard.user.id, {
    gitBranch: parsed.data.gitBranch,
    gitAuthorName: parsed.data.gitAuthorName,
    gitAuthorEmail: parsed.data.gitAuthorEmail,
    gitToken: parsed.data.gitToken,
  });

  const userConfig = await getUserGitConfigView(params.data.projectId, guard.user.id);
  return NextResponse.json({ userConfig });
}
