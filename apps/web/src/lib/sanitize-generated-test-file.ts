import type { TestCase } from "@automation-ai/shared";
import {
  buildPageObjectExpectMethodIndex,
  type PageObjectSource,
} from "@/lib/page-object-expect-method-index";
import { pageObjectFixtureName } from "@/lib/generate-test-fixtures";
import { rewriteTestsForFixtures } from "@/lib/rewrite-tests-for-fixtures";
import { stripTypeScriptComments } from "@/lib/strip-typescript-comments";

export type SanitizeTestPlatform = "mobile" | "web";

const WEB_EXCLUDED_PLATFORM_TAGS = new Set(["ios", "android"]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatPlaywrightTags(testCase: TestCase, platform: SanitizeTestPlatform): string[] {
  const tags = new Set<string>();
  for (const raw of testCase.tags) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    tags.add(trimmed.startsWith("@") ? trimmed : `@${trimmed}`);
  }
  tags.add(`@${testCase.priority}`);
  tags.add(testCase.id.startsWith("@") ? testCase.id : `@${testCase.id}`);
  if (platform === "mobile") {
    for (const p of testCase.platforms) {
      tags.add(`@${p}`);
    }
  }
  return Array.from(tags).filter((t) => {
    if (platform !== "web") {
      return true;
    }
    return !WEB_EXCLUDED_PLATFORM_TAGS.has(t.replace(/^@/, "").toLowerCase());
  });
}

/** Maps plan case tags/priority/platforms onto matching test() blocks. */
export function injectTestCaseTags(
  content: string,
  cases: TestCase[],
  platform: SanitizeTestPlatform = "mobile",
): string {
  let out = content;
  for (const testCase of cases) {
    const tagList = formatPlaywrightTags(testCase, platform);
    if (tagList.length === 0) continue;

    const titlePattern = escapeRegExp(testCase.title);
    const tagLiteral = JSON.stringify(tagList);

    const withOptions = new RegExp(
      `test\\(\\s*(['"])(${titlePattern})\\1\\s*,\\s*\\{([^}]*)\\}\\s*,\\s*async`,
      "g",
    );
    if (withOptions.test(out)) {
      withOptions.lastIndex = 0;
      out = out.replace(withOptions, (_match, quote: string, title: string, optionsBody: string) => {
        if (/\btag\s*:/.test(optionsBody)) {
          return `test(${quote}${title}${quote}, { tag: ${tagLiteral} }, async`;
        }
        const trimmed = optionsBody.trim();
        const merged = trimmed.length > 0 ? `${trimmed}, tag: ${tagLiteral}` : `tag: ${tagLiteral}`;
        return `test(${quote}${title}${quote}, { ${merged} }, async`;
      });
      continue;
    }

    const bare = new RegExp(`test\\(\\s*(['"])(${titlePattern})\\1\\s*,\\s*async`, "g");
    out = out.replace(bare, `test($1$2$1, { tag: ${tagLiteral} }, async`);
  }
  return normalizePlaywrightTestTags(out, platform);
}

/** Ensure every tag in test() options starts with `@`. */
export function normalizePlaywrightTestTags(
  content: string,
  platform: SanitizeTestPlatform = "mobile",
): string {
  return content.replace(/\btag\s*:\s*\[([^\]]*)\]/g, (_match, inner: string) => {
    let tags = inner
      .split(",")
      .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
      .filter((t) => t.length > 0)
      .map((t) => (t.startsWith("@") ? t : `@${t}`));
    if (platform === "web") {
      tags = tags.filter((t) => !WEB_EXCLUDED_PLATFORM_TAGS.has(t.replace(/^@/, "").toLowerCase()));
    }
    return `tag: ${JSON.stringify(tags)}`;
  });
}

/** Screen.tap only accepts coordinates; specs must use page object fixtures. */
export function fixInvalidScreenCallsInSpecs(content: string): string {
  let out = content;

  out = out.replace(
    /await\s+screen\.expect\s*\(\s*\{[^}]+\}\s*\)\.toBeVisible\s*\(\s*\)\s*;\s*\n\s*await\s+screen\.expect\s*\(\s*\{[^}]+\}\s*\)\.toHaveText\s*\(([^)]+)\)\s*;/g,
    "await logoutDialogPage.assertVisible();",
  );

  out = out.replace(
    /await\s+homePage\.openProfileMenu\s*\(\s*\)\s*;\s*\n\s*await\s+screen\.tap\s*\(\s*\{[^}]+\}\s*\)\s*;\s*\n\s*await\s+loginPage\.assertOnLoginScreen\s*\(\s*\)\s*;/g,
    "await homePage.openProfileMenu();\n  await homePage.tapLogoutMenuItem();\n  await loginPage.assertOnLoginScreen();",
  );

  out = out.replace(
    /await\s+homePage\.openProfileMenu\s*\(\s*\)\s*;\s*\n\s*await\s+screen\.tap\s*\(\s*\{[^}]+\}\s*\)\s*;\s*\n\s*await\s+screen\.expect/g,
    "await homePage.openProfileMenu();\n  await homePage.tapLogoutMenuItem();\n  await logoutDialogPage.assertVisible();\n  await expect",
  );

  out = out.replace(
    /await\s+screen\.tap\s*\(\s*\{[^}]+\}\s*\)\s*;\s*\n\s*await\s+homePage\.assertOnHomeScreen\s*\(\s*\)\s*;/g,
    "await logoutDialogPage.tapCancel();\n  await homePage.assertOnHomeScreen();",
  );

  out = out.replace(/await\s+screen\.tap\s*\(\s*\{[^}]+\}\s*\)\s*;/g, "");
  out = out.replace(/await\s+screen\.expect\s*\(\s*\{[^}]+\}\s*\)[^;]+;/g, "");

  return out;
}

