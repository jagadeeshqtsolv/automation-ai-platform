import type { ProjectPlatformType } from "@automation-ai/shared";

/** Fixture keys: `loginPage` for `LoginPage`, `loginScreen` for `LoginScreen`. */
export function pageObjectFixtureName(className: string): string {
  if (className.endsWith("Page")) {
    const base = className.slice(0, -4);
    if (base.length === 0) return "screenPage";
    const camel = `${base.charAt(0).toLowerCase()}${base.slice(1)}`;
    return `${camel}Page`;
  }
  if (className.endsWith("Screen")) {
    const base = className.slice(0, -6);
    if (base.length === 0) return "screen";
    const camel = `${base.charAt(0).toLowerCase()}${base.slice(1)}`;
    return `${camel}Screen`;
  }
  const camel =
    className.length > 0 ? `${className.charAt(0).toLowerCase()}${className.slice(1)}` : "screen";
  return camel;
}

function moduleImportPath(modulePath: string): string {
  const normalized = modulePath.trim().replace(/^\.\//, "").replace(/\.ts$/i, "");
  return `../${normalized}`;
}

export function generateTestFixturesSource(
  pageObjects: Array<{ className: string; modulePath: string }>,
  platformType: ProjectPlatformType = "mobile",
): string {
  const isWeb = platformType === "web";
  const testImport = isWeb ? "@playwright/test" : "@mobilewright/test";
  const driverFixture = isWeb ? "page" : "screen";
  const unique = new Map<string, { className: string; modulePath: string }>();
  for (const row of pageObjects) {
    if (row.className.trim().length === 0) continue;
    unique.set(row.className, row);
  }
  const rows = Array.from(unique.values()).sort((a, b) => a.className.localeCompare(b.className));

  if (rows.length === 0) {
    return [
      `import { test as base, expect } from "${testImport}";`,
      ``,
      `export const test = base;`,
      `export { expect };`,
      ``,
    ].join("\n");
  }

  const imports = rows
    .map((r) => `import { ${r.className} } from "${moduleImportPath(r.modulePath)}";`)
    .join("\n");

  const typeFields = rows
    .map((r) => `  ${pageObjectFixtureName(r.className)}: ${r.className};`)
    .join("\n");

  const fixtureImpls = rows
    .map((r) => {
      const prop = pageObjectFixtureName(r.className);
      return [
        `  ${prop}: async ({ ${driverFixture} }, use) => {`,
        `    await use(new ${r.className}(${driverFixture}));`,
        `  },`,
      ].join("\n");
    })
    .join("\n");

  return [
    `import { test as base, expect } from "${testImport}";`,
    imports,
    ``,
    `type AppFixtures = {`,
    typeFields,
    `};`,
    ``,
    `export const test = base.extend<AppFixtures>({`,
    fixtureImpls,
    `});`,
    ``,
    `export { expect };`,
    ``,
  ].join("\n");
}

export const TEST_FIXTURES_MODULE_PATH = "support/fixtures.ts";
