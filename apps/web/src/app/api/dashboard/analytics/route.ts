import { NextResponse } from "next/server";
import { requireApiUser, requireOrgAccess } from "@/lib/auth/api-auth";
import { listAccessibleProjectIds } from "@/lib/auth/access";
import { sumTestCasesByProjectId } from "@/lib/count-test-cases";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organizationId");
  if (organizationId === null || organizationId.length === 0) {
    return NextResponse.json({ error: "organizationId query parameter is required" }, { status: 400 });
  }

  const orgCheck = await requireOrgAccess(auth.id, organizationId);
  if (orgCheck instanceof NextResponse) {
    return orgCheck;
  }

  const projectIds = await listAccessibleProjectIds(auth.id, organizationId);
  if (projectIds.length === 0) {
    return NextResponse.json({
      totals: {
        projects: 0,
        requirements: 0,
        environments: 0,
        pageObjects: 0,
        testPlans: 0,
        testCases: 0,
        generatedCodes: 0,
      },
      projects: [],
    });
  }

  const [
    requirementCount,
    environmentCount,
    pageObjectCount,
    testPlanCount,
    generatedCodeCount,
    projects,
    testPlanRows,
  ] = await Promise.all([
    prisma.requirement.count({ where: { projectId: { in: projectIds } } }),
    prisma.environment.count({ where: { projectId: { in: projectIds } } }),
    prisma.pageObject.count({ where: { projectId: { in: projectIds } } }),
    prisma.testPlan.count({ where: { requirement: { projectId: { in: projectIds } } } }),
    prisma.generatedCode.count({
      where: { testPlan: { requirement: { projectId: { in: projectIds } } } },
    }),
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            requirements: true,
            environments: true,
            pageObjects: true,
          },
        },
      },
    }),
    prisma.testPlan.findMany({
      where: { requirement: { projectId: { in: projectIds } } },
      select: {
        json: true,
        requirement: { select: { projectId: true } },
      },
    }),
  ]);

  const { total: testCaseCount, byProjectId: testCasesByProjectId } = sumTestCasesByProjectId(testPlanRows);

  const projectsWithCounts = await Promise.all(
    projects.map(async (p) => {
      const [testPlans, generatedCodes] = await Promise.all([
        prisma.testPlan.count({ where: { requirement: { projectId: p.id } } }),
        prisma.generatedCode.count({
          where: { testPlan: { requirement: { projectId: p.id } } },
        }),
      ]);
      return {
        id: p.id,
        name: p.name,
        createdAt: p.createdAt.toISOString(),
        counts: {
          requirements: p._count.requirements,
          environments: p._count.environments,
          pageObjects: p._count.pageObjects,
          testPlans,
          testCases: testCasesByProjectId.get(p.id) ?? 0,
          generatedCodes,
        },
      };
    }),
  );

  return NextResponse.json({
    totals: {
      projects: projects.length,
      requirements: requirementCount,
      environments: environmentCount,
      pageObjects: pageObjectCount,
      testPlans: testPlanCount,
      testCases: testCaseCount,
      generatedCodes: generatedCodeCount,
    },
    projects: projectsWithCounts,
  });
}
