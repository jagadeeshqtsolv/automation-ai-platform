import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import { PassThrough } from "node:stream";
import { getProjectFrameworkRoot } from "@/lib/local-framework/paths";

const EXCLUDED_NAMES = new Set([
  "node_modules",
  ".git",
  "test-results",
  "mobilewright-report",
  ".DS_Store",
]);

async function appendDirectory(archive: archiver.Archiver, root: string, dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (EXCLUDED_NAMES.has(ent.name)) {
      continue;
    }
    const abs = path.join(dir, ent.name);
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    if (ent.isDirectory()) {
      await appendDirectory(archive, root, abs);
    } else if (ent.isFile()) {
      archive.file(abs, { name: rel });
    }
  }
}

export async function createFrameworkZipBuffer(projectId: string): Promise<Buffer> {
  const root = getProjectFrameworkRoot(projectId);
  try {
    await stat(root);
  } catch {
    throw new Error("Framework not found");
  }

  const archive = archiver("zip", { zlib: { level: 9 } });
  const passthrough = new PassThrough();
  const chunks: Buffer[] = [];

  passthrough.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });

  const done = new Promise<Buffer>((resolve, reject) => {
    passthrough.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    passthrough.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(passthrough);
  await appendDirectory(archive, root, root);
  await archive.finalize();

  return done;
}

export function frameworkZipDownloadName(projectId: string, projectName?: string | null): string {
  const base =
    projectName !== null && projectName !== undefined && projectName.trim().length > 0
      ? projectName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
      : projectId.slice(0, 8);
  return `${base || "framework"}-mobilewright.zip`;
}
