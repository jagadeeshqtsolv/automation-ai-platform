/** Default reporters: terminal list + HTML report + JSON file for execution analysis (logs/playwright-report.json). */
export const DEFAULT_MOBILEWRIGHT_REPORTER_CONFIG = `[["list"], ["html", { open: "never" }], ["json", { outputFile: "logs/playwright-report.json" }]]`;

/** Playwright `use` options: device screen recording + trace viewer artifacts on failed tests only. */
export const DEFAULT_MOBILEWRIGHT_USE_LINES = [
  `  use: {`,
  `    trace: "retain-on-failure",`,
  `    video: "retain-on-failure",`,
  `  },`,
] as const;

/** Fields map to [Mobilewright config](https://mobilewright.dev/docs/test/fixtures) / defineConfig. */
export type MobilewrightEnvironmentConfig = {
  platform?: "ios" | "android";
  bundleId?: string;
  deviceId?: string;
  deviceName?: string;
  installApps?: string[];
  autoAppLaunch?: boolean;
  timeout?: number;
  actionTimeout?: number;
  /** App-specific; not written to mobilewright.config.ts */
  deepLinkPrefix?: string;
};

export const DEFAULT_ENVIRONMENT_CONFIG_JSON = JSON.stringify(
  {
    platform: "ios",
    bundleId: "com.example.app",
    deviceName: "iPhone",
    timeout: 30_000,
    autoAppLaunch: true,
    installApps: [],
  } satisfies MobilewrightEnvironmentConfig,
  null,
  2,
);

export function parseEnvironmentConfig(configJson: string | null): MobilewrightEnvironmentConfig {
  if (configJson === null || configJson.trim().length === 0) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(configJson);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const obj = parsed as Record<string, unknown>;
    const out: MobilewrightEnvironmentConfig = {};

    if (obj.platform === "ios" || obj.platform === "android") {
      out.platform = obj.platform;
    }
    const bundleIdRaw = obj.bundleId ?? obj.appPackage;
    if (typeof bundleIdRaw === "string" && bundleIdRaw.trim().length > 0) {
      out.bundleId = bundleIdRaw.trim();
    }
    if (typeof obj.deviceId === "string" && obj.deviceId.trim().length > 0) {
      out.deviceId = obj.deviceId.trim();
    }
    if (typeof obj.deviceName === "string" && obj.deviceName.trim().length > 0) {
      out.deviceName = obj.deviceName.trim();
    }
    if (typeof obj.deepLinkPrefix === "string" && obj.deepLinkPrefix.trim().length > 0) {
      out.deepLinkPrefix = obj.deepLinkPrefix.trim();
    }
    if (typeof obj.timeout === "number" && Number.isFinite(obj.timeout)) {
      out.timeout = obj.timeout;
    }
    if (typeof obj.actionTimeout === "number" && Number.isFinite(obj.actionTimeout)) {
      out.actionTimeout = obj.actionTimeout;
    }
    if (typeof obj.autoAppLaunch === "boolean") {
      out.autoAppLaunch = obj.autoAppLaunch;
    }
    if (Array.isArray(obj.installApps)) {
      out.installApps = obj.installApps.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    }

    return out;
  } catch {
    return {};
  }
}

/**
 * Mobilewright's test fixtures pass only `RegExp.source` to the device pool (flags are
 * dropped). Patterns must match case-sensitively — e.g. "pixel" → /Pixel/ matches "Pixel 9".
 */
function formatDeviceNamePatternForPool(deviceName: string): string {
  const trimmed = deviceName.trim();
  const slashWrapped = /^\/(.+)\/([gimsuy]*)$/.exec(trimmed);
  const rawPattern = slashWrapped !== null ? slashWrapped[1] : trimmed;
  if (rawPattern.length === 0) {
    return ".*";
  }
  // Only bump case for all-lowercase tokens (e.g. "pixel" → "Pixel"). Keep "iPhone 15" as-is.
  if (/^[a-z0-9_-]+$/.test(rawPattern)) {
    return rawPattern.charAt(0).toUpperCase() + rawPattern.slice(1);
  }
  return rawPattern;
}

function formatDeviceNameExpr(deviceName: string): string {
  const pattern = formatDeviceNamePatternForPool(deviceName);
  const escaped = pattern.replace(/\\/g, "\\\\").replace(/\//g, "\\/");
  return `/${escaped}/`;
}

function escapeTsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildMobilewrightConfig(configJson: string | null): string {
  const cfg = parseEnvironmentConfig(configJson);
  const platform = cfg.platform ?? "ios";
  const bundleId = cfg.bundleId ?? "com.example.app";
  const timeout = cfg.timeout ?? 30_000;
  const deviceNameExpr = formatDeviceNameExpr(cfg.deviceName ?? "iPhone");

  const lines: string[] = [
    `import { defineConfig } from "mobilewright";`,
    ``,
    `export default defineConfig({`,
    `  platform: "${platform}",`,
    `  bundleId: "${escapeTsString(bundleId)}",`,
    `  deviceName: ${deviceNameExpr},`,
    `  timeout: ${timeout},`,
  ];

  if (cfg.deviceId !== undefined) {
    lines.push(`  deviceId: "${escapeTsString(cfg.deviceId)}",`);
  }
  if (cfg.autoAppLaunch !== undefined) {
    lines.push(`  autoAppLaunch: ${cfg.autoAppLaunch},`);
  }
  if (cfg.actionTimeout !== undefined) {
    lines.push(`  actionTimeout: ${cfg.actionTimeout},`);
  }
  if (cfg.installApps !== undefined && cfg.installApps.length > 0) {
    const apps = cfg.installApps.map((a) => `"${escapeTsString(a)}"`).join(", ");
    lines.push(`  installApps: [${apps}],`);
  }

  lines.push(`  autoStart: true,`);
  lines.push(`  url: "ws://localhost:12000/ws",`);

  lines.push(...DEFAULT_MOBILEWRIGHT_USE_LINES);

  lines.push(`  reporter: ${DEFAULT_MOBILEWRIGHT_REPORTER_CONFIG},`);

  lines.push(`});`, ``);
  return lines.join("\n");
}
