import { spawn } from "node:child_process";
import { access, copyFile, cp, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { FRAMEWORK_NPMRC_FILENAME, FRAMEWORK_PROJECT_NPMRC } from "@/lib/local-framework/framework-npmrc";
import { FRAMEWORK_PACKAGE_JSON } from "@/lib/local-framework/framework-package";
import { WEB_FRAMEWORK_PACKAGE_JSON } from "@/lib/local-framework/web-framework-package";
import { getFrameworksRoot, getProjectFrameworkRoot } from "@/lib/local-framework/paths";
import { getProjectPlatformType } from "@/lib/project-platform";
import { relinkNodeModulesBinaries } from "@/lib/local-framework/relink-node-modules-binaries";

/** Only used when seeding the shared cache from npm (not per-project copy). */
const SHARED_NPM_TIMEOUT_MS = 600_000;
/** Fallback per-project npm install if copy fails. */
const PROJECT_NPM_TIMEOUT_MS = 300_000;

const SHARED_CACHE_KEY = "__shared__";
const SHARED_WEB_CACHE_KEY = "__shared_web__";
const installInFlight = new Set<string>();

export type FrameworkDependencyStatus = {
  hasPackageJson: boolean;
  dependenciesInstalled: boolean;
};

function mobilewrightPkgPath(nodeModulesDir: string): string {
  return path.join(nodeModulesDir, "mobilewright", "package.json");
}

function playwrightTestPkgPath(nodeModulesDir: string): string {
  return path.join(nodeModulesDir, "@playwright", "test", "package.json");
}

function getSharedCacheRoot(): string {
  return path.join(getFrameworksRoot(), "_shared");
}

function getRunnerNodeModulesDir(): string | null {
  const frameworksRoot = getFrameworksRoot();
  const candidate = path.join(path.dirname(frameworksRoot), "examples", "runner", "node_modules");
  if (existsSync(mobilewrightPkgPath(candidate))) {
    return candidate;
  }
  return null;
}

/** examples/runner often has @playwright/test via @mobilewright/test — reuse without npm. */
function getRunnerPlaywrightNodeModulesDir(): string | null {
  const frameworksRoot = getFrameworksRoot();
  const candidate = path.join(path.dirname(frameworksRoot), "examples", "runner", "node_modules");
  if (existsSync(playwrightTestPkgPath(candidate))) {
    return candidate;
  }
  return null;
}

function getSharedWebCacheRoot(): string {
  return path.join(getFrameworksRoot(), "_shared-web");
}

async function writeFrameworkProjectNpmrc(projectRoot: string): Promise<void> {
  await writeFile(path.join(projectRoot, FRAMEWORK_NPMRC_FILENAME), FRAMEWORK_PROJECT_NPMRC, "utf8");
}

function getRunnerPackageLockPath(): string | null {
  const frameworksRoot = getFrameworksRoot();
  const candidate = path.join(path.dirname(frameworksRoot), "examples", "runner", "package-lock.json");
  return existsSync(candidate) ? candidate : null;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyNodeModules(targetProjectRoot: string, sourceNodeModulesDir: string): Promise<void> {
  const dest = path.join(targetProjectRoot, "node_modules");
  await cp(sourceNodeModulesDir, dest, { recursive: true, force: true });
  await relinkNodeModulesBinaries(targetProjectRoot);
}

function runNpmInstall(cwd: string, timeoutMs: number): Promise<{ ok: boolean; error?: string }> {
  const lockPath = path.join(cwd, "package-lock.json");
  const args = existsSync(lockPath)
    ? ["ci", "--no-fund", "--no-audit", "--prefer-offline"]
    : ["install", "--no-fund", "--no-audit", "--prefer-offline"];

  return new Promise((resolve) => {
    const child = spawn("npm", args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ ok: false, error: "npm install timed out" });
    }, timeoutMs);

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 2_000) {
        stderr = stderr.slice(-2_000);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true });
        return;
      }
      resolve({
        ok: false,
        error:
          stderr.trim().length > 0
            ? stderr.trim()
            : `npm ${args[0]} exited with code ${code ?? "unknown"}`,
      });
    });
  });
}

