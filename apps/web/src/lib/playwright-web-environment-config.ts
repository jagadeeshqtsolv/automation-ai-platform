/** Web Playwright config generation — parallel to mobilewright-environment-config.ts (mobile only). */

export const DEFAULT_PLAYWRIGHT_REPORTER_CONFIG = `[["list"], ["html", { open: "never" }], ["json", { outputFile: "logs/playwright-report.json" }]]`;

/** Playwright `use` options: trace + video retained on failure (HTML report attachments). */
export const DEFAULT_PLAYWRIGHT_USE_LINES = [
  `    trace: "retain-on-failure",`,
  `    video: "retain-on-failure",`,
  `    screenshot: "only-on-failure",`,
] as const;

export type PlaywrightWebEnvironmentConfig = {
  baseURL?: string;
  browser?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
  timeout?: number;
  actionTimeout?: number;
};

export const DEFAULT_WEB_ENVIRONMENT_CONFIG_JSON = JSON.stringify(
  {
    baseURL: "https://example.com",
    browser: "chromium",
    headless: true,
    timeout: 30_000,
  } satisfies PlaywrightWebEnvironmentConfig,
  null,
  2,
);

export function parseWebEnvironmentConfig(configJson: string | null): PlaywrightWebEnvironmentConfig {
  if (configJson === null || configJson.trim().length === 0) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(configJson);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const obj = parsed as Record<string, unknown>;
    const out: PlaywrightWebEnvironmentConfig = {};
    if (typeof obj.baseURL === "string" && obj.baseURL.trim().length > 0) {
      out.baseURL = obj.baseURL.trim();
    }
    if (obj.browser === "chromium" || obj.browser === "firefox" || obj.browser === "webkit") {
      out.browser = obj.browser;
    }
    if (typeof obj.headless === "boolean") {
      out.headless = obj.headless;
    }
    if (typeof obj.timeout === "number" && Number.isFinite(obj.timeout)) {
      out.timeout = obj.timeout;
    }
    if (typeof obj.actionTimeout === "number" && Number.isFinite(obj.actionTimeout)) {
      out.actionTimeout = obj.actionTimeout;
    }
    return out;
  } catch {
    return {};
  }
}

function escapeTsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function browserDeviceExpr(browser: PlaywrightWebEnvironmentConfig["browser"]): string {
  switch (browser) {
    case "firefox":
      return `{ ...devices["Desktop Firefox"] }`;
    case "webkit":
      return `{ ...devices["Desktop Safari"] }`;
    default:
      return `{ ...devices["Desktop Chrome"] }`;
  }
}

export function buildPlaywrightWebConfig(configJson: string | null): string {
  const cfg = parseWebEnvironmentConfig(configJson);
  const baseURL = cfg.baseURL ?? "https://example.com";
  const browser = cfg.browser ?? "chromium";
  const headless = cfg.headless !== false;
  const timeout = cfg.timeout ?? 30_000;
  const device = browserDeviceExpr(browser);

  const lines: string[] = [
    `import { defineConfig, devices } from "@playwright/test";`,
    ``,
    `export default defineConfig({`,
    `  testDir: "./tests",`,
    `  timeout: ${timeout},`,
    `  fullyParallel: false,`,
    `  workers: 1,`,
    `  use: {`,
    `    baseURL: "${escapeTsString(baseURL)}",`,
    `    headless: ${headless},`,
    ...DEFAULT_PLAYWRIGHT_USE_LINES,
  ];
  if (cfg.actionTimeout !== undefined) {
    lines.push(`    actionTimeout: ${cfg.actionTimeout},`);
  }
  lines.push(`  },`);
  lines.push(`  projects: [`);
  lines.push(`    {`);
  lines.push(`      name: "${browser}",`);
  lines.push(`      use: ${device},`);
  lines.push(`    },`);
  lines.push(`  ],`);
  lines.push(`  reporter: ${DEFAULT_PLAYWRIGHT_REPORTER_CONFIG},`);
  lines.push(`});`, ``);
  return lines.join("\n");
}
