import { existsSync } from "node:fs";
import { lstat, readdir, readlink, symlink, unlink } from "node:fs/promises";
import path from "node:path";

function packagePathAfterNodeModules(absolutePath: string): string | null {
  const marker = `${path.sep}node_modules${path.sep}`;
  const idx = absolutePath.lastIndexOf(marker);
  if (idx === -1) {
    return null;
  }
  const relative = absolutePath.slice(idx + marker.length);
  return relative.length > 0 ? relative : null;
}

/**
 * After copying node_modules from runner/shared cache, .bin symlinks still point at the
 * source tree. Playwright then loads two different installations and test() fails at runtime.
 */
export async function relinkNodeModulesBinaries(projectRoot: string): Promise<void> {
  const nodeModules = path.join(projectRoot, "node_modules");
  const binDir = path.join(nodeModules, ".bin");
  if (!existsSync(binDir)) {
    return;
  }

  const entries = await readdir(binDir);
  for (const name of entries) {
    const linkPath = path.join(binDir, name);
    let stat;
    try {
      stat = await lstat(linkPath);
    } catch {
      continue;
    }
    if (!stat.isSymbolicLink()) {
      continue;
    }

    let target: string;
    try {
      target = await readlink(linkPath);
    } catch {
      continue;
    }

    const absoluteTarget = path.isAbsolute(target) ? target : path.resolve(binDir, target);
    if (absoluteTarget.startsWith(`${nodeModules}${path.sep}`)) {
      continue;
    }

    const packageRelative = packagePathAfterNodeModules(absoluteTarget);
    if (packageRelative === null) {
      continue;
    }

    const localTarget = path.join(nodeModules, packageRelative);
    if (!existsSync(localTarget)) {
      continue;
    }

    const relativeLink = path.relative(binDir, localTarget);
    await unlink(linkPath);
    await symlink(relativeLink, linkPath);
  }
}
