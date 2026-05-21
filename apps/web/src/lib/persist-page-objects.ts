import { prisma } from "@/lib/prisma";
import { syncPageObjectToDisk } from "@/lib/local-framework/writer";
import type { PomMobilewrightBundle } from "@/lib/generate-mobilewright-bundle";
import {
  appendFlowMethodsToMethodSummary,
  enrichPageObjectWithExpectVisibilityMethods,
  enrichPageObjectWithFlowMethods,
} from "@/lib/enrich-page-object-flows";
import { normalizePageObjectFile } from "@/lib/page-object-naming";
import { getProjectPlatformType } from "@/lib/project-platform";
import { sanitizeWebPageObjectFileContent } from "@/lib/sanitize-web-page-object";

function normalizeModulePath(raw: string): string | null {
  const trimmed = raw.trim().replace(/^\.\//, "");
  if (trimmed.length === 0) return null;
  if (trimmed.includes("..")) return null;
  return trimmed;
}

function inferClassName(modulePath: string, content: string, fallback?: string): string {
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback.trim();
  }
  const exported = /export\s+class\s+(\w+)/.exec(content);
  if (exported?.[1]) return exported[1];
  const file = modulePath.split("/").pop() ?? "Page";
  return file.replace(/\.ts$/i, "");
}

function inferMethodSummary(content: string, fallback?: string): string {
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback.trim();
  }
  const names: string[] = [];
  const re = /\basync\s+(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    names.push(m[1]);
  }
  return names.slice(0, 48).join(", ");
}

export async function upsertPageObjectFromHeal(params: {
  projectId: string;
  projectName: string;
  path: string;
  content: string;
}): Promise<string | null> {
  const normalized = normalizePageObjectFile({ path: params.path, content: params.content });
  const modulePath = normalizeModulePath(normalized.path);
  if (modulePath === null || !modulePath.startsWith("pageobjects/")) {
    return null;
  }

  const className = normalized.className;
  const platform = await getProjectPlatformType(params.projectId);
  const enrichedContent =
    platform === "web"
      ? sanitizeWebPageObjectFileContent(
          enrichPageObjectWithFlowMethods(normalized.content),
        )
      : enrichPageObjectWithExpectVisibilityMethods(
          enrichPageObjectWithFlowMethods(normalized.content),
        );
  const methodSummary = appendFlowMethodsToMethodSummary(
    inferMethodSummary(enrichedContent),
    enrichedContent,
  );
  const screenName = (() => {
    const base = className.replace(/Screen$/i, "").replace(/Page$/i, "");
    return base.length > 0 ? base : null;
  })();

  await prisma.pageObject.upsert({
    where: { projectId_modulePath: { projectId: params.projectId, modulePath } },
    create: {
      projectId: params.projectId,
      modulePath,
      className,
      screenName,
      content: enrichedContent,
      methodSummary,
    },
    update: {
      className,
      screenName,
      content: enrichedContent,
      methodSummary,
    },
  });

  await syncPageObjectToDisk({
    projectId: params.projectId,
    projectName: params.projectName,
    modulePath,
    content: enrichedContent,
    overwrite: true,
  });

  return modulePath;
}

export async function upsertPageObjectFilesFromPomBundle(params: {
  projectId: string;
  projectName: string;
  bundle: PomMobilewrightBundle;
  overwriteExisting: boolean;
}): Promise<{ upserted: number; skipped: number }> {
  let upserted = 0;
  let skipped = 0;

  for (const f of params.bundle.pageObjectFiles) {
    const normalized = normalizePageObjectFile({ path: f.path, content: f.content });
    const modulePath = normalizeModulePath(normalized.path);
    if (modulePath === null) continue;

    const existing = await prisma.pageObject.findUnique({
      where: { projectId_modulePath: { projectId: params.projectId, modulePath } },
    });
    if (existing !== null && !params.overwriteExisting) {
      skipped += 1;
      continue;
    }

    const className = normalized.className;
    const platform = await getProjectPlatformType(params.projectId);
    const enrichedContent =
      platform === "web"
        ? sanitizeWebPageObjectFileContent(
            enrichPageObjectWithFlowMethods(normalized.content),
          )
        : enrichPageObjectWithExpectVisibilityMethods(
            enrichPageObjectWithFlowMethods(normalized.content),
          );
    const methodSummary = appendFlowMethodsToMethodSummary(
      inferMethodSummary(enrichedContent),
      enrichedContent,
    );

    await prisma.pageObject.upsert({
      where: { projectId_modulePath: { projectId: params.projectId, modulePath } },
      create: {
        projectId: params.projectId,
        modulePath,
        className,
        content: enrichedContent,
        methodSummary,
      },
      update: {
        className,
        content: enrichedContent,
        methodSummary,
      },
    });

    await syncPageObjectToDisk({
      projectId: params.projectId,
      projectName: params.projectName,
      modulePath,
      content: enrichedContent,
      overwrite: params.overwriteExisting,
    });

    upserted += 1;
  }

  return { upserted, skipped };
}
