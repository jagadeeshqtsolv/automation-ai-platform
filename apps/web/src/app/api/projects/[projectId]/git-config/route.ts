import { NextResponse } from "next/server";
import { z } from "zod";
import { updateProjectGitConfigBodySchema, updateProjectCiConfigBodySchema } from "@jagadeeshqtsolv/core";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import {
  getProjectGitConfigView,
  getProjectCiConfigView,
  saveProjectGitConfig,
  saveProjectCiConfig,
} from "@/lib/project-git/git-config";
import { getUserGitConfigView } from "@/lib/project-git/user-git-config";
import { getRepoStatus } from "@/lib/project-git/repo-ops";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({ projectId: z.string().uuid() });

export async function GET(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const [projectConfig, ciConfig, userConfig, project] = await Promise.all([
    getProjectGitConfigView(params.data.projectId),
    getProjectCiConfigView(params.data.projectId).catch(() => null),
    getUserGitConfigView(params.data.projectId, guard.user.id),
    prisma.project.findUnique({
      where: { id: params.data.projectId },
      select: { platformType: true },
    }),
  ]);

  if (!projectConfig || !project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const repoStatus = await getRepoStatus(
    params.data.projectId,
    project.platformType as "web" | "mobile",
    guard.user.id,
  ).catch(() => ({ initialized: false, hasRemote: false, pendingFiles: 0 }));

  return NextResponse.json({ projectConfig, ciConfig, userConfig, repoStatus });
}

export async function PATCH(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const json: unknown = await req.json().catch(() => null);

  // Accept either git-config or CI-config updates in the same PATCH
  const gitParsed = updateProjectGitConfigBodySchema.safeParse(json);
  const ciParsed = updateProjectCiConfigBodySchema.safeParse(json);

  if (!gitParsed.success && !ciParsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (gitParsed.success && (gitParsed.data.gitRemoteUrl !== undefined || gitParsed.data.gitBaseBranch !== undefined)) {
    await saveProjectGitConfig(params.data.projectId, {
      gitRemoteUrl: gitParsed.data.gitRemoteUrl,
      gitBaseBranch: gitParsed.data.gitBaseBranch,
    });
  }

  if (ciParsed.success && (ciParsed.data.gitCiToken !== undefined || ciParsed.data.gitWorkflowFile !== undefined)) {
    await saveProjectCiConfig(params.data.projectId, {
      gitCiToken: ciParsed.data.gitCiToken,
      gitWorkflowFile: ciParsed.data.gitWorkflowFile,
    });
  }

  const [projectConfig, ciConfig] = await Promise.all([
    getProjectGitConfigView(params.data.projectId),
    getProjectCiConfigView(params.data.projectId),
  ]);
  return NextResponse.json({ projectConfig, ciConfig });
}
