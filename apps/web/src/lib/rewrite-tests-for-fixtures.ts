import { pageObjectFixtureName } from "@/lib/generate-test-fixtures";

export function collapseLoginFlowCalls(content: string): string {
  let out = content;

  out = out.replace(
    /await\s+(\w+)\.assertOnLoginScreen\(\)\s*;\s*\n\s*await\s+\1\.fillUsername\(([^)]+)\)\s*;\s*\n\s*await\s+\1\.fillPassword\(([^)]+)\)\s*;\s*\n\s*await\s+\1\.tapLogin\(\)\s*;/g,
    "await $1.performLogin($2, $3);",
  );

  out = out.replace(
    /await\s+(\w+)\.fillUsername\(([^)]+)\)\s*;\s*\n\s*await\s+\1\.fillPassword\(([^)]+)\)\s*;\s*\n\s*await\s+\1\.tapLogin\(\)\s*;/g,
    "await $1.performLogin($2, $3);",
  );

  return out;
}

/** Removes inline `new Page(screen)` and dynamic import construction so injected fixtures are used. */
export function stripInlinePageObjectConstruction(content: string, pageClasses: string[]): string {
  let out = content;

  out = out.replace(
    /\s*const\s+\w+\s*=\s*new\s+\(await\s+import\(['"][^'"]+['"]\)\)\.\w+\s*\(\s*screen\s*\)\s*;?\n?/g,
    "",
  );

  for (const cls of pageClasses) {
    out = out.replace(
      new RegExp(`import\\s+\\{\\s*${cls}\\s*\\}\\s+from\\s+['"][^'"]+['"]\\s*;?\\n?`, "g"),
      "",
    );
    out = out.replace(
      new RegExp(`\\s*const\\s+\\w+\\s*=\\s*new\\s+${cls}\\s*\\(\\s*screen\\s*\\)\\s*;?\\n?`, "g"),
      "",
    );
  }

  return out;
}

export function rewriteTestsForFixtures(content: string, pageClasses: string[]): string {
  if (pageClasses.length === 0) {
    return content;
  }

  let out = stripInlinePageObjectConstruction(content, pageClasses);

  if (/from\s+['"]@mobilewright\/test['"]/.test(out) && !/from\s+['"]\.\.\/support\/fixtures['"]/.test(out)) {
    out = out.replace(
      /import\s+\{\s*test\s*,\s*expect\s*\}\s+from\s+['"]@mobilewright\/test['"]\s*;?/,
      "import { test, expect } from '../support/fixtures';",
    );
  }

  // Do not inject every catalog fixture into each test() callback — Playwright runs
  // requested fixtures in "Before Hooks", which makes the report look like all work
  // happens there. Keep only the fixtures the generator listed per test.

  return collapseLoginFlowCalls(out);
}