/** One shared node_modules tree; npm runs here at most once, then projects copy from disk. */
async function ensureSharedDependencyCache(): Promise<{ ok: boolean; error?: string }> {
  const cacheRoot = getSharedCacheRoot();
  const sharedNodeModules = path.join(cacheRoot, "node_modules");

  if (await pathExists(mobilewrightPkgPath(sharedNodeModules))) {
    return { ok: true };
  }

  if (installInFlight.has(SHARED_CACHE_KEY)) {
    return { ok: false, error: "Shared dependency cache is still being built. Try again in a moment." };
  }

  installInFlight.add(SHARED_CACHE_KEY);
  try {
    await mkdir(cacheRoot, { recursive: true });
    await writeFile(path.join(cacheRoot, "package.json"), FRAMEWORK_PACKAGE_JSON, "utf8");

    const runnerModules = getRunnerNodeModulesDir();
    if (runnerModules !== null) {
      await copyNodeModules(cacheRoot, runnerModules);
      if (await pathExists(mobilewrightPkgPath(sharedNodeModules))) {
        return { ok: true };
      }
    }

    const lockSrc = getRunnerPackageLockPath();
    if (lockSrc !== null) {
      await copyFile(lockSrc, path.join(cacheRoot, "package-lock.json"));
    }

    const npm = await runNpmInstall(cacheRoot, SHARED_NPM_TIMEOUT_MS);
    if (!npm.ok) {
      return npm;
    }

    if (!(await pathExists(mobilewrightPkgPath(sharedNodeModules)))) {
      return { ok: false, error: "Shared cache install finished but mobilewright is missing" };
    }

    return { ok: true };
  } finally {
    installInFlight.delete(SHARED_CACHE_KEY);
  }
}

/** Shared Playwright cache under frameworks/_shared-web (copy-first, npm only if needed). */
async function ensureSharedWebDependencyCache(): Promise<{ ok: boolean; error?: string }> {
  const cacheRoot = getSharedWebCacheRoot();
  const sharedNodeModules = path.join(cacheRoot, "node_modules");

  if (await pathExists(playwrightTestPkgPath(sharedNodeModules))) {
    return { ok: true };
  }

  if (installInFlight.has(SHARED_WEB_CACHE_KEY)) {
    return { ok: false, error: "Shared web dependency cache is still being built. Try again in a moment." };
  }

  installInFlight.add(SHARED_WEB_CACHE_KEY);
  try {
    await mkdir(cacheRoot, { recursive: true });
    await writeFile(path.join(cacheRoot, "package.json"), WEB_FRAMEWORK_PACKAGE_JSON, "utf8");
    await writeFrameworkProjectNpmrc(cacheRoot);

    const runnerModules = getRunnerPlaywrightNodeModulesDir();
    if (runnerModules !== null) {
      await copyNodeModules(cacheRoot, runnerModules);
      if (await pathExists(playwrightTestPkgPath(sharedNodeModules))) {
        return { ok: true };
      }
    }

    const npm = await runNpmInstall(cacheRoot, SHARED_NPM_TIMEOUT_MS);
    if (!npm.ok) {
      return {
        ok: false,
        error:
          npm.error ??
          "Could not install Playwright. Ensure examples/runner has node_modules or network access to registry.npmjs.org.",
      };
    }

    if (!(await pathExists(playwrightTestPkgPath(sharedNodeModules)))) {
      return { ok: false, error: "Shared web cache install finished but @playwright/test is missing" };
    }

    return { ok: true };
  } finally {
    installInFlight.delete(SHARED_WEB_CACHE_KEY);
  }
}

