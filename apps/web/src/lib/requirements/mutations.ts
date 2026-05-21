import type { TestCase } from "@automation-ai/shared";
import { prisma } from "@/lib/prisma";
import { deleteFrameworkFile } from "@/lib/local-framework/delete-project";
import { testSpecPathForRequirement } from "@/lib/generate-mobilewright-bundle";
import { readFrameworkFile, writeFrameworkFiles } from "@/lib/local-framework/writer";
import { parseStoredTestPlan } from "@/lib/test-plans/mutations";
import { deleteTestPlanDiskAssets } from "@/lib/test-plans/disk-assets";
import { archiveTestCaseFromSpecs } from "@/lib/test-plans/remove-test-from-spec";

const DELETED_TESTS_DIR = "tests/deleted";

function safeRequirementArchiveName(requirementId: string): string {
  const cleaned = requirementId.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^-+|-+$/g, "").slice(0, 80);
  return cleaned.length > 0 ? cleaned : "requirement";
}

async function archiveRequirementSpecFile(params: {
  projectId: string;
  projectName: string;
  requirementId: string;
  requirementTitle: string | null;
}): Promise<void> {
  const specPath = testSpecPathForRequirement(params.requirementTitle);
  const existing = await readFrameworkFile(params.projectId, specPath);
  if (existing === null) {
    return;
  }

  const archivePath = `${DELETED_TESTS_DIR}/requirement-${safeRequirementArchiveName(params.requirementId)}.spec.ts`;
  const content = [`// Archived requirement spec (was ${specPath})`, existing].join("\n").trimEnd();

  await writeFrameworkFiles({
    projectId: params.projectId,
    projectName: params.projectName,
    files: [{ relativePath: archivePath, content: `${content}\n` }],
    overwritePageObjects: false,
    overwriteTests: true,
  });

  await deleteFrameworkFile(params.projectId, specPath);
}

function collectUniqueCasesFromPlans(
  plans: Array<{ json: string }>,
): TestCase[] {
  const byId = new Map<string, TestCase>();
  for (const plan of plans) {
    const parsed = parseStoredTestPlan(plan.json);
    if (parsed === null) {
      continue;
    }
    for (const testCase of parsed.cases) {
      byId.set(testCase.id, testCase);
    }
  }
  return Array.from(byId.values());
}

export async function deleteRequirementForProject(
  projectId: string,
  requirementId: string,
): Promise<"deleted" | "not_found"> {
  const row = await prisma.requirement.findFirst({
    where: { id: requirementId, projectId },
    select: {
      id: true,
      title: true,
      project: { select: { name: true } },
      testPlans: { select: { id: true, json: true } },
    },
  });

  if (row === null) {
    return "not_found";
  }

  const cases = collectUniqueCasesFromPlans(row.testPlans);
  for (const testCase of cases) {
    await archiveTestCaseFromSpecs({
      projectId,
      projectName: row.project.name,
      testCase,
    });
  }

  await archiveRequirementSpecFile({
    projectId,
    projectName: row.project.name,
    requirementId: row.id,
    requirementTitle: row.title,
  });

  for (const plan of row.testPlans) {
    await deleteTestPlanDiskAssets(projectId, plan.id);
  }

  await deleteFrameworkFile(projectId, `requirements/${row.id}.json`);

  await prisma.requirement.delete({ where: { id: row.id } });

  return "deleted";
}
