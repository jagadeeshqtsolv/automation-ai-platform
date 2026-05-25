import {
  EMPTY_REQUIREMENT_CONTENT_PLACEHOLDER,
  testPlanSchema,
  type TestPlan,
} from "@automation-ai/core";
import { prisma } from "@/lib/prisma";
import { syncRequirementToDisk, syncTestPlanToDisk } from "@/lib/local-framework/sync-workspace-to-disk";
import { deleteTestCaseDiskAsset, deleteTestPlanDiskAssets } from "@/lib/test-plans/disk-assets";
import { archiveTestCaseFromSpecs } from "@/lib/test-plans/remove-test-from-spec";
import {
  loadProjectPageObjectsForSteps,
  syncTestCaseSpecFromSteps,
} from "@/lib/test-plans/sync-test-case-spec";
import { generateTestCaseStepCodes } from "@/lib/steps-codegen";
import { getProjectPlatformType } from "@/lib/project-platform";

export type TestPlanWithRequirement = {
  id: string;
  json: string;
  model: string;
  createdAt: Date;
  requirement: {
    id: string;
    title: string | null;
    projectId: string;
    project: { name: string };
  };
};

export async function getTestPlanForProject(
  projectId: string,
  testPlanId: string,
): Promise<TestPlanWithRequirement | null> {
  return prisma.testPlan.findFirst({
    where: { id: testPlanId, requirement: { projectId } },
    select: {
      id: true,
      json: true,
      model: true,
      createdAt: true,
      requirement: {
        select: {
          id: true,
          title: true,
          projectId: true,
          project: { select: { name: true } },
        },
      },
    },
  });
}

