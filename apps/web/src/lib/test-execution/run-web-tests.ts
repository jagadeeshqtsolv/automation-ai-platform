import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { getProjectPlatformType } from "@/lib/project-platform";
import { installFrameworkDependencies, ensurePlaywrightBrowsersForProject } from "@/lib/local-framework/install-dependencies";
import type {
  RunTestsLogCallbacks,
  RunTestsOptions,
  RunTestsParams,
  RunTestsResult,
} from "@/lib/test-execution/run-tests";
import { writePlaywrightWebConfig } from "@/lib/local-framework/web-scaffold";
import { syncWebSupportHelpersToDisk } from "@/lib/local-framework/sync-web-support-helpers";
import { writeExecutionArtifacts } from "@/lib/test-execution/write-execution-artifacts";
import { spawnTrackedTestProcess } from "@/lib/test-execution/spawn-tracked-test-process";

/** Run Playwright browser tests for a web project (`frameworks/web/<id>/`). */
export async function runWebProjectTests(
  params: RunTestsParams,
  callbacks?: RunTestsLogCallbacks,
  options?: RunTestsOptions,
): Promise<RunTestsResult> {
  const log = (chunk: string): void => {
    callbacks?.onLog(chunk);
  };

  const platform = await getProjectPlatformType(params.projectId);
  const root = getProjectFrameworkRoot(params.projectId, platform);

  try {
    await access(path.join(root, "package.json"));
  } catch {
    const message =
      "Web framework package.json not found. Create a web project and ensure the framework folder exists.\n";
    log(message);
    return {
      ok: false,
      exitCode: null,
      output: message,
      provider: params.config.provider,
      command: "",
    };
  }

  await syncWebSupportHelpersToDisk(params.projectId);

  log("Syncing playwright.config.ts (video + trace on failure)…\n");
  await writePlaywrightWebConfig(params.projectId, params.environmentConfigJson);

  // Write the user-selected environment's config directly to environments/<slug>.json
  // so playwright.config.ts loads all user-defined values (workers, retries, browser,
  // video, trace, screenshot, etc.) from the environment configured in the UI.
  if (params.environmentSlug && params.environmentConfigJson) {
    const envFilePath = resolveFrameworkFilePath(
      params.projectId,
      `environments/${params.environmentSlug}.json`,
      "web",
    );
    if (envFilePath !== null) {
      await writeFile(envFilePath, params.environmentConfigJson, "utf8");
    }
  }

  log("Preparing execution config…\n");
  await writeExecutionArtifacts({
    projectId: params.projectId,
    platformType: "web",
    config: params.config,
    environmentConfigJson: params.environmentConfigJson,
    secrets: params.secrets,
  });

  log("Installing dependencies (npm install)…\n");
  const install = await installFrameworkDependencies(params.projectId);
  if (!install.ok) {
    const message = `${install.error ?? "npm install failed"}\n`;
    log(message);
    return {
      ok: false,
      exitCode: null,
      output: message,
      provider: params.config.provider,
      command: "",
    };
  }

  if (params.config.provider === "local") {
    log("Installing Playwright browsers…\n");
    await ensurePlaywrightBrowsersForProject(params.projectId).catch(() => undefined);
  }

  await mkdir(path.join(root, "logs"), { recursive: true });
  // BrowserStack SDK writes test observability details here — must exist before run
  await mkdir(path.join(root, "log", ".obs_test_details-default"), { recursive: true });

  // Build env: start from process env, then layer in execution/.env.execution
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.AUTOM_EXECUTION_PROVIDER = params.config.provider;
  if (params.environmentSlug) {
    env.TEST_ENV = params.environmentSlug;
    env.AUTOM_ENVIRONMENT = params.environmentSlug;
  }

  // Point BrowserStack SDK directly to the existing CLI binary, bypassing the
  // update-check API call that fails when auth credentials aren't yet resolved.
  if (params.config.provider === "browserstack" && !env.SDK_CLI_BIN_PATH) {
    const bsCliDir = process.env.BROWSERSTACK_FILES_DIR ?? path.join(os.homedir(), ".browserstack");
    const candidates = [
      path.join(bsCliDir, "cli", `binary-${process.platform === "darwin" ? "macos" : process.platform}-${process.arch}`),
      path.join(bsCliDir, "cli", `binary-${process.platform}-${process.arch}`),
    ];
    for (const candidate of candidates) {
      try {
        await access(candidate);
        env.SDK_CLI_BIN_PATH = candidate;
        break;
      } catch { /* not found */ }
    }
  }

  const envFile = resolveFrameworkFilePath(params.projectId, "execution/.env.execution", "web");
  if (envFile !== null) {
    try {
      const content = await readFile(envFile, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
      }
    } catch {
      // no env file — local run, fine
    }
  }

  // BrowserStack web: run through the BrowserStack SDK which reads browserstack.yml
  // and routes all Playwright sessions to the BrowserStack Automate grid.
  const isBrowserStack = params.config.provider === "browserstack";
  const args = isBrowserStack
    ? ["browserstack-node-sdk", "playwright", "test", ...params.specPaths]
    : ["playwright", "test", ...params.specPaths];

  if (params.grep !== undefined && params.grep.length > 0) {
    args.push("--grep", params.grep);
  }

  const command = `npx ${args.map(shellQuoteArg).join(" ")}`;
  log(`\n$ ${command}\n\n`);

  if (options?.runId === undefined) {
    throw new Error("runId is required for tracked test execution");
  }

  return spawnTrackedTestProcess({
    runId: options.runId,
    cwd: root,
    env,
    args,
    command,
    provider: params.config.provider,
    onLog: log,
  });
}

function shellQuoteArg(value: string): string {
  if (value.length === 0) {
    return '""';
  }
  if (!/[\s"'`\\$]/.test(value)) {
    return value;
  }
  return '"' + value.replace(/["\\$`]/g, "\\$&") + '"';
}
