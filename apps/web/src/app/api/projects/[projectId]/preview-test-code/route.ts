import { NextResponse } from "next/server";
import { testCaseSchema } from "@jagadeeshqtsolv/core";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { buildPageObjectStepIndex } from "@/lib/page-object-step-index";
import { ensureWebPageObjectsForTestCase } from "@/lib/ensure-web-page-objects-for-steps";
import { generateTestCaseBlock, generateTestCaseStepCodes } from "@/lib/steps-codegen";
import { getProjectPlatformType } from "@/lib/project-platform";
import { loadProjectPageObjectsForSteps } from "@/lib/test-plans/sync-test-case-spec";

const bodySchema = z.object({
  testCase: testCaseSchema,
});

export async function POST(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = await context.params;
  const projectId = z.string().uuid().safeParse(params.projectId);
  if (!projectId.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const guard = await withAuthAndProject(projectId.data);
  if ("error" in guard) {
    return guard.error;
  }

  const json: unknown = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const platform = await getProjectPlatformType(projectId.data);
  let pageObjects = await loadProjectPageObjectsForSteps(projectId.data);
  if (platform === "web") {
    pageObjects = await ensureWebPageObjectsForTestCase({
      projectId: projectId.data,
      projectName: "project",
      testCase: parsed.data.testCase,
      pageObjects,
      persist: false,
    });
  }
  const { stepLines, stepInnerLines } = generateTestCaseStepCodes(
    parsed.data.testCase,
    pageObjects,
    platform,
  );
  const { block: testBlock } = generateTestCaseBlock(parsed.data.testCase, pageObjects, platform);

  const index = buildPageObjectStepIndex(pageObjects, { platform });
  return NextResponse.json({
    stepLines,
    stepInnerLines,
    testBlock,
    pageObjects: index.map((p) => ({
      className: p.className,
      screenName: p.screenName,
      fixtureName: p.fixtureName,
      methods: Array.from(p.methods).sort(),
    })),
  });
}
