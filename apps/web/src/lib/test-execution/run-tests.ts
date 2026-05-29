import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ExecutionConfig } from "@jagadeeshqtsolv/core";
import { getProjectFrameworkRoot } from "@/lib/local-framework/paths";
import { installFrameworkDependencies } from "@/lib/local-framework/install-dependencies";
import {
  ensureExecutionSetupScripts,
  writeExecutionArtifacts,
} from "@/lib/test-execution/write-execution-artifacts";
import { ensureMobilecliForTestRun } from "@/lib/test-execution/ensure-mobilecli";
import { writeMobilewrightConfig } from "@/lib/local-framework/scaffold";
import { getProjectPlatformType } from "@/lib/project-platform";
import { spawnTrackedTestProcess } from "@/lib/test-execution/spawn-tracked-test-process";
import { runWebProjectTests } from "@/lib/test-execution/run-web-tests";

export type RunTestsParams = {
  projectId: string;
  config: ExecutionConfig;
  environmentConfigJson: string | null;
  secrets: {
    saucelabsAccessKey?: string | null;
    browserstackAccessKey?: string | null;
    lambdatestAccessKey?: string | null;
  };
  specPaths: string[];
  grep?: string;
};

export type RunTestsResult = {
  ok: boolean;
  exitCode: number | null;
  output: string;
  provider: string;
  command: string;
  cancelled?: boolean;
};

export type RunTestsOptions = {
  runId: string;
};

export type RunTestsLogCallbacks = {
  onLog: (chunk: string) => void;
};

export async function runProjectTests(
  params: RunTestsParams,
  callbacks?: RunTestsLogCallbacks,
  options?: RunTestsOptions,
): Promise<RunTestsResult> {
  const platform = await getProjectPlatformType(params.projectId);
  if (platform === "web") {
    return runWebProjectTests(params, callbacks, options);
  }

  const log = (chunk: string): void => {
    callbacks?.onLog(chunk);
  };

  const root = getProjectFrameworkRoot(params.projectId, "mobile");

  try {
    await access(path.join(root, "package.json"));
  } catch {
    const message =
      "Framework package.json not found. Generate tests and ensure the framework folder exists.\n";
    log(message);
    return {
      ok: false,
      exitCode: null,
      output: message,
      provider: params.config.provider,
      command: "",
    };
  }

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

  log("Syncing mobilewright.config.ts (video + trace on failure)…\n");
  await writeMobilewrightConfig(params.projectId, params.environmentConfigJson);

  log("Preparing execution config…\n");
  await ensureExecutionSetupScripts(params.projectId);
  await writeExecutionArtifacts({
    projectId: params.projectId,
    config: params.config,
    environmentConfigJson: params.environmentConfigJson,
    secrets: params.secrets,
  });

  await mkdir(path.join(root, "logs"), { recursive: true });

  if (params.config.provider === "local") {
    log("Starting mobilecli (device bridge)…\n");
    const mobilecli = await ensureMobilecliForTestRun(params.projectId);
    if (!mobilecli.ok) {
      log(`${mobilecli.message}\n`);
      return {
        ok: false,
        exitCode: null,
        output: mobilecli.message,
        provider: params.config.provider,
        command: "",
      };
    }
    log(`${mobilecli.message}\n`);
  }

  const env = await buildRunEnv(params);
  const configFlag = params.config.provider === "local" ? [] : ["-c", "mobilewright.execution.config.ts"];
  const args = ["mobilewright", "test", ...configFlag, ...params.specPaths];
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

async function buildRunEnv(params: RunTestsParams): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.AUTOM_EXECUTION_PROVIDER = params.config.provider;

  const envFile = path.join(getProjectFrameworkRoot(params.projectId), "execution", ".env.execution");
  try {
    const content = await readFile(envFile, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1);
      env[key] = value;
    }
  } catch {
    // no env file
  }

  if (params.environmentConfigJson !== null) {
    try {
      const cfg = JSON.parse(params.environmentConfigJson) as { bundleId?: string };
      if (typeof cfg.bundleId === "string") {
        env.SAUCE_BUNDLE_ID = cfg.bundleId;
      }
    } catch {
      // ignore
    }
  }

  return env;
}
