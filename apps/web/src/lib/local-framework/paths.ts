import { existsSync } from "node:fs";
import path from "node:path";
import type { ProjectPlatformType } from "@jagadeeshqtsolv/core";
import { z } from "zod";

const projectIdSchema = z.string().uuid();

/** Repo-level folder for per-project frameworks (validated UUID subdirs only). */
export function getFrameworksRoot(): string {
  const fromEnv = process.env.FRAMEWORKS_ROOT;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv.trim());
  }

  const cwd = process.cwd();
  const relativeCandidates = [
    path.resolve(cwd, "frameworks"),
    path.resolve(cwd, "../../frameworks"),
    path.resolve(cwd, "../frameworks"),
  ];
  for (const candidate of relativeCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  let dir = cwd;
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = path.join(dir, "frameworks");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return path.resolve(cwd, "../../frameworks");
}

/**
 * Framework root for a project.
 * - New mobile: `frameworks/mobile/<id>`
 * - Web: `frameworks/web/<id>`
 * - Legacy mobile (pre-platform split): `frameworks/<id>` when it exists
 */
export function getProjectFrameworkRoot(
  projectId: string,
  platformType?: ProjectPlatformType,
): string {
  const id = projectIdSchema.parse(projectId);
  const root = getFrameworksRoot();
  const legacy = path.join(root, id);
  const mobile = path.join(root, "mobile", id);
  const web = path.join(root, "web", id);

  if (platformType === "web") {
    return web;
  }

  if (platformType === "mobile") {
    if (existsSync(legacy) && !existsSync(mobile)) {
      return legacy;
    }
    return mobile;
  }

  if (existsSync(legacy)) {
    return legacy;
  }
  if (existsSync(web)) {
    return web;
  }
  if (existsSync(mobile)) {
    return mobile;
  }
  return legacy;
}

/**
 * Per-user git metadata directory for a project.
 * Stored inside the work tree under .git-users/{userId} so it is never
 * accidentally pushed (it is git-ignored automatically).
 * Using separate git dirs lets multiple users track the same work tree
 * independently — each has their own branch, history and remote config.
 */
export function getProjectUserGitDir(
  projectId: string,
  platformType: ProjectPlatformType,
  userId: string,
): string {
  const root = getProjectFrameworkRoot(projectId, platformType);
  return path.join(root, ".git-users", userId);
}

/** All framework roots that may exist for a project (for delete). */
export function getAllProjectFrameworkRoots(projectId: string): string[] {
  const id = projectIdSchema.parse(projectId);
  const root = getFrameworksRoot();
  return [path.join(root, id), path.join(root, "mobile", id), path.join(root, "web", id)];
}

export type FrameworkRelativePath = string;

/**
 * Maps LLM paths like `pageobjects/LoginPage.ts` to a safe absolute path under the project root.
 * Rejects traversal and paths outside allowed prefixes.
 */
export function resolveFrameworkFilePath(
  projectId: string,
  relativePath: string,
  platformType?: ProjectPlatformType,
): string | null {
  const normalized = relativePath.trim().replace(/^\.\//, "").replace(/\\/g, "/");
  if (normalized.length === 0 || normalized.includes("..")) {
    return null;
  }
  const allowed =
    normalized.startsWith("pageobjects/") ||
    normalized.startsWith("support/") ||
    normalized.startsWith("scripts/") ||
    normalized.startsWith("tests/") ||
    normalized.startsWith("requirements/") ||
    normalized.startsWith("test-plans/") ||
    normalized.startsWith("test-cases/") ||
    normalized.startsWith("logs/") ||
    normalized.startsWith("execution/") ||
    normalized.startsWith("utils/") ||
    normalized.startsWith("testdata/") ||
    normalized === "package.json" ||
    normalized === "tsconfig.json" ||
    normalized === "mobilewright.config.ts" ||
    normalized === "playwright.config.ts" ||
    normalized === "mobilewright.execution.config.ts" ||
    normalized === "playwright.execution.config.ts" ||
    normalized === "browserstack.yml" ||
    normalized.startsWith("environments/");
  if (!allowed) {
    return null;
  }
  const frameworkRoot = getProjectFrameworkRoot(projectId, platformType);
  const absolute = path.resolve(frameworkRoot, normalized);
  if (!absolute.startsWith(frameworkRoot + path.sep) && absolute !== frameworkRoot) {
    return null;
  }
  return absolute;
}

/**
 * Locates the `packages/core/web/` directory in the monorepo.
 * Falls back to the same walk-up strategy as getFrameworksRoot.
 */
export function getWebCoreRoot(): string {
  const fromEnv = process.env.WEB_CORE_ROOT;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return path.resolve(fromEnv.trim());
  }

  const cwd = process.cwd();
  const relativeCandidates = [
    path.resolve(cwd, "../../packages/core/web"),
    path.resolve(cwd, "../packages/core/web"),
    path.resolve(cwd, "packages/core/web"),
  ];
  for (const candidate of relativeCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  let dir = cwd;
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = path.join(dir, "packages", "core", "web");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return path.resolve(cwd, "../../packages/core/web");
}

export function toFrameworkRelativePath(
  projectId: string,
  absolutePath: string,
  platformType?: ProjectPlatformType,
): string | null {
  const frameworkRoot = getProjectFrameworkRoot(projectId, platformType);
  const resolved = path.resolve(absolutePath);
  if (!resolved.startsWith(frameworkRoot + path.sep)) {
    return null;
  }
  return resolved.slice(frameworkRoot.length + 1).replace(/\\/g, "/");
}
