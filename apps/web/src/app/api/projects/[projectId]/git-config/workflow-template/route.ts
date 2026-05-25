import { NextResponse } from "next/server";
import { z } from "zod";
import { detectCiProvider, type CiProvider } from "@automation-ai/core";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectGitConfigView } from "@/lib/project-git/git-config";
import { getProjectPlatformType } from "@/lib/project-platform";
import { generateWorkflowTemplate } from "@/lib/project-git/workflow-template";

const paramsSchema = z.object({ projectId: z.string().uuid() });

export async function GET(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const { projectId } = params.data;
  const guard = await withAuthAndProject(projectId);
  if ("error" in guard) return guard.error;

  const url = new URL(req.url);
  const workflowFile = url.searchParams.get("workflowFile") ?? "run-tests.yml";
  const providerParam = url.searchParams.get("provider") as CiProvider | null;

  const gitConfig = await getProjectGitConfigView(projectId);
  const remoteUrl = gitConfig?.remoteUrl ?? "";
  const provider: CiProvider | null = providerParam ?? (remoteUrl ? detectCiProvider(remoteUrl) : null);

  if (!provider) {
    return NextResponse.json(
      { error: "Could not detect CI provider. Set repository URL first." },
      { status: 422 },
    );
  }

  const platformType = await getProjectPlatformType(projectId);
  const yaml = generateWorkflowTemplate(provider, workflowFile, platformType);

  return new Response(yaml, {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${workflowFile}"`,
    },
  });
}
