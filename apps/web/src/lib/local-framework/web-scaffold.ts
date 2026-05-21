import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPlaywrightWebConfig } from "@/lib/playwright-web-environment-config";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { FRAMEWORK_NPMRC_FILENAME, FRAMEWORK_PROJECT_NPMRC } from "@/lib/local-framework/framework-npmrc";
import { WEB_FRAMEWORK_PACKAGE_JSON } from "@/lib/local-framework/web-framework-package";
import { syncWebSupportHelpersToDisk } from "@/lib/local-framework/sync-web-support-helpers";
import { CAPTURE_DOM_SCRIPT_SOURCE } from "@/lib/recorder/capture-dom-script-source";

const WEB_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["pageobjects/**/*.ts", "support/**/*.ts", "tests/**/*.ts", "playwright.config.ts"]
}
`;

const WEB_FIXTURES = `import { test as base, expect } from "@playwright/test";

export const test = base;
export { expect };
`;

export async function writePlaywrightWebConfig(
  projectId: string,
  configJson: string | null,
): Promise<void> {
  const cfgPath = resolveFrameworkFilePath(projectId, "playwright.config.ts");
  if (cfgPath === null) {
    return;
  }
  await writeFile(cfgPath, buildPlaywrightWebConfig(configJson), "utf8");
}

/** Scaffold a Playwright browser framework under frameworks/web/<projectId>/. */
export async function ensureWebFrameworkScaffold(params: {
  projectId: string;
  projectName: string;
  environmentConfigJson?: string | null;
}): Promise<void> {
  const root = getProjectFrameworkRoot(params.projectId, "web");
  await mkdir(path.join(root, "pageobjects"), { recursive: true });
  await mkdir(path.join(root, "support"), { recursive: true });
  await mkdir(path.join(root, "tests"), { recursive: true });
  await mkdir(path.join(root, "requirements"), { recursive: true });
  await mkdir(path.join(root, "test-plans"), { recursive: true });
  await mkdir(path.join(root, "test-cases"), { recursive: true });
  await mkdir(path.join(root, "environments"), { recursive: true });
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, "logs"), { recursive: true });

  for (const dir of ["requirements", "test-plans", "test-cases"]) {
    await writeFile(path.join(root, dir, ".gitkeep"), "", { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }
  await writeFile(path.join(root, "logs", ".gitkeep"), "# Playwright test logs\n", {
    encoding: "utf8",
    flag: "wx",
  }).catch(() => undefined);

  const pkgPath = resolveFrameworkFilePath(params.projectId, "package.json", "web");
  const tsPath = resolveFrameworkFilePath(params.projectId, "tsconfig.json", "web");
  const cfgPath = resolveFrameworkFilePath(params.projectId, "playwright.config.ts", "web");
  const fixturesPath = resolveFrameworkFilePath(params.projectId, "support/fixtures.ts", "web");
  const capturePath = resolveFrameworkFilePath(params.projectId, "scripts/capture-dom.mjs", "web");
  const readmePath = path.join(root, "README.md");
  const npmrcPath = path.join(root, FRAMEWORK_NPMRC_FILENAME);

  await writeFile(npmrcPath, FRAMEWORK_PROJECT_NPMRC, { encoding: "utf8" }).catch(() => undefined);

  if (pkgPath !== null) {
    await writeFile(pkgPath, WEB_FRAMEWORK_PACKAGE_JSON, { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }
  if (tsPath !== null) {
    await writeFile(tsPath, WEB_TSCONFIG, { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }
  if (params.environmentConfigJson !== undefined && params.environmentConfigJson !== null) {
    await writePlaywrightWebConfig(params.projectId, params.environmentConfigJson);
  } else if (cfgPath !== null) {
    await writeFile(cfgPath, buildPlaywrightWebConfig(null), { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }
  if (fixturesPath !== null) {
    await writeFile(fixturesPath, WEB_FIXTURES, { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }
  await syncWebSupportHelpersToDisk(params.projectId);
  if (capturePath !== null) {
    await writeFile(capturePath, CAPTURE_DOM_SCRIPT_SOURCE, { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }

  await writeFile(
    readmePath,
    [
      `# ${params.projectName} — Playwright web framework`,
      "",
      "Generated and maintained by Automation AI.",
      "",
      "## Layout",
      "",
      "- `pageobjects/` — Page classes using `import type { Page } from '@playwright/test'`",
      "- `support/fixtures.ts` — Extended Playwright test with page-object fixtures",
      "- `support/web-locate.ts` — Web locator strategies (testId, css, label, role, …)",
      "- `support/web-actions.ts` — Web-only click/fill/check helpers (not mobile tap)",
      "- `tests/` — Executable specs",
      "- `playwright.config.ts` — baseURL, browser, reporters; trace + video retained on failure",
      "- `logs/playwright-report.json` — JSON reporter output for Test Reports",
      "- `scripts/capture-dom.mjs` — Open browser, navigate, capture DOM for the recorder",
      "",
      "## Record a page from the browser",
      "",
      "1. Set **baseURL** in Setup → environments.",
      "2. In the UI **Browser recorder**, click **Open browser & capture**.",
      "3. Navigate in the opened browser, then **Resume** in the Playwright Inspector.",
      "4. Parse elements, name the page (e.g. Login), and save.",
      "",
      "## Run tests",
      "",
      "```bash",
      "npm test",
      "npm run test:report",
      "```",
      "",
    ].join("\n"),
    { encoding: "utf8" },
  ).catch(() => undefined);
}
