import { NextResponse } from "next/server";
import { z } from "zod";
import JSZip from "jszip";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { upsertWebPageObjectContent } from "@/lib/upsert-web-page-object";
import { generateTestFixturesSource, TEST_FIXTURES_MODULE_PATH } from "@/lib/generate-test-fixtures";
import { writeFrameworkFiles } from "@/lib/local-framework/writer";
import { getProjectPlatformType } from "@/lib/project-platform";
import { syncRequirementToDisk } from "@/lib/local-framework/sync-workspace-to-disk";
import { createTestPlanForProject } from "@/lib/test-plans/mutations";

const paramsSchema = z.object({ projectId: z.string().uuid() });

const requirementSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(100_000),
});

const testCaseSchema = z.object({
  title: z.string().min(1).max(500),
  steps: z.array(z.object({
    action: z.string(),
    description: z.string().optional(),
    page: z.string().optional(),
    locatorHint: z.string().optional(),
    value: z.string().optional(),
    assertion: z.string().optional(),
  })).optional().default([]),
  platforms: z.array(z.string()).optional().default(["chrome"]),
  tags: z.array(z.string()).optional().default([]),
});

const testPlanSchema = z.object({
  title: z.string().min(1).max(500),
  cases: z.array(testCaseSchema).optional().default([]),
});

export type SmartImportPreview = {
  pageObjects: { className: string; modulePath: string }[];
  requirements: { title: string }[];
  testPlans: { title: string; caseCount: number }[];
  specFiles: { path: string }[];
};

export type SmartImportResult = {
  pageObjects: { imported: number; errors: string[] };
  requirements: { imported: number; errors: string[] };
  testPlans: { imported: number; errors: string[] };
  specFiles: { imported: number; errors: string[] };
};

async function extractZip(buffer: ArrayBuffer): Promise<JSZip> {
  const zip = new JSZip();
  await zip.loadAsync(buffer);
  return zip;
}

function fileText(zip: JSZip, path: string): Promise<string> {
  return zip.file(path)!.async("string");
}

function zipFiles(zip: JSZip, folder: string): JSZip.JSZipObject[] {
  return Object.values(zip.files).filter(
    (f) => !f.dir && f.name.startsWith(`${folder}/`) && !f.name.split("/").pop()!.startsWith("."),
  );
}

