import { NextResponse } from "next/server";
import { updateTestCaseBodySchema } from "@automation-ai/shared";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { removeTestCaseFromPlan, updateTestCaseInPlan } from "@/lib/test-plans/mutations";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  testPlanId: z.string().uuid(),
  testCaseId: z.string().min(1).max(200),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ projectId: string; testPlanId: string; testCaseId: string }> },
) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const json: unknown = await req.json().catch(() => null);
  const parsedBody = updateTestCaseBodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (parsedBody.data.testCase.id !== parsedParams.data.testCaseId) {
    return NextResponse.json({ error: "Test case id in body must match URL" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsedParams.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const result = await updateTestCaseInPlan(
    parsedParams.data.projectId,
    parsedParams.data.testPlanId,
    parsedParams.data.testCaseId,
    parsedBody.data.testCase,
  );

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Test plan not found" }, { status: 404 });
  }
  if (result.status === "case_not_found") {
    return NextResponse.json({ error: "Test case not found in this plan" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    planId: result.planId,
    testCase: result.testCase,
    stepCodegen: result.stepCodegen,
  });
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ projectId: string; testPlanId: string; testCaseId: string }> },
) {
  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsed.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const result = await removeTestCaseFromPlan(
    parsed.data.projectId,
    parsed.data.testPlanId,
    parsed.data.testCaseId,
  );

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Test plan not found" }, { status: 404 });
  }
  if (result.status === "case_not_found") {
    return NextResponse.json({ error: "Test case not found in this plan" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    deleted: "case" as const,
    planId: result.planId,
    remainingCases: result.remainingCases,
  });
}
