import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectGitConfigView } from "@/lib/project-git/git-config";
import { getUserGitConfigView, getUserGitToken } from "@/lib/project-git/user-git-config";
import { initRepo, commitAndPush } from "@/lib/project-git/repo-ops";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({ projectId: z.string().uuid() });

/**
 * POST — initialise local git on the base branch and push all framework files to it.
 * Intended for admins/owners to seed the main branch after setting up the project repo.
 */
export async function POST(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const [projectConfig, userConfig, token, project] = await Promise.all([
    getProjectGitConfigView(params.data.projectId),
    getUserGitConfigView(params.data.projectId, guard.user.id),
    getUserGitToken(params.data.projectId, guard.user.id),
    prisma.project.findUnique({
      where: { id: params.data.projectId },
      select: { platformType: true },
    }),
  ]);

  if (!projectConfig || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!projectConfig.remoteUrl) {
    return NextResponse.json(
      { error: "Remote URL is not configured. Save the repository settings first." },
      { status: 400 },
    );
  }
  if (!userConfig.authorName) {
    return NextResponse.json(
      { error: "Commit author name is not set. Save your Git settings first." },
      { status: 400 },
    );
  }
  if (!userConfig.authorEmail) {
    return NextResponse.json(
      { error: "Commit author email is not set. Save your Git settings first." },
      { status: 400 },
    );
  }
  if (!token) {
    return NextResponse.json(
      { error: "Personal access token is not set. Save your Git settings first." },
      { status: 400 },
    );
  }

  const platformType = project.platformType as "web" | "mobile";
  const baseBranch = projectConfig.baseBranch;

  try {
    // Initialise (or re-init) on the base branch
    await initRepo({
      projectId: params.data.projectId,
      platformType,
      remoteUrl: projectConfig.remoteUrl,
      branch: baseBranch,
      authorName: userConfig.authorName,
      authorEmail: userConfig.authorEmail,
      token,
      userId: guard.user.id,
    });

    // Commit all current files and push to the base branch.
    // allowUnrelatedHistories handles repos that have an existing initial commit (e.g. GitHub README).
    const result = await commitAndPush({
      projectId: params.data.projectId,
      platformType,
      remoteUrl: projectConfig.remoteUrl,
      branch: baseBranch,
      authorName: userConfig.authorName,
      authorEmail: userConfig.authorEmail,
      token,
      userId: guard.user.id,
      message: "chore: initialise base project structure",
      allowUnrelatedHistories: true,
    });

    // Switch the admin back to their personal working branch so they don't end up on main.
    // This is a best-effort step — if the branch isn't set yet, skip silently.
    if (userConfig.branch && userConfig.branch !== baseBranch) {
      await initRepo({
        projectId: params.data.projectId,
        platformType,
        remoteUrl: projectConfig.remoteUrl,
        branch: userConfig.branch,
        baseBranch,
        authorName: userConfig.authorName,
        authorEmail: userConfig.authorEmail,
        token,
        userId: guard.user.id,
      });
    }

    return NextResponse.json({
      ok: true,
      branch: baseBranch,
      committed: result.committed,
      pushed: result.pushed,
      summary: result.summary,
    });
  } catch (err) {
    let message = "Push to base branch failed. Please try again.";
    if (err instanceof Error) {
      const stderr = "stderr" in err ? String((err as { stderr: unknown }).stderr).trim() : "";
      const raw = stderr || err.message;
      if (/timed out/i.test(raw)) {
        message = "Git push timed out — check your internet connection and try again.";
      } else if (/authentication failed|could not read username|invalid credentials|403/i.test(raw)) {
        message = "Authentication failed — your access token may have expired. Update it in Git Settings.";
      } else if (/repository not found|does not exist|404/i.test(raw)) {
        message = "Repository not found — check the remote URL in Setup → Git.";
      } else if (/permission|access denied|forbidden/i.test(raw)) {
        message = "Permission denied — make sure your token has write access to the repository.";
      } else if (raw && !/^Command failed: git/i.test(raw)) {
        message = raw;
      }
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
