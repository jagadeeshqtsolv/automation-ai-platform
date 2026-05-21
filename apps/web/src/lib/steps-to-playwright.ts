import type { TestCase, TestStep } from "@automation-ai/shared";
import { labelForTestStepActionForPlatform } from "@automation-ai/shared";
import {
  buildPageObjectStepIndex,
  findLocatorKeyForStep,
  methodNameForWebAction,
  resolvePageObjectEntryForStep,
  type PageObjectStepEntry,
} from "@/lib/page-object-step-index";
import type { PageObjectForSteps, StepCodegenResult } from "@/lib/steps-to-mobilewright";
import {
  buildTestStepBlocks,
  escapeForTsString,
  normalizePageObjectMethodName,
  quoteMethodArgs,
} from "@/lib/steps-to-mobilewright";
import { resolveWebGotoPath } from "@/lib/web-goto-path";

export type { PageObjectForSteps };

export function formatWebStepLabel(step: TestStep): string {
  const actionLabel = labelForTestStepActionForPlatform(step.action, "web");
  const parts = [actionLabel, step.targetDescription.trim()];
  if (step.locatorHint !== undefined && step.locatorHint.trim().length > 0) {
    parts.push(`(${step.locatorHint.trim()})`);
  }
  return parts.filter((p) => p.length > 0).join(" — ").slice(0, 120);
}

function humanizeWebMethodName(method: string): string {
  const stripped = method
    .replace(/^click/, "")
    .replace(/^fill/, "")
    .replace(/^check/, "")
    .replace(/^expect/, "")
    .replace(/Visible$/, "")
    .replace(/Hidden$/, "");
  if (stripped.length === 0) {
    return method;
  }
  return stripped.replace(/([A-Z])/g, " $1").trim();
}