/** App launch is handled by the device fixture; Screen has no launchApp/terminateApp/swipe. */
export function fixInvalidScreenDeviceCalls(content: string): string {
  let out = content;
  out = out.replace(/\s*await\s+screen\.launchApp\(\)\s*;\n?/g, "\n");
  out = out.replace(/\s*await\s+screen\.terminateApp\(\)\s*;\n?/g, "\n");
  out = out.replace(/\s*await\s+screen\.swipe\([^)]*\)\s*;\n?/g, "\n");
  out = out.replace(
    /await\s+test\.step\(\s*['"][^'"]*launch[^'"]*['"]\s*,\s*async\s*\(\)\s*=>\s*\{\s*\}\s*\)\s*;\n?/gi,
    "",
  );
  return out;
}

/** LLM often invents expectElementVisible('label'); map labels to real page-object methods. */
export function fixFabricatedExpectElementVisibleCalls(
  content: string,
  pageObjectSources: PageObjectSource[],
): string {
  if (pageObjectSources.length === 0) {
    return content;
  }

  const index = buildPageObjectExpectMethodIndex(pageObjectSources);
  if (index.size === 0) {
    return content;
  }

  let out = content.replace(
    /await\s+(\w+)\.expectElementVisible\(\s*['"]([^'"]+)['"]\s*(?:,\s*\{[^}]*\})?\s*\)\s*;/g,
    (line, fixture: string, label: string) => {
      const method = index.get(fixture)?.get(label.trim());
      if (method === undefined) {
        return line;
      }
      return `await ${fixture}.${method}();`;
    },
  );

  out = out.replace(
    /await\s+expect\s*\(\s*\w+\.expectElementVisible\(\s*['"][^'"]+['"]\s*\)\s*\)\.rejects\.toThrow\(\s*\)\s*;/g,
    "// removed invalid .rejects.toThrow() on visibility helper — use page-object hidden assertion instead",
  );

  return out;
}

