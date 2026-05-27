import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { generateCodeBodySchema, testPlanSchema } from "@automation-ai/core";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import {
  flattenPomBundleForStorage,
  type EnvironmentLibraryEntry,
  type PageObjectLibraryEntry,
} from "@/lib/generate-mobilewright-bundle";
import {
  aggregateRequirementTestPlan,
  generatePlaywrightWebPomBundle,
} from "@/lib/generate-playwright-web-bundle";
import { upsertPageObjectFilesFromPomBundle } from "@/lib/persist-page-objects";
import { writeFrameworkFiles, readFrameworkFile } from "@/lib/local-framework/writer";
import { removeTestCaseFromSpecContent, findTestBlockStarts, findTestBlockEnd } from "@/lib/test-plans/remove-test-from-spec";
import { syncProjectWorkspaceToDisk } from "@/lib/local-framework/sync-workspace-to-disk";
import { generateTestFixturesSource, TEST_FIXTURES_MODULE_PATH } from "@/lib/generate-test-fixtures";
import { aiGenerationErrorStatus } from "@/lib/ai-generation-error-status";
import { getProjectPlatformType } from "@/lib/project-platform";
import { resolveFrameworkFilePath } from "@/lib/local-framework/paths";

const generatingProjects = new Set<string>();

function parseStoredPlans(rows: Array<{ json: string }>) {
  const plans = [];
  for (const row of rows) {
    let raw: unknown;
    try {
      raw = JSON.parse(row.json) as unknown;
    } catch {
      continue;
    }
    const parsed = testPlanSchema.safeParse(raw);
    if (parsed.success) {
      plans.push(parsed.data);
    }
  }
  return plans;
}