/** Infer "Click — Login button" from `await loginPage.clickLoginButton();` for Playwright report steps. */
export function inferWebStepLabelFromCodeLine(line: string, planStep: TestStep): string {
  const trimmed = line.trim();
  if (trimmed.startsWith("//")) {
    return formatWebStepLabel(planStep);
  }

  const expr = trimmed.replace(/^await\s+/, "").replace(/;\s*$/, "");

  let actionLabel: string | null = null;
  if (/\.dblclick|doubleClick/i.test(expr)) {
    actionLabel = "Double click";
  } else if (/\.click[A-Za-z_]/.test(expr) || /\.click\(/.test(expr)) {
    actionLabel = "Click";
  } else if (/\.fill[A-Za-z_]/.test(expr) || /\.fill\(/.test(expr)) {
    actionLabel = "Fill";
  } else if (/\.check[A-Za-z_]/.test(expr) || /\.check\(/.test(expr)) {
    actionLabel = "Check";
  } else if (/expect\w+Visible|\.toBeVisible\(/.test(expr)) {
    actionLabel = "Assert visible";
  } else if (/expect\w+Hidden|not\.toBeVisible/.test(expr)) {
    actionLabel = "Assert hidden";
  } else if (/toHaveText|assertText/.test(expr)) {
    actionLabel = "Assert text";
  } else if (/\.scroll[A-Za-z_]|scrollIntoView/.test(expr)) {
    actionLabel = "Scroll into view";
  } else if (/page\.goBack|\.goBack\(/.test(expr)) {
    actionLabel = "Navigate back";
  } else if (/waitForTimeout/.test(expr)) {
    actionLabel = "Wait";
  } else if (/screenshot/.test(expr)) {
    actionLabel = "Screenshot";
  } else if (/page\.goto|\.goto\(/.test(expr)) {
    actionLabel = "Navigate to URL";
  }

  if (actionLabel === null) {
    return formatWebStepLabel(planStep);
  }

  const methodMatch = /\.([a-zA-Z0-9_]+)\(/.exec(expr);
  const target =
    planStep.targetDescription.trim() ||
    (methodMatch !== null ? humanizeWebMethodName(methodMatch[1]) : planStep.locatorHint?.trim() ?? "");

  const hint =
    planStep.locatorHint !== undefined && planStep.locatorHint.trim().length > 0
      ? ` (${planStep.locatorHint.trim()})`
      : "";

  return `${actionLabel} — ${target}${hint}`.slice(0, 120);
}

function resolveWebMethodName(entry: PageObjectStepEntry, step: TestStep, locatorKey: string): string | null {
  if (step.action === "tap") {
    const pascal = locatorKey.charAt(0).toUpperCase() + locatorKey.slice(1);
    const check = `check${pascal}`;
    if (entry.methods.has(check)) {
      return check;
    }
  }
  if (step.action === "assertChecked" && step.assertion?.trim().toLowerCase() === "false") {
    const pascal = locatorKey.charAt(0).toUpperCase() + locatorKey.slice(1);
    const unchecked = `expect${pascal}Unchecked`;
    if (entry.methods.has(unchecked)) {
      return unchecked;
    }
  }
  return methodNameForWebAction(locatorKey, step.action);
}

function resolveWebMethodCall(entry: PageObjectStepEntry, step: TestStep): string | null {
  const explicit = normalizePageObjectMethodName(step.pageObjectMethod);
  if (explicit !== undefined && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(explicit)) {
    const args = quoteWebMethodArgs(explicit, step);
    return args.length > 0
      ? `${entry.fixtureName}.${explicit}(${args})`
      : `${entry.fixtureName}.${explicit}()`;
  }

  const locatorKey = findLocatorKeyForStep(entry, step.targetDescription, step.locatorHint);
  if (locatorKey === null) {
    return null;
  }

  const inferred = resolveWebMethodName(entry, step, locatorKey);
  if (inferred !== null && entry.methods.has(inferred)) {
    const args = quoteWebMethodArgs(inferred, step);
    return args.length > 0 ? `${entry.fixtureName}.${inferred}(${args})` : `${entry.fixtureName}.${inferred}()`;
  }

  if (step.action === "tap") {
    const pascal = locatorKey.charAt(0).toUpperCase() + locatorKey.slice(1);
    const check = `check${pascal}`;
    if (entry.methods.has(check)) {
      return `${entry.fixtureName}.${check}()`;
    }
    const click = methodNameForWebAction(locatorKey, "tap");
    if (click !== null && entry.methods.has(click)) {
      return `${entry.fixtureName}.${click}()`;
    }
  }

  return null;
}

function quoteWebMethodArgs(method: string, step: TestStep): string {
  if (method.startsWith("expect") && method.endsWith("Count")) {
    const n = step.assertion?.trim() ?? step.value?.trim() ?? "";
    if (/^\d+$/.test(n)) {
      return n;
    }
  }
  return quoteMethodArgs(method, step);
}

function fallbackWebStepCode(step: TestStep, entry: PageObjectStepEntry | null): string {
  const page = "page";

  if (entry !== null) {
    const locatorKey = findLocatorKeyForStep(entry, step.targetDescription, step.locatorHint);
    if (locatorKey !== null) {
      const method = resolveWebMethodName(entry, step, locatorKey);
      if (method !== null) {
        const args = quoteWebMethodArgs(method, step);
        const call =
          args.length > 0 ? `${entry.fixtureName}.${method}(${args})` : `${entry.fixtureName}.${method}()`;
        return `await ${call};`;
      }
    }
  }

  switch (step.action) {
    case "wait":
      return `await ${page}.waitForTimeout(${step.value?.trim() || "1000"});`;
    case "waitForVisible":
    case "waitForHidden":
      return `// TODO: ${step.action} on "${step.targetDescription}" — add locatorHint and sync, or set customCode`;
    case "back":
      return `await ${page}.goBack();`;
    case "openUrl":
      return `await ${page}.goto('${escapeForTsString(resolveWebGotoPath(step))}');`;
    case "screenshot":
      return `await ${page}.screenshot({ path: 'screenshot.png' });`;
    case "launchApp":
      return `await ${page}.goto('${escapeForTsString(resolveWebGotoPath(step))}');`;
    case "terminateApp":
    case "setOrientation":
    case "tapAt":
    case "swipe":
    case "pullToRefresh":
    case "gesture":
    case "pressButton":
    case "openDeepLink":
      return `// ${step.action}: not used for web Playwright projects`;
    case "switchToFrame": {
      const selector = step.value?.trim() || step.locatorHint?.trim() || "iframe";
      return `await page.locator('${escapeForTsString(selector)}').waitFor({ state: 'attached', timeout: 30_000 });`;
    }
    case "switchToMainFrame":
      return "// Main document — use locators without frame in L";
    case "switchToNewTab":
      return "const __newTab = await page.waitForEvent('popup', { timeout: 30_000 }); await __newTab.waitForLoadState('domcontentloaded');";
    case "closeTab":
      return "await page.close();";
    default:
      return `// TODO: ${step.action} — "${step.targetDescription}" (set locatorHint + screenName, or customCode; unmatched locators go to CommonPage on sync)`;
  }
}

export function generateWebStepCode(
  step: TestStep,
  pageObjects: PageObjectForSteps[],
): { code: string; fixtures: string[] } {
  if (step.customCode !== undefined && step.customCode.trim().length > 0) {
    const lines = step.customCode.trim().split("\n");
    const body = lines.map((line) => `    ${line}`).join("\n");
    return { code: body, fixtures: ["page"] };
  }

  if (step.action === "launchApp" || step.action === "openUrl") {
    return {
      code: `    await page.goto('${escapeForTsString(resolveWebGotoPath(step))}');`,
      fixtures: ["page"],
    };
  }

  if (step.action === "switchToNewTab") {
    return {
      code: [
        "    const __newTab = await page.waitForEvent('popup', { timeout: 30_000 });",
        "    await __newTab.waitForLoadState('domcontentloaded');",
        "    await __newTab.bringToFront();",
      ].join("\n"),
      fixtures: ["page"],
    };
  }

  if (step.action === "switchToFrame") {
    const selector = step.value?.trim() || step.locatorHint?.trim() || "iframe";
    return {
      code: `    await page.locator('${escapeForTsString(selector)}').waitFor({ state: 'attached', timeout: 30_000 });`,
      fixtures: ["page"],
    };
  }

  if (step.action === "switchToMainFrame") {
    return {
      code: "    // Main document — use page object locators without `frame` in L",
      fixtures: ["page"],
    };
  }

  if (step.action === "closeTab") {
    return {
      code: "    await page.close();",
      fixtures: ["page"],
    };
  }

  const index = buildPageObjectStepIndex(pageObjects, { platform: "web" });
  const entry = resolvePageObjectEntryForStep(index, step);
  const fixtures: string[] = ["page"];

  if (entry !== null) {
    fixtures.push(entry.fixtureName);
    const call = resolveWebMethodCall(entry, step);
    if (call !== null) {
      return { code: `    await ${call};`, fixtures };
    }
  }

  const fallback = fallbackWebStepCode(step, entry);
  return { code: `    ${fallback}`, fixtures };
}

export function generateWebTestCaseStepCodes(
  testCase: TestCase,
  pageObjects: PageObjectForSteps[],
): StepCodegenResult {
  const fixtureNames = new Set<string>();
  const stepLines: string[] = [];
  const stepInnerLines: string[] = [];

  for (const step of testCase.steps) {
    const { code, fixtures } = generateWebStepCode(step, pageObjects);
    for (const f of fixtures) {
      fixtureNames.add(f);
    }
    stepInnerLines.push(code.trim());
    stepLines.push(
      ...buildTestStepBlocks(code, step, formatWebStepLabel, inferWebStepLabelFromCodeLine),
    );
  }

  return { stepLines, stepInnerLines, fixtureNames };
}

const WEB_EXCLUDED_PLATFORM_TAGS = new Set(["ios", "android"]);

function formatWebPlaywrightTags(testCase: TestCase): string[] {
  const tags = new Set<string>();
  for (const raw of testCase.tags) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
    if (WEB_EXCLUDED_PLATFORM_TAGS.has(normalized.toLowerCase())) {
      continue;
    }
    tags.add(trimmed.startsWith("@") ? trimmed : `@${trimmed}`);
  }
  tags.add(`@${testCase.priority}`);
  tags.add(testCase.id.startsWith("@") ? testCase.id : `@${testCase.id}`);
  return Array.from(tags);
}

export function generateWebTestCaseBlock(
  testCase: TestCase,
  pageObjects: PageObjectForSteps[],
): { block: string; fixtureNames: string[] } {
  const { stepLines, fixtureNames } = generateWebTestCaseStepCodes(testCase, pageObjects);
  const tags = JSON.stringify(formatWebPlaywrightTags(testCase));
  const title = escapeForTsString(testCase.title);
  const fixtureList = Array.from(fixtureNames).filter((f, i, arr) => arr.indexOf(f) === i);
  const params = fixtureList.join(", ");

  const body = stepLines.length > 0 ? `\n${stepLines.join("\n")}\n` : "\n  // No steps\n";

  return {
    block: `test('${title}', { tag: ${tags} }, async ({ ${params} }) => {${body}});`,
    fixtureNames: Array.from(fixtureNames).filter((f) => f !== "page"),
  };
}
