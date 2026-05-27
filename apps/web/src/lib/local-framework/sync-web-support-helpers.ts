import { cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProjectFrameworkRoot, getWebCoreRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";

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

/**
 * The package.json written into each framework project's node_modules.
 * Uses "default" condition so it resolves under both ESM (import) and CJS (require)
 * contexts, and points exports to compiled dist/ — never to src/*.ts.
 */
const WEB_SUPPORT_PACKAGE_JSON = JSON.stringify(
  {
    name: "@jagadeeshqtsolv/web-support",
    version: "1.0.4",
    type: "module",
    exports: {
      "./web-actions": {
        types: "./dist/src/web-actions.d.ts",
        default: "./dist/src/web-actions.js",
      },
      "./web-locate": {
        types: "./dist/src/web-locate.d.ts",
        default: "./dist/src/web-locate.js",
      },
      "./fixtures": {
        types: "./dist/src/fixtures.d.ts",
        default: "./dist/src/fixtures.js",
      },
      "./data-utils": {
        types: "./dist/utils/data-utils.d.ts",
        default: "./dist/utils/data-utils.js",
      },
    },
    files: ["dist", "scripts"],
  },
  null,
  2,
) + "\n";

/**
 * Copies the locally-built @automation-ai/web-support dist and scripts into a
 * project framework's node_modules so it always uses the latest source without
 * requiring a package publish or npm reinstall.
 * Also rewrites package.json so exports always point to dist/ (not src/*.ts).
 */
export async function syncWebSupportDistToProject(frameworkRoot: string): Promise<void> {
  const webCoreRoot = getWebCoreRoot();
  const target = path.join(frameworkRoot, "node_modules/@automation-ai/web-support");

  try {
    // Sync TypeScript-compiled helpers (web-actions, web-locate, fixtures, etc.)
    const srcDist = path.join(webCoreRoot, "dist");
    const dstDist = path.join(target, "dist");
    await cp(srcDist, dstDist, { recursive: true, force: true });

    // Sync the recorder script
    const srcScript = path.join(webCoreRoot, "scripts", "capture-dom.mjs");
    const dstScripts = path.join(target, "scripts");
    await mkdir(dstScripts, { recursive: true });
    await cp(srcScript, path.join(dstScripts, "capture-dom.mjs"), { force: true });

    // Overwrite the npm-installed package.json so exports always resolve to dist/
    await writeFile(path.join(target, "package.json"), WEB_SUPPORT_PACKAGE_JSON, "utf8");
  } catch {
    // Non-critical — node_modules may not exist yet or web-support may not be built
  }
}
