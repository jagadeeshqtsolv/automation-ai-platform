import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExecutionConfig } from "@automation-ai/shared";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import {
  buildMobilewrightConfig,
  DEFAULT_MOBILEWRIGHT_REPORTER_CONFIG,
  DEFAULT_MOBILEWRIGHT_USE_LINES,
} from "@/lib/mobilewright-environment-config";
import { sauceHubHostname } from "@/lib/execution-config";

export async function writeExecutionArtifacts(params: {
  projectId: string;
  config: ExecutionConfig;
  environmentConfigJson: string | null;
  secrets: {
    saucelabsAccessKey?: string | null;
    browserstackAccessKey?: string | null;
    lambdatestAccessKey?: string | null;
  };
}): Promise<void> {
  const executionDir = resolveFrameworkFilePath(params.projectId, "execution");
  if (executionDir === null) {
    return;
  }
  await mkdir(executionDir, { recursive: true });

  const snapshot = {
    provider: params.config.provider,
    saucelabs: params.config.saucelabs ?? null,
    browserstack: params.config.browserstack ?? null,
    lambdatest: params.config.lambdatest ?? null,
    custom: params.config.custom ?? null,
    updatedAt: new Date().toISOString(),
  };

  await writeFile(path.join(executionDir, "config.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  const executionConfigPath = resolveFrameworkFilePath(params.projectId, "mobilewright.execution.config.ts");
  if (executionConfigPath !== null) {
    await writeFile(executionConfigPath, buildExecutionMobilewrightConfig(params), "utf8");
  }

  const envPath = resolveFrameworkFilePath(params.projectId, "execution/.env.execution");
  if (envPath !== null) {
    await writeFile(envPath, buildExecutionEnvFile(params), "utf8");
  }
}

function buildExecutionEnvFile(params: {
  config: ExecutionConfig;
  secrets: {
    saucelabsAccessKey?: string | null;
    browserstackAccessKey?: string | null;
    lambdatestAccessKey?: string | null;
  };
}): string {
  const lines = [`AUTOM_EXECUTION_PROVIDER=${params.config.provider}`];

  if (params.config.provider === "saucelabs" && params.config.saucelabs !== undefined) {
    const s = params.config.saucelabs;
    lines.push(`SAUCE_USERNAME=${s.username}`);
    if (params.secrets.saucelabsAccessKey !== null && params.secrets.saucelabsAccessKey !== undefined) {
      lines.push(`SAUCE_ACCESS_KEY=${params.secrets.saucelabsAccessKey}`);
    }
    lines.push(`SAUCE_REGION=${s.region}`);
    if (s.deviceName !== undefined) {
      lines.push(`SAUCE_DEVICE_NAME=${s.deviceName}`);
    }
    if (s.platformVersion !== undefined) {
      lines.push(`SAUCE_PLATFORM_VERSION=${s.platformVersion}`);
    }
    if (s.app !== undefined) {
      lines.push(`SAUCE_APP=${s.app}`);
    }
    if (s.buildName !== undefined) {
      lines.push(`SAUCE_BUILD=${s.buildName}`);
    }
    lines.push(`SAUCE_HUB_HOST=${sauceHubHostname(s.region)}`);
  }

  if (params.config.provider === "browserstack" && params.config.browserstack !== undefined) {
    const b = params.config.browserstack;
    lines.push(`BROWSERSTACK_USERNAME=${b.username}`);
    if (params.secrets.browserstackAccessKey !== null && params.secrets.browserstackAccessKey !== undefined) {
      lines.push(`BROWSERSTACK_ACCESS_KEY=${params.secrets.browserstackAccessKey}`);
    }
  }

  if (params.config.provider === "lambdatest" && params.config.lambdatest !== undefined) {
    const l = params.config.lambdatest;
    lines.push(`LT_USERNAME=${l.username}`);
    if (params.secrets.lambdatestAccessKey !== null && params.secrets.lambdatestAccessKey !== undefined) {
      lines.push(`LT_ACCESS_KEY=${params.secrets.lambdatestAccessKey}`);
    }
  }

  if (params.config.provider === "custom" && params.config.custom !== undefined) {
    lines.push(`AUTOM_CUSTOM_HUB_URL=${params.config.custom.hubUrl}`);
  }

  return `${lines.join("\n")}\n`;
}

function buildExecutionMobilewrightConfig(params: {
  config: ExecutionConfig;
  environmentConfigJson: string | null;
}): string {
  const base = buildMobilewrightConfig(params.environmentConfigJson);
  const provider = params.config.provider;

  if (provider === "local") {
    return [
      `import { defineConfig } from "mobilewright";`,
      ``,
      `// Execution: local — uses device/simulator from mobilewright.config.ts`,
      base.trimStart().replace(/^import \{ defineConfig \} from "mobilewright";\n?/, ""),
    ].join("\n");
  }

  if (provider === "saucelabs" && params.config.saucelabs !== undefined) {
    const s = params.config.saucelabs;
    const platform = params.environmentConfigJson?.includes('"android"') ? "android" : "ios";
    return [
      `import { defineConfig } from "mobilewright";`,
      ``,
      `/** Generated for Sauce Labs — credentials via execution/.env.execution */`,
      `export default defineConfig({`,
      `  platform: "${platform}",`,
      `  bundleId: process.env.SAUCE_BUNDLE_ID ?? "com.example.app",`,
      `  deviceName: /${escapeRegExp(s.deviceName ?? "iPhone")}/,`,
      `  timeout: 120_000,`,
      `  retries: 0,`,
      `  workers: 1,`,
      ...DEFAULT_MOBILEWRIGHT_USE_LINES,
      `  reporter: ${DEFAULT_MOBILEWRIGHT_REPORTER_CONFIG},`,
      `  globalSetup: "./execution/sauce-global-setup.mjs",`,
      `});`,
      ``,
    ].join("\n");
  }

  if (provider === "browserstack" && params.config.browserstack !== undefined) {
    return [
      `import { defineConfig } from "mobilewright";`,
      ``,
      `export default defineConfig({`,
      `  timeout: 120_000,`,
      `  workers: 1,`,
      ...DEFAULT_MOBILEWRIGHT_USE_LINES,
      `  reporter: ${DEFAULT_MOBILEWRIGHT_REPORTER_CONFIG},`,
      `  globalSetup: "./execution/browserstack-global-setup.mjs",`,
      `});`,
      ``,
    ].join("\n");
  }

  if (provider === "lambdatest" && params.config.lambdatest !== undefined) {
    return [
      `import { defineConfig } from "mobilewright";`,
      ``,
      `export default defineConfig({`,
      `  timeout: 120_000,`,
      `  workers: 1,`,
      ...DEFAULT_MOBILEWRIGHT_USE_LINES,
      `  reporter: ${DEFAULT_MOBILEWRIGHT_REPORTER_CONFIG},`,
      `  globalSetup: "./execution/lambdatest-global-setup.mjs",`,
      `});`,
      ``,
    ].join("\n");
  }

  return [
    `import { defineConfig } from "mobilewright";`,
    ``,
    `export default defineConfig({`,
    `  timeout: 120_000,`,
    `  workers: 1,`,
    ...DEFAULT_MOBILEWRIGHT_USE_LINES,
    `  reporter: ${DEFAULT_MOBILEWRIGHT_REPORTER_CONFIG},`,
    `  globalSetup: "./execution/custom-global-setup.mjs",`,
    `});`,
    ``,
  ].join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function ensureExecutionSetupScripts(projectId: string): Promise<void> {
  const root = getProjectFrameworkRoot(projectId);
  const executionDir = path.join(root, "execution");
  await mkdir(executionDir, { recursive: true });

  const sauceSetup = `/**
 * Validates Sauce Labs credentials before Mobilewright runs.
 * Set SAUCE_USERNAME and SAUCE_ACCESS_KEY in execution/.env.execution (generated by AutomationAI).
 */
export default async function globalSetup() {
  const user = process.env.SAUCE_USERNAME;
  const key = process.env.SAUCE_ACCESS_KEY;
  if (!user || !key) {
    throw new Error("Sauce Labs: SAUCE_USERNAME and SAUCE_ACCESS_KEY are required.");
  }
  const host = process.env.SAUCE_HUB_HOST ?? "ondemand.us-west-1.saucelabs.com";
  const url = \`https://\${user}:\${key}@\${host}/wd/hub/status\`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(\`Sauce Labs hub unreachable (\${res.status}). Check credentials and region.\`);
  }
}
`;

  await writeFile(path.join(executionDir, "sauce-global-setup.mjs"), sauceSetup, "utf8");

  const passthrough = `/** Provider hook — extend for BrowserStack / LambdaTest / custom hubs. */
export default async function globalSetup() {
  if (process.env.AUTOM_EXECUTION_PROVIDER === "custom" && !process.env.AUTOM_CUSTOM_HUB_URL) {
    throw new Error("Custom hub: set AUTOM_CUSTOM_HUB_URL in execution config.");
  }
}
`;

  for (const name of ["browserstack-global-setup.mjs", "lambdatest-global-setup.mjs", "custom-global-setup.mjs"]) {
    const filePath = path.join(executionDir, name);
    await writeFile(filePath, passthrough, "utf8").catch(() => undefined);
  }
}
