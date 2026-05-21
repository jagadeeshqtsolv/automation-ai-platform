import type { TestCase } from "@automation-ai/shared";
import { testSpecPathForRequirement } from "@/lib/generate-mobilewright-bundle";
import { readFrameworkFile, writeFrameworkFiles } from "@/lib/local-framework/writer";
import { getProjectPlatformType } from "@/lib/project-platform";
import { ensureWebPageObjectsForTestCase } from "@/lib/ensure-web-page-objects-for-steps";
import { generateTestCaseBlock, type PageObjectForSteps } from "@/lib/steps-codegen";
import { removeTestCaseFromSpecContent } from "@/lib/test-plans/remove-test-from-spec";
import { specFileHeader } from "@/lib/test-framework";
import { prisma } from "@/lib/prisma";

function mergeTestIntoSpec(
  existing: string | null,
  testCase: TestCase,
  testBlock: string,
  header: string,
): string {
  const base =
    existing !== null && existing.trim().length > 0
      ? existing
      : header;
  const { content: without } = removeTestCaseFromSpecContent(base, testCase);
  const trimmed = without.trimEnd();
  return trimmed.length > 0 ? `${trimmed}\n\n${testBlock}\n` : `${header}${testBlock}\n`;
}

/**
 * Writes deterministic Playwright/Mobilewright code for one test case into the requirement spec file
 * and updates the latest generatedCode row for the plan.
 */
export async function syncTestCaseSpecFromSteps(params: {
  projectId: string;
  projectName: string;
  requirementTitle: string | null;
  testPlanId: string;
  testCase: TestCase;
  pageObjects: PageObjectForSteps[];
}): Promise<{ specPath: string; specContent: string; testBlock: string } | null> {
  const platform = await getProjectPlatformType(params.projectId);
  let pageObjects = params.pageObjects;
  if (platform === "web") {
    pageObjects = await ensureWebPageObjectsForTestCase({
      projectId: params.projectId,
      projectName: params.projectName,
      testCase: params.testCase,
      pageObjects: params.pageObjects,
    });
  }
  const header = specFileHeader(platform);
  const specPath = testSpecPathForRequirement(params.requirementTitle);
  const { block: testBlock } = generateTestCaseBlock(params.testCase, pageObjects, platform);

  const existing = await readFrameworkFile(params.projectId, specPath);
  const specContent = mergeTestIntoSpec(existing, params.testCase, testBlock, header);

  await writeFrameworkFiles({
    projectId: params.projectId,
    projectName: params.projectName,
    files: [{ relativePath: specPath, content: specContent }],
    overwritePageObjects: false,
    overwriteTests: true,
  });

  const latestCodegen = await prisma.generatedCode.findFirst({
    where: { testPlanId: params.testPlanId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (latestCodegen !== null) {
    await prisma.generatedCode.update({
      where: { id: latestCodegen.id },
      data: { typescript: specContent, model: "steps-sync" },
    });
  } else {
    await prisma.generatedCode.create({
      data: {
        testPlanId: params.testPlanId,
        typescript: specContent,
        model: "steps-sync",
      },
    });
  }

  return { specPath, specContent, testBlock };
}

export async function loadProjectPageObjectsForSteps(projectId: string): Promise<PageObjectForSteps[]> {
  const rows = await prisma.pageObject.findMany({
    where: { projectId },
    orderBy: { modulePath: "asc" },
    select: { className: true, screenName: true, content: true, methodSummary: true },
  });
  return rows;
}
