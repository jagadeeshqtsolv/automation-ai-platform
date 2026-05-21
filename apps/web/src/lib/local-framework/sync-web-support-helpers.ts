import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { WEB_ACTIONS_HELPER_SOURCE } from "@/lib/screen-codegen/web-actions-helper";
import { WEB_LOCATE_HELPER_SOURCE } from "@/lib/screen-codegen/web-locate-helper";

/**
 * Writes canonical `support/web-actions.ts` and `support/web-locate.ts` for a web framework.
 * Always overwrites — these are platform-managed (page objects depend on every export).
 */
export async function syncWebSupportHelpersToDisk(projectId: string): Promise<void> {
  const root = getProjectFrameworkRoot(projectId, "web");
  await mkdir(path.join(root, "support"), { recursive: true });

  const locatePath = resolveFrameworkFilePath(projectId, "support/web-locate.ts", "web");
  const actionsPath = resolveFrameworkFilePath(projectId, "support/web-actions.ts", "web");

  const newline = (text: string): string => (text.endsWith("\n") ? text : `${text}\n`);

  if (locatePath !== null) {
    await writeFile(locatePath, newline(WEB_LOCATE_HELPER_SOURCE), "utf8");
  }
  if (actionsPath !== null) {
    await writeFile(actionsPath, newline(WEB_ACTIONS_HELPER_SOURCE), "utf8");
  }
}