async function installWebFrameworkDependencies(projectRoot: string): Promise<{ ok: boolean; error?: string }> {
  const projectRunnerPkg = playwrightTestPkgPath(path.join(projectRoot, "node_modules"));

  if (await pathExists(projectRunnerPkg)) {
    await relinkNodeModulesBinaries(projectRoot);
    return { ok: true };
  }

  await writeFrameworkProjectNpmrc(projectRoot);

  const runnerModules = getRunnerPlaywrightNodeModulesDir();
  if (runnerModules !== null) {
    try {
      await copyNodeModules(projectRoot, runnerModules);
      if (await pathExists(projectRunnerPkg)) {
        return { ok: true };
      }
    } catch {
      // fall through
    }
  }

  const sharedWebNodeModules = path.join(getSharedWebCacheRoot(), "node_modules");
  if (await pathExists(playwrightTestPkgPath(sharedWebNodeModules))) {
    try {
      await copyNodeModules(projectRoot, sharedWebNodeModules);
      if (await pathExists(projectRunnerPkg)) {
        return { ok: true };
      }
    } catch {
      // fall through
    }
  }

  const cache = await ensureSharedWebDependencyCache();
  if (!cache.ok) {
    return cache;
  }

  try {
    await copyNodeModules(projectRoot, path.join(getSharedWebCacheRoot(), "node_modules"));
    if (await pathExists(projectRunnerPkg)) {
      return { ok: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not copy shared web dependencies";
    return { ok: false, error: message };
  }

  return await runNpmInstall(projectRoot, PROJECT_NPM_TIMEOUT_MS);
}

/** Read-only check: framework package.json and mobilewright in node_modules. */
export async function getFrameworkDependencyStatus(
  projectId: string,
): Promise<FrameworkDependencyStatus> {
  const platform = await getProjectPlatformType(projectId);
  const root = getProjectFrameworkRoot(projectId, platform);
  const packageJsonPath = path.join(root, "package.json");
  const runnerPkg =
    platform === "web"
      ? playwrightTestPkgPath(path.join(root, "node_modules"))
      : mobilewrightPkgPath(path.join(root, "node_modules"));

  let hasPackageJson = false;
  let dependenciesInstalled = false;

  if (await pathExists(packageJsonPath)) {
    hasPackageJson = true;
  }

  if (await pathExists(runnerPkg)) {
    dependenciesInstalled = true;
  }

  return { hasPackageJson, dependenciesInstalled };
}

export function isFrameworkDependencyInstallInFlight(projectId: string): boolean {
  return (
    installInFlight.has(projectId) ||
    installInFlight.has(SHARED_CACHE_KEY) ||
    installInFlight.has(SHARED_WEB_CACHE_KEY)
  );
}

/** Run install without blocking the caller (e.g. project create). */
export function scheduleFrameworkDependencyInstall(projectId: string): void {
  if (installInFlight.has(projectId)) {
    return;
  }
  void installFrameworkDependencies(projectId)
    .then((result) => {
      if (!result.ok) {
        console.error(`[framework] install failed for project ${projectId}: ${result.error ?? "unknown"}`);
      }
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[framework] install error for project ${projectId}: ${message}`);
    });
}

export async function installFrameworkDependencies(
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  const platform = await getProjectPlatformType(projectId);
  const root = getProjectFrameworkRoot(projectId, platform);
  const packageJsonPath = path.join(root, "package.json");
  const projectRunnerPkg =
    platform === "web"
      ? playwrightTestPkgPath(path.join(root, "node_modules"))
      : mobilewrightPkgPath(path.join(root, "node_modules"));

  if (!(await pathExists(packageJsonPath))) {
    return { ok: false, error: "package.json not found in framework folder" };
  }

  if (platform === "web") {
    if (await pathExists(projectRunnerPkg)) {
      await relinkNodeModulesBinaries(root);
      return { ok: true };
    }
    if (installInFlight.has(projectId)) {
      return { ok: false, error: "Dependency install already in progress for this project" };
    }
    installInFlight.add(projectId);
    try {
      return await installWebFrameworkDependencies(root);
    } finally {
      installInFlight.delete(projectId);
    }
  }

  if (await pathExists(projectRunnerPkg)) {
    await relinkNodeModulesBinaries(root);
    return { ok: true };
  }

  if (installInFlight.has(projectId)) {
    return { ok: false, error: "Dependency install already in progress for this project" };
  }

  installInFlight.add(projectId);
  try {
    const runnerModules = getRunnerNodeModulesDir();
    if (runnerModules !== null) {
      try {
        await copyNodeModules(root, runnerModules);
        if (await pathExists(projectRunnerPkg)) {
          return { ok: true };
        }
      } catch {
        // fall through to shared cache
      }
    }

    const sharedNodeModules = path.join(getSharedCacheRoot(), "node_modules");
    if (await pathExists(mobilewrightPkgPath(sharedNodeModules))) {
      try {
        await copyNodeModules(root, sharedNodeModules);
        if (await pathExists(projectRunnerPkg)) {
          return { ok: true };
        }
      } catch {
        // fall through
      }
    }

    const cache = await ensureSharedDependencyCache();
    if (!cache.ok) {
      return cache;
    }

    try {
      await copyNodeModules(root, path.join(getSharedCacheRoot(), "node_modules"));
      if (await pathExists(projectRunnerPkg)) {
        return { ok: true };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not copy shared dependencies";
      return { ok: false, error: message };
    }

    return await runNpmInstall(root, PROJECT_NPM_TIMEOUT_MS);
  } finally {
    installInFlight.delete(projectId);
  }
}