export function parseStoredTestPlan(json: string): TestPlan | null {
  try {
    const raw: unknown = JSON.parse(json) as unknown;
    const result = testPlanSchema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function deleteTestPlanForProject(
  projectId: string,
  testPlanId: string,
): Promise<"deleted" | "not_found"> {
  const row = await getTestPlanForProject(projectId, testPlanId);
  if (row === null) {
    return "not_found";
  }

  const plan = parseStoredTestPlan(row.json);
  if (plan !== null) {
    for (const testCase of plan.cases) {
      await archiveTestCaseFromSpecs({
        projectId,
        projectName: row.requirement.project.name,
        testCase,
      });
    }
  }

  await prisma.testPlan.delete({ where: { id: row.id } });
  await deleteTestPlanDiskAssets(projectId, row.id);
  return "deleted";
}

export type RemoveTestCaseResult =
  | { status: "not_found" }
  | { status: "case_not_found" }
  | { status: "case_removed"; planId: string; remainingCases: number };

export async function removeTestCaseFromPlan(
  projectId: string,
  testPlanId: string,
  testCaseId: string,
): Promise<RemoveTestCaseResult> {
  const row = await getTestPlanForProject(projectId, testPlanId);
  if (row === null) {
    return { status: "not_found" };
  }

  const plan = parseStoredTestPlan(row.json);
  if (plan === null) {
    return { status: "case_not_found" };
  }

  const removedCase = plan.cases.find((c) => c.id === testCaseId);
  if (removedCase === undefined) {
    return { status: "case_not_found" };
  }

  const nextCases = plan.cases.filter((c) => c.id !== testCaseId);
  const updated: TestPlan = { ...plan, cases: nextCases };
  const validated = testPlanSchema.parse(updated);

  await prisma.testPlan.update({
    where: { id: row.id },
    data: { json: JSON.stringify(validated) },
  });

  await deleteTestCaseDiskAsset(projectId, row.id, testCaseId);

  await archiveTestCaseFromSpecs({
    projectId,
    projectName: row.requirement.project.name,
    testCase: removedCase,
  });

  await syncTestPlanToDisk({
    projectId,
    projectName: row.requirement.project.name,
    requirementId: row.requirement.id,
    plan: {
      id: row.id,
      json: JSON.stringify(validated),
      model: row.model,
      createdAt: row.createdAt,
    },
  });

  return { status: "case_removed", planId: row.id, remainingCases: nextCases.length };
}

export type UpdateTestCaseResult =
  | { status: "not_found" }
  | { status: "case_not_found" }
  | {
      status: "updated";
      planId: string;
      testCase: TestPlan["cases"][number];
      stepCodegen: { stepLines: string[]; testBlock: string };
    };

export async function updateTestCaseInPlan(
  projectId: string,
  testPlanId: string,
  testCaseId: string,
  testCase: TestPlan["cases"][number],
): Promise<UpdateTestCaseResult> {
  if (testCase.id !== testCaseId) {
    return { status: "case_not_found" };
  }

  const row = await getTestPlanForProject(projectId, testPlanId);
  if (row === null) {
    return { status: "not_found" };
  }

  const plan = parseStoredTestPlan(row.json);
  if (plan === null) {
    return { status: "case_not_found" };
  }

  const index = plan.cases.findIndex((c) => c.id === testCaseId);
  if (index < 0) {
    return { status: "case_not_found" };
  }

  const nextCases = [...plan.cases];
  nextCases[index] = testCase;
  const updated: TestPlan = { ...plan, cases: nextCases };
  const validated = testPlanSchema.parse(updated);

  await prisma.testPlan.update({
    where: { id: row.id },
    data: { json: JSON.stringify(validated) },
  });

  await syncTestPlanToDisk({
    projectId,
    projectName: row.requirement.project.name,
    requirementId: row.requirement.id,
    plan: {
      id: row.id,
      json: JSON.stringify(validated),
      model: row.model,
      createdAt: row.createdAt,
    },
  });

  const saved = validated.cases.find((c) => c.id === testCaseId);
  if (saved === undefined) {
    return { status: "case_not_found" };
  }

  const platform = await getProjectPlatformType(projectId);
  const pageObjects = await loadProjectPageObjectsForSteps(projectId);
  const { stepLines } = generateTestCaseStepCodes(saved, pageObjects, platform);
  let testBlock = "";
  try {
    const synced = await syncTestCaseSpecFromSteps({
      projectId,
      projectName: row.requirement.project.name,
      requirementTitle: row.requirement.title,
      testPlanId: row.id,
      testCase: saved,
      pageObjects,
    });
    if (synced !== null) {
      testBlock = synced.testBlock;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[test-plan] sync spec from steps failed: ${message}`);
  }

  return {
    status: "updated",
    planId: row.id,
    testCase: saved,
    stepCodegen: { stepLines, testBlock },
  };
}

export type AddTestCaseResult =
  | { status: "not_found" }
  | { status: "duplicate_id"; existingId: string }
  | {
      status: "created";
      planId: string;
      testCase: TestPlan["cases"][number];
      stepCodegen: { stepLines: string[]; testBlock: string };
    };

export async function addTestCaseToPlan(
  projectId: string,
  testPlanId: string,
  testCase: TestPlan["cases"][number],
): Promise<AddTestCaseResult> {
  const row = await getTestPlanForProject(projectId, testPlanId);
  if (row === null) {
    return { status: "not_found" };
  }

  const plan = parseStoredTestPlan(row.json);
  if (plan === null) {
    return { status: "not_found" };
  }

  if (plan.cases.some((c) => c.id === testCase.id)) {
    return { status: "duplicate_id", existingId: testCase.id };
  }

  const updated: TestPlan = { ...plan, cases: [...plan.cases, testCase] };
  const validated = testPlanSchema.parse(updated);

  await prisma.testPlan.update({
    where: { id: row.id },
    data: { json: JSON.stringify(validated) },
  });

  await syncTestPlanToDisk({
    projectId,
    projectName: row.requirement.project.name,
    requirementId: row.requirement.id,
    plan: {
      id: row.id,
      json: JSON.stringify(validated),
      model: row.model,
      createdAt: row.createdAt,
    },
  });

  const saved = validated.cases.find((c) => c.id === testCase.id);
  if (saved === undefined) {
    return { status: "not_found" };
  }

  const platform = await getProjectPlatformType(projectId);
  const pageObjects = await loadProjectPageObjectsForSteps(projectId);
  const { stepLines } = generateTestCaseStepCodes(saved, pageObjects, platform);
  let testBlock = "";
  try {
    const synced = await syncTestCaseSpecFromSteps({
      projectId,
      projectName: row.requirement.project.name,
      requirementTitle: row.requirement.title,
      testPlanId: row.id,
      testCase: saved,
      pageObjects,
    });
    if (synced !== null) {
      testBlock = synced.testBlock;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[test-plan] sync spec from steps failed: ${message}`);
  }

  return {
    status: "created",
    planId: row.id,
    testCase: saved,
    stepCodegen: { stepLines, testBlock },
  };
}

export type CreateTestPlanResult =
  | { status: "project_not_found" }
  | { status: "requirement_not_found" }
  | { status: "created"; planId: string; suiteName: string; requirementId: string };

export async function createTestPlanForProject(params: {
  projectId: string;
  suiteName: string;
  requirementId?: string;
  requirementTitle?: string;
  requirementContent?: string;
}): Promise<CreateTestPlanResult> {
  const project = await prisma.project.findFirst({
    where: { id: params.projectId },
    select: { name: true },
  });
  if (project === null) {
    return { status: "project_not_found" };
  }

  let requirementId: string;

  if (params.requirementId !== undefined) {
    const existing = await prisma.requirement.findFirst({
      where: { id: params.requirementId, projectId: params.projectId },
      select: { id: true },
    });
    if (existing === null) {
      return { status: "requirement_not_found" };
    }
    requirementId = existing.id;
  } else {
    const titleRaw = params.requirementTitle?.trim() ?? "";
    const contentRaw = params.requirementContent?.trim() ?? "";
    const requirement = await prisma.requirement.create({
      data: {
        projectId: params.projectId,
        title: titleRaw.length > 0 ? titleRaw : null,
        content: contentRaw.length > 0 ? contentRaw : EMPTY_REQUIREMENT_CONTENT_PLACEHOLDER,
      },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
      },
    });
    requirementId = requirement.id;
    await syncRequirementToDisk({
      projectId: params.projectId,
      projectName: project.name,
      requirement,
    });
  }

  const suiteName = params.suiteName.trim();
  const plan: TestPlan = {
    version: 1,
    suiteName,
    cases: [],
  };
  const validated = testPlanSchema.parse(plan);

  const saved = await prisma.testPlan.create({
    data: {
      requirementId,
      json: JSON.stringify(validated),
      model: "manual",
    },
    select: {
      id: true,
      json: true,
      model: true,
      createdAt: true,
    },
  });

  await syncTestPlanToDisk({
    projectId: params.projectId,
    projectName: project.name,
    requirementId,
    plan: saved,
  });

  return {
    status: "created",
    planId: saved.id,
    suiteName: validated.suiteName,
    requirementId,
  };
}