export async function POST(req: Request) {
  const json: unknown = await req.json().catch(() => null);
  const parsed = generateCodeBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const testPlanRow = await prisma.testPlan.findUnique({
    where: { id: parsed.data.testPlanId },
    select: {
      id: true,
      requirement: {
        select: {
          title: true,
          projectId: true,
          project: { select: { name: true, organizationId: true } },
          testPlans: { select: { json: true } },
        },
      },
    },
  });
  if (testPlanRow === null) {
    return NextResponse.json({ error: "Test plan not found" }, { status: 404 });
  }

  const projectId = testPlanRow.requirement.projectId;
  const guard = await withAuthAndProject(projectId);
  if ("error" in guard) {
    return guard.error;
  }

  if (generatingProjects.has(projectId)) {
    return NextResponse.json(
      { error: "A generation is already in progress for this project" },
      { status: 409 },
    );
  }

  const platform = await getProjectPlatformType(projectId);
  if (platform !== "web") {
    return NextResponse.json(
      { error: "This project uses Mobilewright (mobile). Use mobile codegen from Test plans." },
      { status: 400 },
    );
  }

  const requirementTitle = testPlanRow.requirement.title;
  const projectName = testPlanRow.requirement.project.name;
  const singleCaseId = parsed.data.testCaseId;

  let planForGeneration: ReturnType<typeof aggregateRequirementTestPlan>;
  try {
    const storedPlans = parseStoredPlans(testPlanRow.requirement.testPlans);
    planForGeneration = aggregateRequirementTestPlan(storedPlans, requirementTitle);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not build requirement test plan";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (singleCaseId !== undefined) {
    const found = planForGeneration.cases.some((c) => c.id === singleCaseId);
    if (!found) {
      return NextResponse.json({ error: "Test case not found in requirement" }, { status: 404 });
    }
  }

  const pages = await prisma.pageObject.findMany({
    where: { projectId },
    orderBy: { modulePath: "asc" },
    select: { modulePath: true, className: true, content: true, methodSummary: true, screenName: true },
  });

  const pageObjects: PageObjectLibraryEntry[] = pages.map((p) => ({
    modulePath: p.modulePath,
    className: p.className,
    content: p.content,
    methodSummary: p.methodSummary,
    screenName: p.screenName,
  }));

  let environment: EnvironmentLibraryEntry | null = null;
  let environmentDisk: { slug: string; configJson: string } | null = null;
  if (parsed.data.environmentId !== undefined) {
    const env = await prisma.environment.findFirst({
      where: { id: parsed.data.environmentId, projectId },
      select: { name: true, slug: true, configJson: true },
    });
    if (env === null) {
      return NextResponse.json({ error: "Environment not found" }, { status: 404 });
    }
    environment = { name: env.name, slug: env.slug, configJson: env.configJson };
    environmentDisk = { slug: env.slug, configJson: env.configJson };
  }

  const testDataPath = resolveFrameworkFilePath(projectId, "testdata/test-data.json");
  const currentTestData = testDataPath !== null
    ? await readFile(testDataPath, "utf8").catch(() => "{}")
    : "{}";

  generatingProjects.add(projectId);
  try {
    const { bundle, model } = await generatePlaywrightWebPomBundle({
      plan: planForGeneration,
      pageObjects,
      environment,
      requirementTitle,
      projectId: testPlanRow.requirement.projectId,
      scope: singleCaseId !== undefined ? "single-case" : "full-plan",
      focusTestCaseId: singleCaseId,
      currentTestData,
    });

    if (bundle.pageObjectFiles.length > 0) {
      await upsertPageObjectFilesFromPomBundle({
        projectId,
        projectName,
        bundle,
        overwriteExisting: parsed.data.overwriteExistingPageObjects,
      });
    }

    const diskFiles: Array<{ relativePath: string; content: string }> = [];
    const seen = new Set<string>();

    for (const f of bundle.pageObjectFiles) {
      const rel = f.path.trim().replace(/^\.\//, "");
      if (!seen.has(rel)) {
        seen.add(rel);
        diskFiles.push({ relativePath: rel, content: f.content });
      }
    }

    for (const p of pages) {
      if (!seen.has(p.modulePath)) {
        seen.add(p.modulePath);
        diskFiles.push({ relativePath: p.modulePath, content: p.content });
      }
    }

    for (const f of bundle.testFiles) {
      const rel = f.path
        .trim()
        .replace(/^\.\//, "")
        .replace(/^tests\/generated\//, "tests/");

      if (singleCaseId !== undefined) {
        const testCase = planForGeneration.cases.find((c) => c.id === singleCaseId);
        if (testCase !== undefined) {
          const existing = await readFrameworkFile(projectId, rel);
          if (existing !== null && existing.trim().length > 0) {
            // Extract the test() block from the AI-generated single-case output
            const starts = findTestBlockStarts(f.content);
            let newBlock = f.content.trimEnd();
            if (starts.length > 0) {
              const blockEnd = findTestBlockEnd(f.content, starts[0]!);
              newBlock = blockEnd > 0
                ? f.content.slice(starts[0]!, blockEnd).trimEnd()
                : f.content.slice(starts[0]!).trimEnd();
            }
            // Remove old version of this test from existing file, then append new block
            const { content: without } = removeTestCaseFromSpecContent(existing, testCase);
            const trimmed = without.trimEnd();
            const merged = trimmed.length > 0
              ? `${trimmed}\n\n${newBlock}\n`
              : `import { test, expect } from '../support/fixtures';\n\n${newBlock}\n`;
            diskFiles.push({ relativePath: rel, content: merged });
            continue;
          }
          // No existing spec — write full AI content (imports + test block)
        }
      }

      diskFiles.push({ relativePath: rel, content: f.content });
    }

    if (bundle.testDataFile !== undefined) {
      const tdRel = bundle.testDataFile.path.trim().replace(/^\.\//, "");
      if (!seen.has(tdRel)) {
        seen.add(tdRel);
        diskFiles.push({ relativePath: tdRel, content: bundle.testDataFile.content });
      }
    }

    const fixturePageRows: Array<{ className: string; modulePath: string }> = [
      ...pages.map((p) => ({ className: p.className, modulePath: p.modulePath })),
    ];
    for (const f of bundle.pageObjectFiles) {
      const exported = /export\s+class\s+(\w+)/.exec(f.content);
      const className = exported?.[1] ?? f.path.split("/").pop()?.replace(/\.ts$/i, "") ?? "";
      if (className.length === 0) continue;
      fixturePageRows.push({ className, modulePath: f.path.trim().replace(/^\.\//, "") });
    }
    if (!seen.has(TEST_FIXTURES_MODULE_PATH)) {
      seen.add(TEST_FIXTURES_MODULE_PATH);
      diskFiles.push({
        relativePath: TEST_FIXTURES_MODULE_PATH,
        content: generateTestFixturesSource(fixturePageRows, "web"),
      });
    }

    await syncProjectWorkspaceToDisk(projectId);

    const framework = await writeFrameworkFiles({
      projectId,
      projectName,
      files: diskFiles,
      overwritePageObjects: true,
      overwriteTests: true,
      environment: environmentDisk,
      userId: guard.user.id,
    });

    const combined = flattenPomBundleForStorage(bundle);

    const saved = await prisma.generatedCode.create({
      data: {
        testPlanId: testPlanRow.id,
        environmentId: parsed.data.environmentId ?? null,
        typescript: combined,
        model,
      },
      select: {
        id: true,
        testPlanId: true,
        typescript: true,
        model: true,
        createdAt: true,
        environmentId: true,
        environment: { select: { id: true, name: true, slug: true } },
      },
    });

    return NextResponse.json(
      {
        ...saved,
        pageObjectFiles: bundle.pageObjectFiles,
        testFiles: bundle.testFiles,
        framework,
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const status = aiGenerationErrorStatus(message);
    return NextResponse.json({ error: message }, { status });
  } finally {
    generatingProjects.delete(projectId);
  }
}
