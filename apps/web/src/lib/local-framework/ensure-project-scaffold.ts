import type { ProjectPlatformType } from "@automation-ai/core";
import { ensureFrameworkScaffold } from "@/lib/local-framework/scaffold";
import { ensureWebFrameworkScaffold } from "@/lib/local-framework/web-scaffold";

/** Create the correct on-disk framework for the project platform (mobile vs web). */
export async function ensureProjectFrameworkScaffold(params: {
  projectId: string;
  projectName: string;
  platformType: ProjectPlatformType;
  environmentConfigJson?: string | null;
}): Promise<void> {
  if (params.platformType === "web") {
    await ensureWebFrameworkScaffold({
      projectId: params.projectId,
      projectName: params.projectName,
      environmentConfigJson: params.environmentConfigJson,
    });
    return;
  }
  await ensureFrameworkScaffold({
    projectId: params.projectId,
    projectName: params.projectName,
    environmentConfigJson: params.environmentConfigJson,
  });
}
