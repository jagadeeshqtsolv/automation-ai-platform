import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectGitConfigView } from "@/lib/project-git/git-config";
import { getUserGitConfigView, getUserGitToken } from "@/lib/project-git/user-git-config";
import { commitAndPush, getRepoStatus, buildPrUrl } from "@/lib/project-git/repo-ops";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({ projectId: z.string().uuid() });
const bodySchema = z.object({
  message: z.string().min(1).max(500).optional(),
  files: z.array(z.string().min(1).max(1000)).optional(),
});

export async function POST(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const json: unknown = await req.json().catch(() => ({}));
  const body = bodySchema.safeParse(json);

  const [projectConfig, userConfig, token, project] = await Promise.all([
    getProjectGitConfigView(params.data.projectId),
    getUserGitConfigView(params.data.projectId, guard.user.id),
    getUserGitToken(params.data.projectId, guard.user.id),
    prisma.project.findUnique({
      where: { id: params.data.projectId },
      select: { platformType: true },
    }),
  ]);

  if (!projectConfig || !project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!projectConfig.remoteUrl) return NextResponse.json({ error: "Project remote URL not configured — ask an owner to set it in Setup → Git." }, { status: 400 });
  if (!userConfig.branch) return NextResponse.json({ error: "Set your working branch in Git Settings before pushing." }, { status: 400 });
  if (userConfig.branch === projectConfig.baseBranch) {
    return NextResponse.json(
      { error: `You are on the protected base branch "${projectConfig.baseBranch}". Set a personal working branch (e.g. feature/your-name) in Git Settings, then save to switch branches.` },
      { status: 400 },
    );
  }
  if (!userConfig.authorName) return NextResponse.json({ error: "Set your author name in Git Settings before pushing." }, { status: 400 });
  if (!userConfig.authorEmail) return NextResponse.json({ error: "Set your author email in Git Settings before pushing." }, { status: 400 });
  if (!token) return NextResponse.json({ error: "Add your personal access token in Git Settings before pushing." }, { status: 400 });

  try {
    const result = await commitAndPush({
      projectId: params.data.projectId,
      platformType: project.platformType as "web" | "mobile",
      remoteUrl: projectConfig.remoteUrl,
      branch: userConfig.branch,
      baseBranch: projectConfig.baseBranch,
      authorName: userConfig.authorName,
      authorEmail: userConfig.authorEmail,
      token,
      userId: guard.user.id,
      files: body.success ? body.data.files : undefined,
      message: body.success ? body.data.message : undefined,
    });

    const repoStatus = await getRepoStatus(
      params.data.projectId,
      project.platformType as "web" | "mobile",
      guard.user.id,
    );

    const prUrl = buildPrUrl(projectConfig.remoteUrl, userConfig.branch, projectConfig.baseBranch);

    return NextResponse.json({ ok: true, ...result, repoStatus, prUrl });
  } catch (err) {
    let message = "Git push failed. Please try again.";
    if (err instanceof Error) {
      const stderr = "stderr" in err ? String((err as { stderr: unknown }).stderr).trim() : "";
      const raw = stderr || err.message;
      // Map common git errors to friendly messages
      if (/timed out/i.test(raw)) {
        message = "Git push timed out — check your internet connection and try again.";
      } else if (/authentication failed|could not read username|invalid credentials|403/i.test(raw)) {
        message = "Authentication failed — your access token may have expired. Update it in Git Settings.";
      } else if (/repository not found|does not exist|404/i.test(raw)) {
        message = "Repository not found — check the remote URL in Setup → Git.";
      } else if (/permission|access denied|forbidden/i.test(raw)) {
        message = "Permission denied — make sure your token has write access to the repository.";
      } else if (/non-fast-forward|rejected|diverged/i.test(raw)) {
        message = "Push rejected — the remote branch has changes you don't have locally. Try pushing again to auto-rebase.";
      } else if (raw && !/^Command failed: git/i.test(raw)) {
        message = raw; // show real git error if it's readable
      }
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
