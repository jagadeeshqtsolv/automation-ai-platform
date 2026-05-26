import { NextResponse } from "next/server";
import { generatePlanBodySchema } from "@automation-ai/core";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { formatGenerationError } from "@/lib/format-generation-error";
import { generateTestPlanFromRequirement } from "@/lib/generate-test-plan";
import { aiGenerationErrorStatus } from "@/lib/ai-generation-error-status";
import { ZodError } from "zod";
import { syncTestPlanToDisk } from "@/lib/local-framework/sync-workspace-to-disk";
import { getProjectPlatformType } from "@/lib/project-platform";

const generatingProjects = new Set<string>();

export async function POST(req: Request) {
  const json: unknown = await req.json().catch(() => null);
  const parsed = generatePlanBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const requirement = await prisma.requirement.findUnique({
    where: { id: parsed.data.requirementId },
    select: {
      id: true,
      title: true,
      content: true,
      projectId: true,
      project: { select: { name: true, organizationId: true } },
    },
  });
  if (requirement === null) {
    return NextResponse.json({ error: "Requirement not found" }, { status: 404 });
  }

  const guard = await withAuthAndProject(requirement.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  if (generatingProjects.has(requirement.projectId)) {
    return NextResponse.json(
      { error: "A generation is already in progress for this project" },
      { status: 409 },
    );
  }

  const platformType = await getProjectPlatformType(requirement.projectId);

  generatingProjects.add(requirement.projectId);
  try {
    const { plan, model } = await generateTestPlanFromRequirement({
      requirementTitle: requirement.title,
      requirementContent: requirement.content,
      projectId: requirement.projectId,
      platform: platformType === "web" ? "web" : "mobile",
    });

    const saved = await prisma.testPlan.create({
      data: {
        requirementId: requirement.id,
        json: JSON.stringify(plan),
        model,
      },
      select: {
        id: true,
        requirementId: true,
        json: true,
        model: true,
        createdAt: true,
      },
    });

    await syncTestPlanToDisk({
      projectId: requirement.projectId,
      projectName: requirement.project.name,
      requirementId: requirement.id,
      plan: saved,
      userId: guard.user.id,
    });

    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const message = formatGenerationError(err);
    const status =
      err instanceof ZodError ? 422 : aiGenerationErrorStatus(message);
    return NextResponse.json({ error: message }, { status });
  } finally {
    generatingProjects.delete(requirement.projectId);
  }
}
