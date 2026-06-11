import { readFile, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectGitConfigView } from "@/lib/project-git/git-config";
import { getUserGitConfigView, getUserGitToken } from "@/lib/project-git/user-git-config";
import { initRepo, getRepoStatus } from "@/lib/project-git/repo-ops";
import { prisma } from "@/lib/prisma";
import { resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { recordUserFiles } from "@/lib/local-framework/user-file-tracker";
import { patchPlaywrightStorageState } from "@/lib/playwright-web-environment-config";

const paramsSchema = z.object({ projectId: z.string().uuid() });

/**
 * POST — sync the user's working branch with the latest origin/baseBranch.
 * Safe to call at any time; picks up merged PRs so pending-file count stays accurate.
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

  if (!projectConfig || !project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!projectConfig.remoteUrl) return NextResponse.json({ error: "Remote URL not configured." }, { status: 400 });
  if (!userConfig.branch) return NextResponse.json({ error: "Set your working branch in Git Settings first." }, { status: 400 });
  if (!userConfig.authorName) return NextResponse.json({ error: "Set your author name in Git Settings first." }, { status: 400 });
  if (!userConfig.authorEmail) return NextResponse.json({ error: "Set your author email in Git Settings first." }, { status: 400 });
  if (!token) return NextResponse.json({ error: "Add your access token in Git Settings first." }, { status: 400 });

  try {
    const platformType = project.platformType as "web" | "mobile";

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

    // Re-apply storageState after sync — git reset/checkout can revert uncommitted
    // playwright.config.ts changes. Re-read the auth file list and patch if any exist.
    if (platformType === "web") {
      const authFiles = await prisma.projectAuthFile.findMany({
        where: { projectId: params.data.projectId },
        select: { filename: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      });
      const activeAuth = authFiles[0];
      const configPath = resolveFrameworkFilePath(params.data.projectId, "playwright.config.ts", "web");
      if (configPath !== null) {
        try {
          const existing = await readFile(configPath, "utf-8").catch(() => "");
          const patched = patchPlaywrightStorageState(
            existing,
            activeAuth ? `.auth/${activeAuth.filename}` : null,
          );
          await writeFile(configPath, patched, "utf-8");
          await recordUserFiles(params.data.projectId, platformType, guard.user.id, ["playwright.config.ts"]).catch(() => {});
        } catch {
          // Best-effort — don't fail the sync if config patch fails
        }
      }
    }

    const repoStatus = await getRepoStatus(
      params.data.projectId,
      project.platformType as "web" | "mobile",
      guard.user.id,
    );

    return NextResponse.json({ ok: true, repoStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
