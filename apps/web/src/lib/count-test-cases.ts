import { testPlanSchema } from "@jagadeeshqtsolv/core";

export function countTestCasesInPlanJson(planJson: string): number {
  let raw: unknown;
  try {
    raw = JSON.parse(planJson) as unknown;
  } catch {
    return 0;
  }
  const parsed = testPlanSchema.safeParse(raw);
  if (!parsed.success) {
    return 0;
  }
  return parsed.data.cases.length;
}

export function sumTestCasesByProjectId(
  plans: Array<{ json: string; requirement: { projectId: string } }>,
): { total: number; byProjectId: Map<string, number> } {
  const byProjectId = new Map<string, number>();
  let total = 0;

  for (const plan of plans) {
    const n = countTestCasesInPlanJson(plan.json);
    total += n;
    const projectId = plan.requirement.projectId;
    byProjectId.set(projectId, (byProjectId.get(projectId) ?? 0) + n);
  }

  return { total, byProjectId };
}
