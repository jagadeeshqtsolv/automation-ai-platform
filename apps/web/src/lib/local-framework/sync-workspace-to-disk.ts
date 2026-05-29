import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { testPlanSchema, type TestPlan } from "@jagadeeshqtsolv/core";
import { prisma } from "@/lib/prisma";
import { ensureProjectFrameworkScaffold } from "@/lib/local-framework/ensure-project-scaffold";
import { getProjectPlatformType } from "@/lib/project-platform";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { recordUserFiles } from "@/lib/local-framework/user-file-tracker";

function safeFileSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 120) : "item";
}

async function writeFrameworkJson(projectId: string, relativePath: string, data: unknown): Promise<void> {
  const abs = resolveFrameworkFilePath(projectId, relativePath);
  if (abs === null) return;
  await mkdir(path.dirname(abs), { recursive: true });
  const body = `${JSON.stringify(data, null, 2)}\n`;
  await writeFile(abs, body, "utf8");
}

export async function syncRequirementToDisk(params: {
  projectId: string;
  projectName: string;
  requirement: {
    id: string;
    title: string | null;
    content: string;
    createdAt: Date;
  };
  userId?: string;
}): Promise<void> {
  const platformType = await getProjectPlatformType(params.projectId);
  await ensureProjectFrameworkScaffold({
    projectId: params.projectId,
    projectName: params.projectName,
    platformType,
  });
  const relPath = `requirements/${params.requirement.id}.json`;
  await writeFrameworkJson(params.projectId, relPath, {
    id: params.requirement.id,
    title: params.requirement.title,
    content: params.requirement.content,
    createdAt: params.requirement.createdAt.toISOString(),
  });
  if (params.userId) {
    await recordUserFiles(params.projectId, platformType, params.userId, [relPath]).catch(() => {});
  }
}

export async function syncTestPlanToDisk(params: {
  projectId: string;
  projectName: string;
  requirementId: string;
  plan: {
    id: string;
    json: string;
    model: string;
    createdAt: Date;
  };
  userId?: string;
}): Promise<void> {
  const platformType = await getProjectPlatformType(params.projectId);
  await ensureProjectFrameworkScaffold({
    projectId: params.projectId,
    projectName: params.projectName,
    platformType,
  });

  let parsedPlan: TestPlan | null = null;
  try {
    const raw: unknown = JSON.parse(params.plan.json) as unknown;
    const result = testPlanSchema.safeParse(raw);
    if (result.success) parsedPlan = result.data;
  } catch {
    parsedPlan = null;
  }

  const written: string[] = [];

  const planPath = `test-plans/${params.plan.id}.json`;
  await writeFrameworkJson(params.projectId, planPath, {
    id: params.plan.id,
    requirementId: params.requirementId,
    model: params.plan.model,
    createdAt: params.plan.createdAt.toISOString(),
    plan: parsedPlan ?? params.plan.json,
  });
  written.push(planPath);

  if (parsedPlan !== null) {
    for (const testCase of parsedPlan.cases) {
      const caseFileId = `${params.plan.id}__${safeFileSegment(testCase.id)}`;
      const casePath = `test-cases/${caseFileId}.json`;
      await writeFrameworkJson(params.projectId, casePath, {
        id: testCase.id,
        testPlanId: params.plan.id,
        requirementId: params.requirementId,
        suiteName: parsedPlan.suiteName,
        case: testCase,
      });
      written.push(casePath);
    }
  }

  if (params.userId && written.length > 0) {
    await recordUserFiles(params.projectId, platformType, params.userId, written).catch(() => {});
  }
}

/** Sync all requirements, test plans, and test cases for a project to frameworks/<id>/. */
export async function syncProjectWorkspaceToDisk(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      name: true,
      requirements: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          title: true,
          content: true,
          createdAt: true,
          testPlans: {
            orderBy: { createdAt: "asc" },
            select: { id: true, json: true, model: true, createdAt: true },
          },
        },
      },
    },
  });
  if (project === null) return;

  const platformType = await getProjectPlatformType(projectId);
  await ensureProjectFrameworkScaffold({
    projectId,
    projectName: project.name,
    platformType,
  });

  const root = getProjectFrameworkRoot(projectId, platformType);
  await mkdir(path.join(root, "requirements"), { recursive: true });
  await mkdir(path.join(root, "test-plans"), { recursive: true });
  await mkdir(path.join(root, "test-cases"), { recursive: true });

  for (const req of project.requirements) {
    await syncRequirementToDisk({
      projectId,
      projectName: project.name,
      requirement: req,
    });
    for (const plan of req.testPlans) {
      await syncTestPlanToDisk({
        projectId,
        projectName: project.name,
        requirementId: req.id,
        plan,
      });
    }
  }
}
