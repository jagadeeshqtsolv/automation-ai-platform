import type { ProjectPlatformType } from "@automation-ai/core";

/** Runner config file name per platform (under framework root). */
export function testConfigFileName(platform: ProjectPlatformType): string {
  return platform === "web" ? "playwright.config.ts" : "mobilewright.config.ts";
}

/** Human-readable runner name for UI copy. */
export function testRunnerDisplayName(platform: ProjectPlatformType): string {
  return platform === "web" ? "Playwright" : "Mobilewright";
}

/** CLI used in `npx <cli> test`. */
export function testRunnerCli(platform: ProjectPlatformType): string {
  return platform === "web" ? "playwright" : "mobilewright";
}

/** HTML report folder name on disk after a run. */
export function htmlReportDirName(platform: ProjectPlatformType): string {
  return platform === "web" ? "playwright-report" : "mobilewright-report";
}

export function specFileHeader(platform: ProjectPlatformType): string {
  if (platform === "web") {
    return `import { test, expect } from '../support/fixtures';\n\n`;
  }
  return `import { test, expect } from '../support/fixtures';\nimport { sleep } from '@mobilewright/core';\n\n`;
}

export function codegenApiPath(platform: ProjectPlatformType): string {
  return platform === "web" ? "/api/generate/playwright" : "/api/generate/mobilewright";
}

export function defaultEnvironmentConfigJson(platform: ProjectPlatformType): string {
  if (platform === "web") {
    return JSON.stringify(
      {
        baseURL: "https://example.com",
        username: "admin@example.com",
        password: "changeme",
        browser: "chromium",
        headless: true,
        timeout: 30_000,
        actionTimeout: 10_000,
        retries: 0,
        fullyParallel: false,
        workers: 1,
        video: "retain-on-failure",
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
      },
      null,
      2,
    );
  }
  return JSON.stringify(
    {
      platform: "ios",
      bundleId: "com.example.app",
      deviceName: "iPhone",
      timeout: 30_000,
      autoAppLaunch: true,
      installApps: [],
    },
    null,
    2,
  );
}
