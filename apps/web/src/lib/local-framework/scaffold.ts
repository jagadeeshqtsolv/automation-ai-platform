import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { FRAMEWORK_PACKAGE_JSON } from "@/lib/local-framework/framework-package";
import { buildMobilewrightConfig } from "@/lib/mobilewright-environment-config";
import { LOCATE_HELPER_SOURCE } from "@/lib/screen-codegen/locate-helper";
import { MOBILE_ACTIONS_HELPER_SOURCE } from "@/lib/screen-codegen/actions-helper";

export { buildMobilewrightConfig } from "@/lib/mobilewright-environment-config";

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["pageobjects/**/*.ts", "support/**/*.ts", "tests/**/*.ts", "mobilewright.config.ts"]
}
`;

const CAPTURE_SCRIPT = `import { ios, android, loadConfig } from "mobilewright";
import { writeFileSync } from "node:fs";

const config = await loadConfig();
const platform = config.platform ?? "ios";
const launcher = platform === "android" ? android : ios;

const device = await launcher.launch({
  bundleId: config.bundleId,
  deviceName: config.deviceName,
  timeout: config.timeout ?? 30_000,
});

const tree = await device.screen.viewTree();
const payload = {
  capturedAt: new Date().toISOString(),
  platform,
  bundleId: config.bundleId,
  nodes: tree,
};

const outFile = "environments/latest-view-tree.json";
writeFileSync(outFile, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
await device.close();
`;

/** Overwrite mobilewright.config.ts from environment JSON (DB or API). */
export async function writeMobilewrightConfig(
  projectId: string,
  configJson: string | null,
): Promise<void> {
  const cfgPath = resolveFrameworkFilePath(projectId, "mobilewright.config.ts");
  if (cfgPath === null) {
    return;
  }
  await writeFile(cfgPath, buildMobilewrightConfig(configJson), "utf8");
}

export async function ensureFrameworkScaffold(params: {
  projectId: string;
  projectName: string;
  environmentConfigJson?: string | null;
}): Promise<void> {
  const root = getProjectFrameworkRoot(params.projectId);
  await mkdir(path.join(root, "pageobjects"), { recursive: true });
  await mkdir(path.join(root, "support"), { recursive: true });
  await mkdir(path.join(root, "scripts"), { recursive: true });
  await mkdir(path.join(root, "tests"), { recursive: true });
  await mkdir(path.join(root, "requirements"), { recursive: true });
  await mkdir(path.join(root, "test-plans"), { recursive: true });
  await mkdir(path.join(root, "test-cases"), { recursive: true });
  await mkdir(path.join(root, "environments"), { recursive: true });
  await mkdir(path.join(root, "logs"), { recursive: true });
  for (const dir of ["requirements", "test-plans", "test-cases"]) {
    await writeFile(path.join(root, dir, ".gitkeep"), "", { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }
  const logsKeep = path.join(root, "logs", ".gitkeep");
  await writeFile(logsKeep, "# Test runs and device capture logs\n", { encoding: "utf8", flag: "wx" }).catch(() => undefined);

  const locatePath = resolveFrameworkFilePath(params.projectId, "support/locate.ts");
  const actionsPath = resolveFrameworkFilePath(params.projectId, "support/actions.ts");
  const capturePath = resolveFrameworkFilePath(params.projectId, "scripts/capture-view-tree.mjs");

  const pkgPath = resolveFrameworkFilePath(params.projectId, "package.json");
  const tsPath = resolveFrameworkFilePath(params.projectId, "tsconfig.json");
  const cfgPath = resolveFrameworkFilePath(params.projectId, "mobilewright.config.ts");
  const readmePath = path.join(root, "README.md");

  if (pkgPath !== null) {
    await writeFile(pkgPath, FRAMEWORK_PACKAGE_JSON, { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }
  if (tsPath !== null) {
    await writeFile(tsPath, TSCONFIG, { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }
  if (params.environmentConfigJson !== undefined && params.environmentConfigJson !== null) {
    await writeMobilewrightConfig(params.projectId, params.environmentConfigJson);
  } else if (cfgPath !== null) {
    await writeFile(cfgPath, buildMobilewrightConfig(null), {
      encoding: "utf8",
      flag: "wx",
    }).catch(() => undefined);
  }
  if (locatePath !== null) {
    await writeFile(locatePath, LOCATE_HELPER_SOURCE, { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }
  if (actionsPath !== null) {
    await writeFile(actionsPath, MOBILE_ACTIONS_HELPER_SOURCE, { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }
  if (capturePath !== null) {
    await writeFile(capturePath, CAPTURE_SCRIPT, { encoding: "utf8", flag: "wx" }).catch(() => undefined);
  }

  await writeFile(
    readmePath,
    [
      `# ${params.projectName} — Mobilewright framework`,
      "",
      "Generated and maintained by Automation AI.",
      "",
      "## Layout",
      "",
      "- `pageobjects/` — One class per screen: `private static readonly L` (locators) + methods",
      "- `support/locate.ts` — Resolves locator strategy → Mobilewright API",
      "- `support/actions.ts` — Shared tap/fill/visibility helpers for flaky UI",
      "- `tests/` — Executable specs (one `<requirement-slug>.spec.ts` per requirement)",
      "- `requirements/` — Requirement records (JSON)",
      "- `test-plans/` — Generated test plans (JSON)",
      "- `test-cases/` — Individual test cases extracted from plans (JSON)",
      "- `environments/` — Per-environment JSON config",
      "- `scripts/capture-view-tree.mjs` — Dump live accessibility tree from device",
      "- `logs/` — Test run output and capture logs",
      "",
      "## Record a screen from device",
      "",
      "1. Add an environment in the UI **Setup** tab (platform, bundleId, deviceName, etc.).",
      "2. Select that environment when generating tests — it updates `mobilewright.config.ts`.",
      "3. Open the app on simulator/emulator to the screen you want.",
      "4. Run (dependencies install automatically when the project is created):",
      "",
      "```bash",
      "npm run capture:tree",
      "```",
      "",
      "5. Paste the JSON output into the UI **Device recorder** and save the screen.",
      "",
      "## Run tests",
      "",
      "```bash",
      "npm run doctor",
      "npm test",
      "```",
      "",
    ].join("\n"),
    { encoding: "utf8" },
  ).catch(() => undefined);
}

export async function writeEnvironmentSnapshot(params: {
  projectId: string;
  slug: string;
  configJson: string;
}): Promise<void> {
  const safeSlug = params.slug.replace(/[^a-z0-9-]/g, "");
  if (safeSlug.length === 0) return;

  const rel = `environments/${safeSlug}.json`;
  const abs = resolveFrameworkFilePath(params.projectId, rel);
  if (abs === null) return;

  await mkdir(path.dirname(abs), { recursive: true });
  let body = params.configJson.trim();
  try {
    const parsed: unknown = JSON.parse(body);
    body = JSON.stringify(parsed, null, 2);
  } catch {
    body = params.configJson.trim();
  }
  await writeFile(abs, `${body}\n`, "utf8");
}
