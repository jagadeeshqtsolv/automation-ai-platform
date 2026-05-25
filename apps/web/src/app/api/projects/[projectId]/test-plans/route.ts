import { NextResponse } from "next/server";
import { createTestPlanBodySchema } from "@automation-ai/core";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { createTestPlanForProject } from "@/lib/test-plans/mutations";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const json: unknown = await req.json().catch(() => null);
  const parsedBody = createTestPlanBodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsedParams.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const result = await createTestPlanForProject({
    projectId: parsedParams.data.projectId,
    suiteName: parsedBody.data.suiteName,
    requirementId: parsedBody.data.requirementId,
    requirementTitle: parsedBody.data.requirementTitle,
    requirementContent: parsedBody.data.requirementContent,
  });

  if (result.status === "project_not_found") {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (result.status === "requirement_not_found") {
    return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      planId: result.planId,
      suiteName: result.suiteName,
      requirementId: result.requirementId,
    },
    { status: 201 },
  );
}
