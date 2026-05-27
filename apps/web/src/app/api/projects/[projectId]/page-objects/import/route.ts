import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { upsertWebPageObjectContent } from "@/lib/upsert-web-page-object";
import { generateTestFixturesSource, TEST_FIXTURES_MODULE_PATH } from "@/lib/generate-test-fixtures";
import { writeFrameworkFiles } from "@/lib/local-framework/writer";
import { getProjectPlatformType } from "@/lib/project-platform";
import { resolveFrameworkFilePath } from "@/lib/local-framework/paths";

/** Returns current support/fixtures.ts content, or null if it doesn't exist. */
async function readCurrentFixtures(projectId: string): Promise<string | null> {
  const fixturePath = resolveFrameworkFilePath(projectId, TEST_FIXTURES_MODULE_PATH);
  if (fixturePath === null) return null;
  try {
    return await readFile(fixturePath, "utf8");
  } catch {
    return null;
  }
}

/** True when `className` already appears as an import in the fixtures file. */
function classInFixtures(fixturesContent: string, className: string): boolean {
  return fixturesContent.includes(`{ ${className} }`);
}

const pageObjectEntrySchema = z.object({
  className: z.string().min(1).max(200),
  modulePath: z.string().min(1).max(260),
  content: z.string().min(1).max(500_000),
});

const bundleSchema = z.object({
  version: z.number().optional(),
  pageObjects: z.array(pageObjectEntrySchema).min(1).max(100),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;

  const guard = await withAuthAndProject(projectId);
  if ("error" in guard) return guard.error;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const json: unknown = await req.json().catch(() => null);
  const parsed = bundleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid bundle. Expected { pageObjects: [{ className, modulePath, content }] }" },
      { status: 400 },
    );
  }

  let imported = 0;
  const errors: string[] = [];

  for (const entry of parsed.data.pageObjects) {
    const modulePath = entry.modulePath.replace(/^\.\//, "").replace(/\.\./g, "");
    if (!modulePath.startsWith("pageobjects/")) {
      errors.push(`${entry.className}: modulePath must start with pageobjects/`);
      continue;
    }
    try {
      await upsertWebPageObjectContent({
        projectId,
        projectName: project.name,
        modulePath,
        content: entry.content,
        className: entry.className,
        screenName: entry.className.replace(/Page$/i, "").replace(/Screen$/i, "") || null,
        userId: guard.user.id,
      });
      imported += 1;
    } catch (err) {
      errors.push(`${entry.className}: ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  // Regenerate support/fixtures.ts only if any imported class is missing from it
  if (imported > 0) {
    try {
      const currentFixtures = await readCurrentFixtures(projectId);
      const importedClassNames = parsed.data.pageObjects.map((e) => e.className);
      const needsUpdate =
        currentFixtures === null ||
        importedClassNames.some((cls) => !classInFixtures(currentFixtures, cls));

      if (needsUpdate) {
        const allPageObjects = await prisma.pageObject.findMany({
          where: { projectId },
          select: { className: true, modulePath: true },
          orderBy: { className: "asc" },
        });
        const platformType = await getProjectPlatformType(projectId);
        await writeFrameworkFiles({
          projectId,
          projectName: project.name,
          files: [
            {
              relativePath: TEST_FIXTURES_MODULE_PATH,
              content: generateTestFixturesSource(allPageObjects, platformType),
            },
          ],
          overwritePageObjects: false,
          overwriteTests: false,
        });
      }
    } catch {
      // Non-fatal — fixtures update failure should not fail the import response
    }
  }

  return NextResponse.json(
    { imported, errors: errors.length > 0 ? errors : undefined },
    { status: imported > 0 ? 201 : 400 },
  );
}
