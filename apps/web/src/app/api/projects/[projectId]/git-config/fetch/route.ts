import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectGitConfigView } from "@/lib/project-git/git-config";
import { getUserGitToken } from "@/lib/project-git/user-git-config";
import { fetchRemote } from "@/lib/project-git/repo-ops";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({ projectId: z.string().uuid() });

export async function POST(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const [projectConfig, token, project] = await Promise.all([
    getProjectGitConfigView(params.data.projectId),
    getUserGitToken(params.data.projectId, guard.user.id),
    prisma.project.findUnique({
      where: { id: params.data.projectId },
      select: { platformType: true },
    }),
  ]);

  if (!projectConfig || !project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!projectConfig.remoteUrl) {
    return NextResponse.json(
      { error: "Remote URL is not configured. Ask your admin to set it in Setup → Git." },
      { status: 400 },
    );
  }
  if (!token) {
    return NextResponse.json(
      { error: "No access token saved. Add your personal access token in Git Settings." },
      { status: 400 },
    );
  }

  try {
    const result = await fetchRemote({
      projectId: params.data.projectId,
      platformType: project.platformType as "web" | "mobile",
      remoteUrl: projectConfig.remoteUrl,
      token,
      userId: guard.user.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
