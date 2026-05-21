import { access, rm, unlink } from "node:fs/promises";
import { getAllProjectFrameworkRoots, resolveFrameworkFilePath } from "@/lib/local-framework/paths";

/** Removes the on-disk framework folder for a validated project UUID. */
export async function deleteProjectFrameworkDir(
  projectId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const roots = getAllProjectFrameworkRoots(projectId);
  let lastError: string | undefined;

  for (const root of roots) {
    try {
      await access(root);
    } catch {
      continue;
    }

    try {
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 200,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not remove framework folder";
      lastError = `${message} (${root})`;
    }
  }

  if (lastError !== undefined) {
    return { ok: false, error: lastError };
  }
  return { ok: true };
}

export async function deleteFrameworkFile(projectId: string, relativePath: string): Promise<void> {
  const abs = resolveFrameworkFilePath(projectId, relativePath);
  if (abs === null) return;
  await unlink(abs).catch(() => undefined);
}
