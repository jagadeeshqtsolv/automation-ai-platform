import { prisma } from "@/lib/prisma";
import type { ScreenElement } from "@automation-ai/shared";
import { normalizeScreenClassName } from "@/lib/page-object-naming";
import { buildScreenAssets } from "@/lib/screen-codegen/build-screen-assets";
import { ensureFrameworkScaffold, buildMobilewrightConfig } from "@/lib/local-framework/scaffold";
import { LOCATE_HELPER_SOURCE } from "@/lib/screen-codegen/locate-helper";
import { MOBILE_ACTIONS_HELPER_SOURCE } from "@/lib/screen-codegen/actions-helper";
import { writeFrameworkFiles } from "@/lib/local-framework/writer";
import { syncEnvironmentToDisk } from "@/lib/sync-environment-disk";
import { resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { writeFile } from "node:fs/promises";

export async function saveScreenFromDevice(params: {
  projectId: string;
  projectName: string;
  screenName: string;
  elements: ScreenElement[];
  environmentId?: string;
  overwriteExisting: boolean;
}): Promise<{
  pageObjectId: string;
  pageModulePath: string;
  frameworkRoot: string;
}> {
  const screenLabel = normalizeScreenClassName(params.screenName).replace(/Screen$/, "");
  const assets = buildScreenAssets(screenLabel, params.elements);

  let envConfig: string | null = null;
  if (params.environmentId !== undefined) {
    const env = await prisma.environment.findFirst({
      where: { id: params.environmentId, projectId: params.projectId },
      select: { slug: true, configJson: true, name: true },
    });
    if (env !== null) {
      envConfig = env.configJson;
      let configObj: Record<string, unknown> = {};
      try {
        configObj = JSON.parse(env.configJson) as Record<string, unknown>;
      } catch {
        configObj = {};
      }
      const diskPayload = JSON.stringify({ name: env.name, slug: env.slug, ...configObj }, null, 2);
      await syncEnvironmentToDisk({
        projectId: params.projectId,
        slug: env.slug,
        configJson: diskPayload,
      });
      const cfgPath = resolveFrameworkFilePath(params.projectId, "mobilewright.config.ts");
      if (cfgPath !== null) {
        await writeFile(cfgPath, buildMobilewrightConfig(env.configJson), "utf8");
      }
    }
  }

  await ensureFrameworkScaffold({
    projectId: params.projectId,
    projectName: params.projectName,
    environmentConfigJson: envConfig,
  });

  const elementsJson = JSON.stringify(params.elements);

  const existing = await prisma.pageObject.findUnique({
    where: { projectId_modulePath: { projectId: params.projectId, modulePath: assets.pageModulePath } },
    select: { id: true },
  });
  if (existing !== null && !params.overwriteExisting) {
    throw new Error(`Screen "${screenLabel}" already exists. Enable overwrite to replace.`);
  }

  const row = await prisma.pageObject.upsert({
    where: { projectId_modulePath: { projectId: params.projectId, modulePath: assets.pageModulePath } },
    create: {
      projectId: params.projectId,
      screenName: screenLabel,
      className: assets.className,
      modulePath: assets.pageModulePath,
      content: assets.pageContent,
      methodSummary: assets.methodSummary,
      elementsJson,
    },
    update: {
      screenName: screenLabel,
      className: assets.className,
      content: assets.pageContent,
      methodSummary: assets.methodSummary,
      elementsJson,
    },
    select: { id: true },
  });

  const framework = await writeFrameworkFiles({
    projectId: params.projectId,
    projectName: params.projectName,
    files: [
      { relativePath: "support/locate.ts", content: LOCATE_HELPER_SOURCE },
      { relativePath: "support/actions.ts", content: MOBILE_ACTIONS_HELPER_SOURCE },
      { relativePath: assets.pageModulePath, content: assets.pageContent },
    ],
    overwritePageObjects: params.overwriteExisting,
    overwriteTests: false,
    environment: null,
  });

  return {
    pageObjectId: row.id,
    pageModulePath: assets.pageModulePath,
    frameworkRoot: framework.rootPath,
  };
}