/** Mobilewright: map waitForTimeout → sleep from @mobilewright/core. */
export function fixInvalidWaitCallsMobile(content: string): string {
  let out = content.replace(
    /await\s+(?:screen|page)\.waitForTimeout\s*\(\s*(\d+)\s*\)\s*;?/g,
    "await sleep($1);",
  );
  out = out.replace(/(?:screen|page)\.waitForTimeout\s*\(\s*(\d+)\s*\)/g, "sleep($1)");

  if (!/\bsleep\s*\(/.test(out)) {
    return out;
  }
  if (/from\s+['"]@mobilewright\/core['"]/.test(out)) {
    return out;
  }

  const testImport =
    /import\s+\{([^}]+)\}\s+from\s+['"](?:@mobilewright\/test|\.\.\/support\/fixtures)['"]\s*;?/;
  if (testImport.test(out)) {
    return out.replace(testImport, (line) => `${line}\nimport { sleep } from '@mobilewright/core';`);
  }

  return `import { sleep } from '@mobilewright/core';\n${out}`;
}

/** Playwright has no `toHaveCountGreaterThan` — use poll-based helper or standard matcher. */
export function fixInvalidWebCountMatchers(content: string): string {
  return content.replace(
    /await\s+expect\s*\(\s*([^)]+)\s*\)\.toHaveCountGreaterThan\s*\(\s*(\d+)\s*\)\s*;/g,
    "await expect.poll(async () => await $1.count()).toBeGreaterThan($2);",
  );
}

/** LLM often emits page.goto('/login') for app launch; baseURL root is correct for entry (e.g. saucedemo.com). */
export function fixWebAppLaunchGotoPath(content: string): string {
  let out = content;
  out = out.replace(
    /(test\.step\(\s*['"][^'"]*\b(?:launch|open)\s+(?:the\s+)?(?:application|app|site)\b[^'"]*['"]\s*,\s*async\s*\(\)\s*=>\s*\{\s*)await\s+page\.goto\(\s*['"]\/login['"]\s*\)/gi,
    "$1await page.goto('/')",
  );
  out = out.replace(
    /(test\.step\(\s*['"][^'"]*\bgo\s+to\s+(?:the\s+)?(?:application|home|entry)\b[^'"]*['"]\s*,\s*async\s*\(\)\s*=>\s*\{\s*)await\s+page\.goto\(\s*['"]\/login['"]\s*\)/gi,
    "$1await page.goto('/')",
  );
  return out;
}

/** Playwright web: never use @mobilewright/core; use the built-in page fixture. */
export function fixInvalidWaitCallsWeb(content: string): string {
  let out = content.replace(/\n?import\s+\{\s*sleep\s*\}\s+from\s+['"]@mobilewright\/core['"]\s*;?\n?/g, "\n");
  out = out.replace(/await\s+(\w+)\.sleep\s*\(\s*(\d+)\s*\)\s*;/g, "await page.waitForTimeout($2);");
  out = out.replace(/await\s+sleep\s*\(\s*(\d+)\s*\)\s*;/g, "await page.waitForTimeout($1);");
  out = out.replace(/await\s+(\w+Page)\.page\.goto\s*\(/g, "await page.goto(");
  out = out.replace(/await\s+(\w+Page)\.page\.goBack\s*\(\s*\)/g, "await page.goBack()");
  out = out.replace(/(\w+Page)\.page\./g, "page.");
  out = ensurePageFixtureInTests(out);
  return out;
}

/** Add `page` to test() fixture lists when bare page.waitForTimeout is used. */
function ensurePageFixtureInTests(content: string): string {
  if (!/\bpage\.(waitForTimeout|goto|goBack)/.test(content)) {
    return content;
  }
  return content.replace(/async\s*\(\s*\{([^}]*)\}\s*\)/g, (match, params: string) => {
    if (/\bpage\b/.test(params)) {
      return match;
    }
    const trimmed = params.trim();
    return trimmed.length > 0 ? `async ({ ${trimmed}, page })` : `async ({ page })`;
  });
}

/** Prefer check* over click* when the page object exposes a matching check method (checkboxes). */
export function fixWebCheckboxTestCalls(content: string, sources: PageObjectSource[]): string {
  const checkMethodsByFixture = new Map<string, Set<string>>();
  for (const src of sources) {
    const classMatch = src.content.match(/export class (\w+)/);
    if (classMatch === null) {
      continue;
    }
    const fixture = pageObjectFixtureName(classMatch[1]);
    const checks = new Set<string>();
    for (const m of src.content.matchAll(/\basync\s+(check\w+)\s*\(/g)) {
      checks.add(m[1]);
    }
    if (checks.size > 0) {
      checkMethodsByFixture.set(fixture, checks);
    }
  }

  return content.replace(
    /await\s+(\w+)\.(click\w+)\(\s*\)/g,
    (match, fixture: string, clickMethod: string) => {
      const cap = clickMethod.slice(5);
      const checkMethod = `check${cap}`;
      const checks = checkMethodsByFixture.get(fixture);
      if (checks !== undefined && checks.has(checkMethod)) {
        return `await ${fixture}.${checkMethod}()`;
      }
      return match;
    },
  );
}

/** Strip mobile-only APIs and tags from web Playwright specs. */
export function stripWebMobileArtifacts(content: string): string {
  let out = content.replace(/\n?import\s+\{\s*sleep\s*\}\s+from\s+['"]@mobilewright\/core['"]\s*;?\n?/g, "\n");
  out = out.replace(/\bimport\s+\{[^}]*\}\s+from\s+['"]@mobilewright\/core['"]\s*;?\n?/g, "");
  out = normalizePlaywrightTestTags(out, "web");
  return out;
}

export function fixInvalidWaitCalls(content: string, platform: SanitizeTestPlatform = "mobile"): string {
  if (platform === "web") {
    return fixInvalidWaitCallsWeb(content);
  }
  return fixInvalidWaitCallsMobile(content);
}

export type SanitizeGeneratedTestFileOptions = {
  platform?: SanitizeTestPlatform;
};

export function sanitizeGeneratedTestFileContent(
  content: string,
  cases?: TestCase[],
  pageObjectClassNames?: string[],
  pageObjectSources?: PageObjectSource[],
  options?: SanitizeGeneratedTestFileOptions,
): string {
  const platform = options?.platform ?? "mobile";
  let out = stripTypeScriptComments(content);
  out = fixInvalidWaitCalls(out, platform);
  if (platform === "mobile") {
    out = fixInvalidScreenDeviceCalls(out);
    out = fixInvalidScreenCallsInSpecs(out);
  } else {
    out = stripWebMobileArtifacts(out);
    out = fixWebAppLaunchGotoPath(out);
    out = fixInvalidWebCountMatchers(out);
    if (pageObjectSources !== undefined && pageObjectSources.length > 0) {
      out = fixWebCheckboxTestCalls(out, pageObjectSources);
    }
  }
  out = normalizePlaywrightTestTags(out, platform);
  if (pageObjectSources !== undefined && pageObjectSources.length > 0) {
    out = fixFabricatedExpectElementVisibleCalls(out, pageObjectSources);
  }
  if (pageObjectClassNames !== undefined && pageObjectClassNames.length > 0) {
    out = rewriteTestsForFixtures(out, pageObjectClassNames);
  }
  if (cases !== undefined && cases.length > 0) {
    out = injectTestCaseTags(out, cases, platform);
  }
  return out.trim() + "\n";
}
