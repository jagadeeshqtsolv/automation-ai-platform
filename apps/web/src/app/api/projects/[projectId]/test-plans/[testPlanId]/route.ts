import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { deleteTestPlanForProject } from "@/lib/test-plans/mutations";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  testPlanId: z.string().uuid(),
});

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ projectId: string; testPlanId: string }> },
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

  const result = await deleteTestPlanForProject(parsed.data.projectId, parsed.data.testPlanId);
  if (result === "not_found") {
    return NextResponse.json({ error: "Test plan not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: "plan" as const });
}
