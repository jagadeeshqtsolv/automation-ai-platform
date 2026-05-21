import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { getProjectFrameworkRoot } from "@/lib/local-framework/paths";
import { getProjectPlatformType } from "@/lib/project-platform";
import { installFrameworkDependencies } from "@/lib/local-framework/install-dependencies";
import type {
  RunTestsLogCallbacks,
  RunTestsOptions,
  RunTestsParams,
  RunTestsResult,
} from "@/lib/test-execution/run-tests";
import { writePlaywrightWebConfig } from "@/lib/local-framework/web-scaffold";
import { syncWebSupportHelpersToDisk } from "@/lib/local-framework/sync-web-support-helpers";
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

  await mkdir(path.join(root, "logs"), { recursive: true });

  const args = ["playwright", "test", ...params.specPaths];
  if (params.grep !== undefined && params.grep.length > 0) {
    args.push("--grep", params.grep);
  }

  const command = `npx ${args.map(shellQuoteArg).join(" ")}`;
  log(`\n$ ${command}\n\n`);

  const env: NodeJS.ProcessEnv = { ...process.env };
  env.AUTOM_EXECUTION_PROVIDER = params.config.provider;

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
