import { writeFile } from "node:fs/promises";
import type { WebPageElement } from "@automation-ai/core";
import { buildPlaywrightWebConfig } from "@/lib/playwright-web-environment-config";
import { ensureWebFrameworkScaffold, writePlaywrightWebConfig } from "@/lib/local-framework/web-scaffold";
import { buildWebPageAssets } from "@/lib/screen-codegen/build-web-page-assets";
import { syncWebSupportHelpersToDisk } from "@/lib/local-framework/sync-web-support-helpers";
import { writeFrameworkFiles } from "@/lib/local-framework/writer";
import { syncEnvironmentToDisk } from "@/lib/sync-environment-disk";
import { resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { normalizePageClassName } from "@/lib/page-object-naming";
import { prisma } from "@/lib/prisma";

export async function savePageFromBrowser(params: {
  projectId: string;
  projectName: string;
  pageName: string;
  elements: WebPageElement[];
  environmentId?: string;
  overwriteExisting: boolean;
}): Promise<{
  pageObjectId: string;
  pageModulePath: string;
  frameworkRoot: string;
}> {
  const pageLabel = normalizePageClassName(params.pageName).replace(/Page$/, "");
  const assets = buildWebPageAssets(pageLabel, params.elements);

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
      const cfgPath = resolveFrameworkFilePath(params.projectId, "playwright.config.ts", "web");
      if (cfgPath !== null) {
        await writeFile(cfgPath, buildPlaywrightWebConfig(env.configJson), "utf8");
      }
    }
  }

  await ensureWebFrameworkScaffold({
    projectId: params.projectId,
    projectName: params.projectName,
    environmentConfigJson: envConfig,
  });

  if (envConfig !== null) {
    await writePlaywrightWebConfig(params.projectId, envConfig);
  }

  const elementsJson = JSON.stringify(params.elements);

  const existing = await prisma.pageObject.findUnique({
    where: { projectId_modulePath: { projectId: params.projectId, modulePath: assets.pageModulePath } },
    select: { id: true },
  });
  if (existing !== null && !params.overwriteExisting) {
    throw new Error(`Page "${pageLabel}" already exists. Enable overwrite to replace.`);
  }

  const row = await prisma.pageObject.upsert({
    where: { projectId_modulePath: { projectId: params.projectId, modulePath: assets.pageModulePath } },
    create: {
      projectId: params.projectId,
      screenName: pageLabel,
      className: assets.className,
      modulePath: assets.pageModulePath,
      content: assets.pageContent,
      methodSummary: assets.methodSummary,
      elementsJson,
    },
    update: {
      screenName: pageLabel,
      className: assets.className,
      content: assets.pageContent,
      methodSummary: assets.methodSummary,
      elementsJson,
    },
    select: { id: true },
  });

  await syncWebSupportHelpersToDisk(params.projectId);

  const framework = await writeFrameworkFiles({
    projectId: params.projectId,
    projectName: params.projectName,
    files: [{ relativePath: assets.pageModulePath, content: assets.pageContent }],
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
