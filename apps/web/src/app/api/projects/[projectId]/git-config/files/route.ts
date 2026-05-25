import { existsSync } from "node:fs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectGitConfigView } from "@/lib/project-git/git-config";
import { getUserGitConfigView, getUserGitToken } from "@/lib/project-git/user-git-config";
import { initRepo, listChangedFiles } from "@/lib/project-git/repo-ops";
import { getProjectUserGitDir } from "@/lib/local-framework/paths";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({ projectId: z.string().uuid() });

export async function GET(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const [project, projectConfig, userConfig, token] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.data.projectId },
      select: { platformType: true },
    }),
    getProjectGitConfigView(params.data.projectId),
    getUserGitConfigView(params.data.projectId, guard.user.id),
    getUserGitToken(params.data.projectId, guard.user.id),
  ]);

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const platformType = project.platformType as "web" | "mobile";

  // Auto-initialize the user's git dir on first open so changed files are visible immediately.
  // Only run if all required config is present and git dir doesn't exist yet.
  if (
    projectConfig?.remoteUrl &&
    userConfig.branch &&
    userConfig.authorName &&
    userConfig.authorEmail &&
    token
  ) {
    const gitDir = getProjectUserGitDir(params.data.projectId, platformType, guard.user.id);
    if (!existsSync(gitDir)) {
      try {
        await initRepo({
          projectId: params.data.projectId,
          platformType,
          remoteUrl: projectConfig.remoteUrl,
          branch: userConfig.branch,
          baseBranch: projectConfig.baseBranch,
          authorName: userConfig.authorName,
          authorEmail: userConfig.authorEmail,
          token,
          userId: guard.user.id,
        });
      } catch {
        // Non-fatal: list will return [] or use legacy .git
      }
    }
  }

  const files = await listChangedFiles(params.data.projectId, platformType, guard.user.id);

  return NextResponse.json({ files });
}
