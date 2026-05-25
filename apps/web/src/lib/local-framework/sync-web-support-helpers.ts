import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";

const LOCATE_STUB = `export * from "@automation-ai/web-support/web-locate";\n`;
const ACTIONS_STUB = `export * from "@automation-ai/web-support/web-actions";\n`;

/**
 * Writes `support/web-actions.ts` and `support/web-locate.ts` as thin re-exports.
 * The actual implementation lives in packages/core/web (installed via file: dep).
 */
export async function syncWebSupportHelpersToDisk(projectId: string): Promise<void> {
  const root = getProjectFrameworkRoot(projectId, "web");
  await mkdir(path.join(root, "support"), { recursive: true });

  const locatePath = resolveFrameworkFilePath(projectId, "support/web-locate.ts", "web");
  const actionsPath = resolveFrameworkFilePath(projectId, "support/web-actions.ts", "web");

  if (locatePath !== null) {
    await writeFile(locatePath, LOCATE_STUB, "utf8");
  }
  if (actionsPath !== null) {
    await writeFile(actionsPath, ACTIONS_STUB, "utf8");
  }
}
