import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildPlaywrightWebConfig, buildDefaultEnvironmentJson } from "@/lib/playwright-web-environment-config";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { FRAMEWORK_NPMRC_FILENAME, FRAMEWORK_PROJECT_NPMRC } from "@/lib/local-framework/framework-npmrc";
import { WEB_FRAMEWORK_PACKAGE_JSON } from "@/lib/local-framework/web-framework-package";
import { syncWebSupportHelpersToDisk } from "@/lib/local-framework/sync-web-support-helpers";
import { readWebCoreFile } from "@/lib/local-framework/web-core-reader";

const WEB_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "preserveSymlinks": true,
    "types": ["node"]
  },
  "include": [
    "pageobjects/**/*.ts",
    "support/**/*.ts",
    "tests/**/*.ts",
    "utils/**/*.ts",
    "playwright.config.ts"
  ]
}
`;

const TEST_DATA_JSON = JSON.stringify(
  {
    users: {
      admin: { email: "admin@example.com", password: "Admin@123" },
      standard: { email: "user@example.com", password: "User@123" },
      readonly: { email: "viewer@example.com", password: "View@123" },
    },
    search: {
      validKeyword: "laptop",
      invalidKeyword: "xyznonexistent999",
    },
    products: [
      { name: "Sample Product 1", price: 29.99, sku: "PRD-001" },
      { name: "Sample Product 2", price: 49.99, sku: "PRD-002" },
    ],
    messages: {
      loginSuccess: "Welcome back!",
      loginFailed: "Invalid credentials",
      requiredField: "This field is required",
    },
  },
  null,
  2,
);

const WEB_GITIGNORE = `# Dependencies
node_modules/

