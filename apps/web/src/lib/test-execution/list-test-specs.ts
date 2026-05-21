import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { getProjectFrameworkRoot } from "@/lib/local-framework/paths";

const SPEC_FILE_PATTERN = /\.spec\.(ts|js|mjs)$/;

export type TestSpecFile = {
  path: string;
  name: string;
};

async function collectSpecFilesUnder(
  absoluteDir: string,
  relativeDir: string,
  out: TestSpecFile[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const ent of entries) {
    const relWithinTests = relativeDir.length > 0 ? `${relativeDir}/${ent.name}` : ent.name;
    const abs = path.join(absoluteDir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "deleted") {
        continue;
      }
      await collectSpecFilesUnder(abs, relWithinTests, out);
    } else if (ent.isFile() && SPEC_FILE_PATTERN.test(ent.name)) {
      const relPath = `tests/${relWithinTests}`;
      out.push({
        path: relPath,
        name: relPath.replace(/^tests\//, ""),
      });
    }
  }
}

/** Lists tests/*.spec.ts (recursive) under the project framework without walking node_modules. */
export async function listTestSpecFiles(projectId: string): Promise<TestSpecFile[]> {
  const root = getProjectFrameworkRoot(projectId);
  const testsDir = path.join(root, "tests");
  try {
    const st = await stat(testsDir);
    if (!st.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const out: TestSpecFile[] = [];
  await collectSpecFilesUnder(testsDir, "", out);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}
