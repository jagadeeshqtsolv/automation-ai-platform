import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { getProjectFrameworkRoot, getProjectUserGitDir } from "@/lib/local-framework/paths";
import type { ProjectPlatformType } from "@automation-ai/core";

function trackerPath(projectId: string, platformType: ProjectPlatformType, userId: string): string {
  return path.join(getProjectUserGitDir(projectId, platformType, userId), "owned-files.json");
}

/** Project-level map: filePath → userId of the person who last wrote that file. */
function lastWriterPath(projectId: string, platformType: ProjectPlatformType): string {
  const root = getProjectFrameworkRoot(projectId, platformType);
  return path.join(root, ".git-users", "last-written-by.json");
}

export async function recordUserFiles(
  projectId: string,
  platformType: ProjectPlatformType,
  userId: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;

  // Per-user owned-files list (accumulates over time)
  const file = trackerPath(projectId, platformType, userId);
  const dir = path.dirname(file);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  let existing: string[] = [];
  try {
    const raw = await readFile(file, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) existing = parsed as string[];
  } catch { /* first write */ }
  const merged = Array.from(new Set([...existing, ...paths]));
  await writeFile(file, JSON.stringify(merged, null, 2) + "\n", "utf-8");

  // Project-level last-writer map — records who most recently wrote each file.
  // Used by listChangedFiles to suppress tracked diffs written by other users.
  const lwFile = lastWriterPath(projectId, platformType);
  const lwDir = path.dirname(lwFile);
  if (!existsSync(lwDir)) {
    await mkdir(lwDir, { recursive: true });
  }
  let lwMap: Record<string, string> = {};
  try {
    const raw = await readFile(lwFile, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      lwMap = parsed as Record<string, string>;
    }
  } catch { /* first write */ }
  for (const p of paths) {
    lwMap[p] = userId;
  }
  await writeFile(lwFile, JSON.stringify(lwMap, null, 2) + "\n", "utf-8");
}

export async function getUserOwnedPaths(
  projectId: string,
  platformType: ProjectPlatformType,
  userId: string,
): Promise<Set<string>> {
  const file = trackerPath(projectId, platformType, userId);
  try {
    const raw = await readFile(file, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed as string[]);
  } catch { /* no tracker yet */ }
  return new Set();
}

/**
 * Returns a map of filePath → userId for the user who last wrote each tracked file.
 * Files not in this map were never written by the AI (e.g. manual edits, config files).
 */
export async function getLastWrittenByMap(
  projectId: string,
  platformType: ProjectPlatformType,
): Promise<Record<string, string>> {
  const file = lastWriterPath(projectId, platformType);
  try {
    const raw = await readFile(file, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch { /* no tracker yet */ }
  return {};
}
