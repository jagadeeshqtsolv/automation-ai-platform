import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProjectFrameworkRoot, resolveFrameworkFilePath, toFrameworkRelativePath } from "@/lib/local-framework/paths";
import { ensureProjectFrameworkScaffold } from "@/lib/local-framework/ensure-project-scaffold";
import { writeEnvironmentSnapshot } from "@/lib/local-framework/scaffold";
import { writeProjectTestConfig } from "@/lib/local-framework/project-config-writer";
import { getProjectPlatformType } from "@/lib/project-platform";

export type FrameworkFileWrite = {
  relativePath: string;
  content: string;
};

export type WriteFrameworkResult = {
  rootPath: string;
  written: string[];
  skipped: string[];
};

async function writeValidatedFile(params: {
  projectId: string;
  relativePath: string;
  content: string;
  overwrite: boolean;
}): Promise<"written" | "skipped" | "invalid"> {
  const abs = resolveFrameworkFilePath(params.projectId, params.relativePath);
  if (abs === null) {
    return "invalid";
  }

  try {
    await stat(abs);
    if (!params.overwrite) {
      return "skipped";
    }
  } catch {
    // file does not exist — create
  }

  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, params.content.endsWith("\n") ? params.content : `${params.content}\n`, "utf8");
  return "written";
}

export async function writeFrameworkFiles(params: {
  projectId: string;
  projectName: string;
  files: FrameworkFileWrite[];
  overwritePageObjects: boolean;
  overwriteTests: boolean;
  environment?: { slug: string; configJson: string } | null;
}): Promise<WriteFrameworkResult> {
  const platformType = await getProjectPlatformType(params.projectId);
  await ensureProjectFrameworkScaffold({
    projectId: params.projectId,
    projectName: params.projectName,
    platformType,
    environmentConfigJson: params.environment?.configJson ?? null,
  });

  if (params.environment !== undefined && params.environment !== null) {
    await writeEnvironmentSnapshot({
      projectId: params.projectId,
      slug: params.environment.slug,
      configJson: params.environment.configJson,
    });
    await writeProjectTestConfig(params.projectId, params.environment.configJson);
  }

  const written: string[] = [];
  const skipped: string[] = [];

  for (const file of params.files) {
    const rel = file.relativePath.trim().replace(/^\.\//, "").replace(/\\/g, "/");
    const isPage = rel.startsWith("pageobjects/");
    const isTest = rel.startsWith("tests/");
    const overwrite = isPage ? params.overwritePageObjects : isTest ? params.overwriteTests : true;

    const result = await writeValidatedFile({
      projectId: params.projectId,
      relativePath: rel,
      content: file.content,
      overwrite,
    });

    if (result === "written") {
      written.push(rel);
    } else if (result === "skipped") {
      skipped.push(rel);
    }
  }

  return { rootPath: getProjectFrameworkRoot(params.projectId), written, skipped };
}

export async function syncPageObjectToDisk(params: {
  projectId: string;
  projectName: string;
  modulePath: string;
  content: string;
  overwrite: boolean;
}): Promise<void> {
  const platformType = await getProjectPlatformType(params.projectId);
  await ensureProjectFrameworkScaffold({
    projectId: params.projectId,
    projectName: params.projectName,
    platformType,
  });
  await writeValidatedFile({
    projectId: params.projectId,
    relativePath: params.modulePath,
    content: params.content,
    overwrite: params.overwrite,
  });
}

export type FrameworkTreeEntry = {
  path: string;
  kind: "file" | "dir";
  size?: number;
};

async function walkDir(root: string, dir: string, out: FrameworkTreeEntry[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (
      ent.name === "node_modules" ||
      ent.name === ".git" ||
      ent.name === "test-results" ||
      ent.name === "playwright-report"
    ) {
      continue;
    }
    const abs = path.join(dir, ent.name);
    const rel = abs.slice(root.length + 1).replace(/\\/g, "/");
    if (ent.isDirectory()) {
      out.push({ path: rel, kind: "dir" });
      await walkDir(root, abs, out);
    } else if (ent.isFile()) {
      const st = await stat(abs);
      out.push({ path: rel, kind: "file", size: st.size });
    }
  }
}

export async function listFrameworkTree(projectId: string): Promise<{
  rootPath: string;
  exists: boolean;
  entries: FrameworkTreeEntry[];
}> {
  const root = getProjectFrameworkRoot(projectId);
  const entries: FrameworkTreeEntry[] = [];
  try {
    await stat(root);
  } catch {
    return { rootPath: root, exists: false, entries: [] };
  }
  await walkDir(root, root, entries);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { rootPath: root, exists: true, entries };
}

export async function readFrameworkFile(projectId: string, relativePath: string): Promise<string | null> {
  const abs = resolveFrameworkFilePath(projectId, relativePath);
  if (abs === null) return null;
  try {
    return await readFile(abs, "utf8");
  } catch {
    return null;
  }
}

export async function syncAllPageObjectsFromRecords(params: {
  projectId: string;
  projectName: string;
  records: Array<{ modulePath: string; content: string }>;
  overwrite: boolean;
}): Promise<string[]> {
  const platformType = await getProjectPlatformType(params.projectId);
  await ensureProjectFrameworkScaffold({
    projectId: params.projectId,
    projectName: params.projectName,
    platformType,
  });
  const written: string[] = [];
  for (const row of params.records) {
    const result = await writeValidatedFile({
      projectId: params.projectId,
      relativePath: row.modulePath,
      content: row.content,
      overwrite: params.overwrite,
    });
    if (result === "written") {
      written.push(row.modulePath);
    }
  }
  return written;
}

export function frameworkPathHint(projectId: string): string {
  const rel = toFrameworkRelativePath(projectId, getProjectFrameworkRoot(projectId));
  return rel ?? `frameworks/${projectId}`;
}
