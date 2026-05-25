import { NextResponse } from "next/server";
import { createTestCaseBodySchema } from "@automation-ai/core";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { addTestCaseToPlan } from "@/lib/test-plans/mutations";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  testPlanId: z.string().uuid(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string; testPlanId: string }> },
) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const json: unknown = await req.json().catch(() => null);
  const parsedBody = createTestCaseBodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsedParams.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const result = await addTestCaseToPlan(
    parsedParams.data.projectId,
    parsedParams.data.testPlanId,
    parsedBody.data.testCase,
  );

  if (result.status === "not_found") {
    return NextResponse.json({ error: "Test plan not found" }, { status: 404 });
  }
  if (result.status === "duplicate_id") {
    return NextResponse.json(
      { error: `Test case id "${result.existingId}" already exists in this plan` },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      planId: result.planId,
      testCase: result.testCase,
      stepCodegen: result.stepCodegen,
    },
    { status: 201 },
  );
}