export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const raw = await context.params;
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  const { projectId } = parsed.data;

  const guard = await withAuthAndProject(projectId);
  if ("error" in guard) return guard.error;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Parse multipart form — accept either ZIP file or JSON body with sections to import
  const contentType = req.headers.get("content-type") ?? "";

  let zip: JSZip;
  let sections: string[] = ["page-objects", "requirements", "test-plans", "specs"];

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    const sectionsRaw = form.get("sections") as string | null;
    if (sectionsRaw) {
      try { sections = JSON.parse(sectionsRaw) as string[]; } catch { /* use default */ }
    }
    zip = await extractZip(await file.arrayBuffer());
  } else {
    return NextResponse.json({ error: "Expected multipart/form-data with a ZIP file" }, { status: 400 });
  }

  const result: SmartImportResult = {
    pageObjects: { imported: 0, errors: [] },
    requirements: { imported: 0, errors: [] },
    testPlans: { imported: 0, errors: [] },
    specFiles: { imported: 0, errors: [] },
  };

  // ── Page Objects ────────────────────────────────────────────
  if (sections.includes("page-objects")) {
    const pomFiles = zipFiles(zip, "page-objects");
    for (const f of pomFiles) {
      const content = await f.async("string");
      const fileName = f.name.split("/").pop()!;
      const classMatch = /export\s+class\s+(\w+)/.exec(content);
      const className = classMatch?.[1] ?? fileName.replace(/\.ts$/, "");
      const modulePath = `pageobjects/${fileName}`;
      try {
        await upsertWebPageObjectContent({
          projectId,
          projectName: project.name,
          modulePath,
          content,
          className,
          screenName: className.replace(/Page$/i, "").replace(/Screen$/i, "") || null,
          userId: guard.user.id,
        });
        result.pageObjects.imported++;
      } catch (err) {
        result.pageObjects.errors.push(`${className}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    if (result.pageObjects.imported > 0) {
      try {
        const allPageObjects = await prisma.pageObject.findMany({
          where: { projectId },
          select: { className: true, modulePath: true },
          orderBy: { className: "asc" },
        });
        const platformType = await getProjectPlatformType(projectId);
        await writeFrameworkFiles({
          projectId,
          projectName: project.name,
          files: [{
            relativePath: TEST_FIXTURES_MODULE_PATH,
            content: generateTestFixturesSource(allPageObjects, platformType),
          }],
          overwritePageObjects: false,
          overwriteTests: false,
        });
      } catch { /* non-fatal */ }
    }
  }

  // ── Requirements ────────────────────────────────────────────
  if (sections.includes("requirements")) {
    const reqFiles = zipFiles(zip, "requirements");
    for (const f of reqFiles) {
      try {
        const text = await f.async("string");
        const items: unknown[] = JSON.parse(text);
        for (const item of items) {
          const r = requirementSchema.safeParse(item);
          if (!r.success) { result.requirements.errors.push(`Invalid requirement: ${JSON.stringify(item).slice(0, 80)}`); continue; }
          const req = await prisma.requirement.create({
            data: { projectId, title: r.data.title, content: r.data.content },
            select: { id: true, projectId: true, title: true, content: true, createdAt: true },
          });
          await syncRequirementToDisk({ projectId, projectName: project.name, requirement: req, userId: guard.user.id }).catch(() => {});
          result.requirements.imported++;
        }
      } catch (err) {
        result.requirements.errors.push(`${f.name}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
  }

  // ── Test Plans ──────────────────────────────────────────────
  if (sections.includes("test-plans")) {
    const planFiles = zipFiles(zip, "test-plans");
    for (const f of planFiles) {
      try {
        const text = await f.async("string");
        const items: unknown[] = JSON.parse(text);
        for (const item of items) {
          const p = testPlanSchema.safeParse(item);
          if (!p.success) { result.testPlans.errors.push(`Invalid plan: ${JSON.stringify(item).slice(0, 80)}`); continue; }
          await createTestPlanForProject({
            projectId,
            suiteName: p.data.title,
            requirementId: undefined,
            requirementTitle: undefined,
            requirementContent: undefined,
          });
          result.testPlans.imported++;
        }
      } catch (err) {
        result.testPlans.errors.push(`${f.name}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
  }

  // ── Spec Files ──────────────────────────────────────────────
  if (sections.includes("specs")) {
    const specFiles = zipFiles(zip, "specs");
    const files: { relativePath: string; content: string }[] = [];
    for (const f of specFiles) {
      const content = await f.async("string");
      const relativePath = `tests/${f.name.split("/").pop()!}`;
      files.push({ relativePath, content });
    }
    if (files.length > 0) {
      try {
        await writeFrameworkFiles({
          projectId,
          projectName: project.name,
          files,
          overwritePageObjects: false,
          overwriteTests: true,
        });
        result.specFiles.imported = files.length;
      } catch (err) {
        result.specFiles.errors.push(err instanceof Error ? err.message : "Failed to write spec files");
      }
    }
  }

  return NextResponse.json({ ok: true, result });
}

// Preview endpoint — reads ZIP and returns counts without saving
export async function PUT(
  req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const raw = await context.params;
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  const { projectId } = parsed.data;

  const guard = await withAuthAndProject(projectId);
  if ("error" in guard) return guard.error;

  const form = await req.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const zip = await extractZip(await file.arrayBuffer());

  const preview: SmartImportPreview = {
    pageObjects: [],
    requirements: [],
    testPlans: [],
    specFiles: [],
  };

  for (const f of zipFiles(zip, "page-objects")) {
    const content = await f.async("string");
    const classMatch = /export\s+class\s+(\w+)/.exec(content);
    const fileName = f.name.split("/").pop()!;
    preview.pageObjects.push({
      className: classMatch?.[1] ?? fileName.replace(/\.ts$/, ""),
      modulePath: `pageobjects/${fileName}`,
    });
  }

  for (const f of zipFiles(zip, "requirements")) {
    try {
      const items: unknown[] = JSON.parse(await f.async("string"));
      for (const item of items) {
        const r = requirementSchema.safeParse(item);
        if (r.success) preview.requirements.push({ title: r.data.title });
      }
    } catch { /* skip */ }
  }

  for (const f of zipFiles(zip, "test-plans")) {
    try {
      const items: unknown[] = JSON.parse(await f.async("string"));
      for (const item of items) {
        const p = testPlanSchema.safeParse(item);
        if (p.success) preview.testPlans.push({ title: p.data.title, caseCount: p.data.cases.length });
      }
    } catch { /* skip */ }
  }

  for (const f of zipFiles(zip, "specs")) {
    preview.specFiles.push({ path: f.name.split("/").pop()! });
  }

  return NextResponse.json({ ok: true, preview });
}
