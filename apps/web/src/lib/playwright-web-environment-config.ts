/** Web Playwright config generation — parallel to mobilewright-environment-config.ts (mobile only). */

export const DEFAULT_PLAYWRIGHT_REPORTER_CONFIG = `[["list"], ["html", { open: "never" }], ["json", { outputFile: "logs/playwright-report.json" }]]`;

export type PlaywrightWebEnvironmentConfig = {
  baseURL?: string;
  browser?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
  timeout?: number;
  actionTimeout?: number;
  workers?: number;
  retries?: number;
  fullyParallel?: boolean;
  video?: "off" | "on" | "retain-on-failure" | "on-first-retry";
  trace?: "off" | "on" | "retain-on-failure" | "on-all-retries";
  screenshot?: "off" | "on" | "only-on-failure";
};

export const DEFAULT_WEB_ENVIRONMENT_CONFIG_JSON = JSON.stringify(
  {
    baseURL: "https://example.com",
    browser: "chromium",
    headless: true,
    timeout: 30_000,
    workers: 1,
    retries: 0,
    fullyParallel: false,
  } satisfies PlaywrightWebEnvironmentConfig,
  null,
  2,
);

const VIDEO_VALUES = new Set(["off", "on", "retain-on-failure", "on-first-retry"]);
const TRACE_VALUES = new Set(["off", "on", "retain-on-failure", "on-all-retries"]);
const SCREENSHOT_VALUES = new Set(["off", "on", "only-on-failure"]);

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
    if (typeof obj.workers === "number" && Number.isInteger(obj.workers) && obj.workers >= 1) {
      out.workers = obj.workers;
    }
    if (typeof obj.retries === "number" && Number.isInteger(obj.retries) && obj.retries >= 0) {
      out.retries = obj.retries;
    }
    if (typeof obj.fullyParallel === "boolean") {
      out.fullyParallel = obj.fullyParallel;
    }
    if (typeof obj.video === "string" && VIDEO_VALUES.has(obj.video)) {
      out.video = obj.video as PlaywrightWebEnvironmentConfig["video"];
    }
    if (typeof obj.trace === "string" && TRACE_VALUES.has(obj.trace)) {
      out.trace = obj.trace as PlaywrightWebEnvironmentConfig["trace"];
    }
    if (typeof obj.screenshot === "string" && SCREENSHOT_VALUES.has(obj.screenshot)) {
      out.screenshot = obj.screenshot as PlaywrightWebEnvironmentConfig["screenshot"];
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Generates `playwright.config.ts` content.
 * All run-time settings are read from `environments/<TEST_ENV>.json`
 * (defaulting to `environments/qa.json`).  Set the TEST_ENV shell variable
 * to switch environments:  TEST_ENV=staging npm test
 */
export function buildPlaywrightWebConfig(_configJson: string | null, storageStatePath?: string): string {
  const storageStateLine = storageStatePath
    ? `    storageState:  ${JSON.stringify(storageStatePath)},`
    : null;
  return ([
    `import { defineConfig, devices } from "@playwright/test";`,
    `import { readFileSync } from "node:fs";`,
    `import path from "node:path";`,
    ``,
    `// Select environment: TEST_ENV=staging npm test  (default: qa)`,
    `// AUTOM_ENVIRONMENT is set by the AutomationAI CI workflow.`,
    `const envName = process.env.TEST_ENV || process.env.AUTOM_ENVIRONMENT || "qa";`,
    ``,
    `let env: Record<string, unknown> = {};`,
    `try {`,
    `  env = JSON.parse(`,
    `    readFileSync(path.join(__dirname, "environments", \`\${envName}.json\`), "utf8"),`,
    `  ) as Record<string, unknown>;`,
    `} catch {`,
    `  console.warn(\`[playwright] environments/\${envName}.json not found — using built-in defaults\`);`,
    `}`,
    ``,
    `const browser = (String(env.browser ?? "chromium")) as "chromium" | "firefox" | "webkit";`,
    ``,
    `// Disable web security and sandbox restrictions in CI environments`,
    `const isCI = Boolean(process.env.CI);`,
    ``,
    `function browserDevice(b: "chromium" | "firefox" | "webkit") {`,
    `  switch (b) {`,
    `    case "firefox": return { ...devices["Desktop Firefox"] };`,
    `    case "webkit":  return { ...devices["Desktop Safari"] };`,
    `    default:        return { ...devices["Desktop Chrome"] };`,
    `  }`,
    `}`,
    ``,
    `export default defineConfig({`,
    `  testDir: "./tests",`,
    `  timeout:       Number(env.timeout       ?? 30000),`,
    `  retries:       Number(env.retries        ?? 0),`,
    `  fullyParallel: Boolean(env.fullyParallel ?? false),`,
    `  workers:       Number(env.workers        ?? 1),`,
    `  use: {`,
    storageStateLine,
    `    baseURL:       String(env.baseURL       ?? "https://example.com"),`,
    `    headless:      env.headless !== false,`,
    `    trace:         (String(env.trace        ?? "retain-on-failure")) as "off" | "on" | "retain-on-failure" | "on-all-retries",`,
    `    video:         (String(env.video        ?? "retain-on-failure")) as "off" | "on" | "retain-on-failure" | "on-first-retry",`,
    `    screenshot:    (String(env.screenshot   ?? "only-on-failure"))  as "off" | "on" | "only-on-failure",`,
    `    actionTimeout: Number(env.actionTimeout ?? 10000),`,
    `    launchOptions: {`,
    `      args: isCI`,
    `        ? [`,
    `            "--disable-web-security",`,
    `            "--no-sandbox",`,
    `            "--disable-setuid-sandbox",`,
    `            "--disable-dev-shm-usage",`,
    `            "--disable-gpu",`,
    `          ]`,
    `        : [],`,
    `    },`,
    `  },`,
    `  projects: [`,
    `    { name: browser, use: browserDevice(browser) },`,
    `  ],`,
    `  reporter: process.env.AUTOM_EXECUTION_PROVIDER === "browserstack"
    ? [["list"], ["json", { outputFile: "logs/playwright-report.json" }]]
    : ${DEFAULT_PLAYWRIGHT_REPORTER_CONFIG},`,
    `});`,
    ``,
  ] as (string | null)[]).filter((l): l is string => l !== null).join("\n");
}

/**
 * Patches an existing playwright.config.ts content to set (or clear) the
 * `storageState` property inside the `use: {}` block.
 * - If `storageStatePath` is provided, the line is added/replaced.
 * - If `storageStatePath` is null/undefined, the line is removed.
 * Falls back to a full regeneration when the file is unrecognisable.
 */
export function patchPlaywrightStorageState(
  existingContent: string,
  storageStatePath: string | null | undefined,
): string {
  const newLine = storageStatePath
    ? `    storageState:  ${JSON.stringify(storageStatePath)},`
    : null;

  // Remove any existing storageState line
  const withoutStorage = existingContent
    .split("\n")
    .filter((l) => !/^\s*storageState\s*:/.test(l))
    .join("\n");

  if (!newLine) return withoutStorage;

  // Insert after the `use: {` opening line
  const useLineIdx = withoutStorage.split("\n").findIndex((l) => /^\s*use\s*:\s*\{/.test(l));
  if (useLineIdx === -1) {
    // Can't find use block — fall back to full regen
    return buildPlaywrightWebConfig(null, storageStatePath ?? undefined);
  }

  const lines = withoutStorage.split("\n");
  lines.splice(useLineIdx + 1, 0, newLine);
  return lines.join("\n");
}

/**
 * Generates the content for `environments/qa.json` — the default environment
 * file that `playwright.config.ts` reads at runtime.  Seeded from configJson
 * when available so the values from Setup → Environments are preserved.
 */
export function buildDefaultEnvironmentJson(configJson: string | null): string {
  const cfg = parseWebEnvironmentConfig(configJson);
  return JSON.stringify(
    {
      // ── Application ──────────────────────────────────────────────────────────
      baseURL:       cfg.baseURL       ?? "https://example.com",
      username:      "admin@example.com",
      password:      "changeme",

      // ── Browser ──────────────────────────────────────────────────────────────
      // Options: chromium | firefox | webkit
      browser:       cfg.browser       ?? "chromium",

      // ── Run settings ─────────────────────────────────────────────────────────
      headless:      cfg.headless      ?? true,
      timeout:       cfg.timeout       ?? 30000,
      actionTimeout: cfg.actionTimeout ?? 10000,
      retries:       cfg.retries       ?? 0,
      fullyParallel: cfg.fullyParallel ?? false,
      workers:       cfg.workers       ?? 1,

      // ── Artifacts ────────────────────────────────────────────────────────────
      // video:      off | on | retain-on-failure | on-first-retry
      video:         cfg.video         ?? "retain-on-failure",
      // trace:      off | on | retain-on-failure | on-all-retries
      trace:         cfg.trace         ?? "retain-on-failure",
      // screenshot: off | on | only-on-failure
      screenshot:    cfg.screenshot    ?? "only-on-failure",
    },
    null,
    2,
  ) + "\n";
}
