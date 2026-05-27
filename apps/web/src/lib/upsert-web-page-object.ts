import { prisma } from "@/lib/prisma";
import { syncPageObjectToDisk } from "@/lib/local-framework/writer";
import { appendWebFlowMethodsToMethodSummary, enrichWebPageObjectWithFlowMethods } from "@/lib/enrich-web-page-object-flows";
import { sanitizeWebPageObjectFileContent } from "@/lib/sanitize-web-page-object";
import { inferMethodSummary } from "@/lib/page-object-utils";
import { normalizePageObjectFile } from "@/lib/page-object-naming";

export async function upsertWebPageObjectContent(params: {
  projectId: string;
  projectName: string;
  modulePath: string;
  content: string;
  className: string;
  screenName: string | null;
  /** When set, the written file is attributed to this user for git change-tracking. */
  userId?: string;
}): Promise<void> {
  const normalized = normalizePageObjectFile({
    path: params.modulePath,
    content: params.content,
    className: params.className,
    screenName: params.screenName ?? undefined,
  });

  const enrichedContent = sanitizeWebPageObjectFileContent(
    enrichWebPageObjectWithFlowMethods(normalized.content),
    normalized.className,
  );
  const methodSummary = appendWebFlowMethodsToMethodSummary(
    inferMethodSummary(enrichedContent),
    enrichedContent,
  );

  await prisma.pageObject.upsert({
    where: {
      projectId_modulePath: { projectId: params.projectId, modulePath: normalized.path },
    },
    create: {
      projectId: params.projectId,
      modulePath: normalized.path,
      className: normalized.className,
      screenName: params.screenName,
      content: enrichedContent,
      methodSummary,
    },
    update: {
      className: normalized.className,
      screenName: params.screenName,
      content: enrichedContent,
      methodSummary,
    },
  });

  await syncPageObjectToDisk({
    projectId: params.projectId,
    projectName: params.projectName,
    modulePath: normalized.path,
    content: enrichedContent,
    overwrite: true,
    userId: params.userId,
  });
}