# Playwright output
test-results/
playwright-report/
logs/*.json
logs/*.html
logs/*.zip

# Cloud execution — contain credentials, never commit
execution/.env.execution
browserstack.yml

# Recorder artifacts
.dom-captures/
`;

export async function writePlaywrightWebConfig(
  projectId: string,
  configJson: string | null,
): Promise<void> {
  const cfgPath = resolveFrameworkFilePath(projectId, "playwright.config.ts");
  if (cfgPath === null) return;
  await writeFile(cfgPath, buildPlaywrightWebConfig(configJson), "utf8");

  // Write environments/qa.json only if it doesn't exist yet — preserve user edits.
  const qaPath = resolveFrameworkFilePath(projectId, "environments/qa.json", "web");
  if (qaPath !== null) {
    await writeFile(qaPath, buildDefaultEnvironmentJson(configJson), { encoding: "utf8", flag: "wx" }).catch(
      () => undefined,
    );
  }
}

/** Scaffold a Playwright browser framework under frameworks/web/<projectId>/. */
export async function ensureWebFrameworkScaffold(params: {
  projectId: string;
  projectName: string;
  environmentConfigJson?: string | null;
}): Promise<void> {
  const root = getProjectFrameworkRoot(params.projectId, "web");

  // Create directory tree
  for (const dir of [
    "pageobjects", "support", "tests", "requirements",
    "test-plans", "test-cases", "environments",
    "logs", "utils", "testdata",
  ]) {
    await mkdir(path.join(root, dir), { recursive: true });
  }

  for (const dir of ["requirements", "test-plans", "test-cases"]) {
    await writeFile(path.join(root, dir, ".gitkeep"), "", { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }
  await writeFile(path.join(root, "logs", ".gitkeep"), "# Playwright test logs\n", {
    encoding: "utf8",
    flag: "wx",
  }).catch(() => undefined);

  const pkgPath      = resolveFrameworkFilePath(params.projectId, "package.json", "web");
  const tsPath       = resolveFrameworkFilePath(params.projectId, "tsconfig.json", "web");
  const cfgPath      = resolveFrameworkFilePath(params.projectId, "playwright.config.ts", "web");
  const fixturesPath = resolveFrameworkFilePath(params.projectId, "support/fixtures.ts", "web");
  const qaEnvPath    = resolveFrameworkFilePath(params.projectId, "environments/qa.json", "web");
  const dataUtilPath = resolveFrameworkFilePath(params.projectId, "utils/data-utils.ts", "web");
  const testDataPath = resolveFrameworkFilePath(params.projectId, "testdata/test-data.json", "web");
  const readmePath   = path.join(root, "README.md");
  const npmrcPath    = path.join(root, FRAMEWORK_NPMRC_FILENAME);
  const gitignorePath = path.join(root, ".gitignore");

  await writeFile(npmrcPath, FRAMEWORK_PROJECT_NPMRC, { encoding: "utf8" }).catch(() => undefined);

  // .gitignore — always refresh so it stays up to date
  await writeFile(gitignorePath, WEB_GITIGNORE, { encoding: "utf8" }).catch(() => undefined);

  if (pkgPath !== null) {
    await writeFile(pkgPath, WEB_FRAMEWORK_PACKAGE_JSON, { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }
  if (tsPath !== null) {
    await writeFile(tsPath, WEB_TSCONFIG, { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }

  // playwright.config.ts + environments/qa.json
  if (params.environmentConfigJson !== undefined && params.environmentConfigJson !== null) {
    await writePlaywrightWebConfig(params.projectId, params.environmentConfigJson);
  } else if (cfgPath !== null) {
    await writeFile(cfgPath, buildPlaywrightWebConfig(null), { encoding: "utf8", flag: "wx" }).catch(() => undefined);
    // qa.json — created once, preserves user edits on re-scaffold
    if (qaEnvPath !== null) {
      await writeFile(qaEnvPath, buildDefaultEnvironmentJson(null), { encoding: "utf8", flag: "wx" }).catch(
        () => undefined,
      );
    }
  }

  // Support stubs — thin re-exports pointing to @automation-ai/web-support (file: dep).
  // Always overwrite: these are platform-managed, not user-authored.
  await syncWebSupportHelpersToDisk(params.projectId);
  if (fixturesPath !== null) {
    await writeFile(
      fixturesPath,
      `export * from "@automation-ai/web-support/fixtures";\n`,
      { encoding: "utf8" },
    ).catch(() => undefined);
  }

  // Utility files — full copies so teams can extend them locally.
  const dataUtilsSource = await readWebCoreFile("utils/data-utils.ts");
  if (dataUtilPath !== null) {
    await writeFile(dataUtilPath, dataUtilsSource, { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }

  // Test data JSON — created once so teams can populate it
  if (testDataPath !== null) {
    await writeFile(testDataPath, TEST_DATA_JSON + "\n", { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }

  await writeFile(
    readmePath,
    [
      `# ${params.projectName} — Playwright web framework`,
      "",
      "Generated and maintained by Automation AI.",
      "",
      "## Quick start",
      "",
      "```bash",
      "npm install",
      "npm test                      # uses environments/qa.json",
      "TEST_ENV=staging npm test     # uses environments/staging.json",
      "```",
      "",
      "## Environments",
      "",
      "All run-time settings live in `environments/<name>.json`.",
      "The active environment is selected by the `TEST_ENV` shell variable (default: `qa`).",
      "",
      "Edit `environments/qa.json` to match your test target:",
      "",
      "| Key             | Default                  | Description                              |",
      "| --------------- | ------------------------ | ---------------------------------------- |",
      "| `baseURL`       | https://example.com      | Application under test                   |",
      "| `username`      | admin@example.com        | Login credential (used in tests via testData) |",
      "| `password`      | changeme                 | Login credential                         |",
      "| `browser`       | chromium                 | chromium \\| firefox \\| webkit           |",
      "| `headless`      | true                     | Run without visible browser              |",
      "| `timeout`       | 30000                    | Test timeout (ms)                        |",
      "| `actionTimeout` | 10000                    | Per-action timeout (ms)                  |",
      "| `retries`       | 0                        | Retries on failure                       |",
      "| `fullyParallel` | false                    | Run all tests in parallel                |",
      "| `workers`       | 1                        | Parallel workers                         |",
      "| `video`         | retain-on-failure        | off \\| on \\| retain-on-failure          |",
      "| `trace`         | retain-on-failure        | off \\| on \\| retain-on-failure          |",
      "| `screenshot`    | only-on-failure          | off \\| on \\| only-on-failure            |",
      "",
      "## Layout",
      "",
      "| Path | Purpose |",
      "| ---- | ------- |",
      "| `pageobjects/` | Page-object classes |",
      "| `support/fixtures.ts` | Re-exports `test` from `@automation-ai/web-support` |",
      "| `support/web-locate.ts` | Re-exports locator helpers from `@automation-ai/web-support` |",
      "| `support/web-actions.ts` | Re-exports action helpers from `@automation-ai/web-support` |",
      "| `tests/` | Executable Playwright specs |",
      "| `utils/data-utils.ts` | Random data generators (faker) |",
      "| `testdata/test-data.json` | Static test fixtures |",
      "| `environments/qa.json` | Default QA environment config |",
      "| `playwright.config.ts` | Runner config — reads from `environments/<TEST_ENV>.json` |",
      "| `logs/` | JSON + HTML reports |",
      "",
      "## Using random data in tests",
      "",
      "```typescript",
      `import { dataUtils } from "../utils/data-utils.js";`,
      "",
      "const email    = dataUtils.email();",
      "const password = dataUtils.password(16);",
      "const name     = dataUtils.fullName();",
      "```",
      "",
      "## Using static test data",
      "",
      "```typescript",
      `import testData from "../testdata/test-data.json" assert { type: "json" };`,
      "",
      "const { email, password } = testData.users.admin;",
      "```",
      "",
      "## Reading env config in tests",
      "",
      "```typescript",
      `import { readFileSync } from "node:fs";`,
      `import path from "node:path";`,
      `import { fileURLToPath } from "node:url";`,
      "",
      `const __dirname = path.dirname(fileURLToPath(import.meta.url));`,
      `const env = JSON.parse(`,
      `  readFileSync(path.join(__dirname, "../environments/qa.json"), "utf8"),`,
      `);`,
      `// env.username, env.password, env.baseURL …`,
      "```",
      "",
      "## Record a page from the browser",
      "",
      "1. Set `baseURL` in `environments/qa.json`.",
      "2. In the UI **Browser recorder**, click **Open browser & capture**.",
      "3. Navigate, then **Resume** in the Playwright Inspector.",
      "4. Parse elements, name the page (e.g. Login), and save.",
      "",
    ].join("\n"),
    { encoding: "utf8" },
  ).catch(() => undefined);
}
