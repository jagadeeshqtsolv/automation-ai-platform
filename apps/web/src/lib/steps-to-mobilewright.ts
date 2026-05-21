import type { TestCase, TestStep } from "@automation-ai/shared";
import { labelForTestStepAction } from "@automation-ai/shared";
import {
  buildPageObjectStepIndex,
  findLocatorKeyForStep,
  methodNameForAction,
  resolvePageObjectEntryForStep,
  type PageObjectStepEntry,
} from "@/lib/page-object-step-index";

export type PageObjectForSteps = {
  className: string;
  screenName: string | null;
  content: string;
  methodSummary?: string;
};

export type StepCodegenResult = {
  /** Full test.step(...) blocks per plan step */
  stepLines: string[];
  /** Inner body lines only (for UI preview) */
  stepInnerLines: string[];
  /** Fixtures needed in test() callback */
  fixtureNames: Set<string>;
};

export function escapeForTsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Report-friendly label: "Tap — Open menu (Products)" */
export function formatStepLabel(step: TestStep): string {
  const actionLabel = labelForTestStepAction(step.action);
  const parts = [actionLabel, step.targetDescription.trim()];
  if (step.locatorHint !== undefined && step.locatorHint.trim().length > 0) {
    parts.push(`(${step.locatorHint.trim()})`);
  }
  return parts.filter((p) => p.length > 0).join(" — ").slice(0, 120);
}

function humanizeMethodName(method: string): string {
  const stripped = method
    .replace(/^tap/, "")
    .replace(/^doubleTap/, "")
    .replace(/^longPress/, "")
    .replace(/^fill/, "")
    .replace(/^clear/, "")
    .replace(/^expect/, "")
    .replace(/^scroll/, "")
    .replace(/Visible$/, "")
    .replace(/Hidden$/, "");
  if (stripped.length === 0) {
    return method;
  }
  return stripped.replace(/([A-Z])/g, " $1").trim();
}

/** Infer "Tap — Open menu" from `await homeScreen.tapOpenMenu();` for Playwright report steps. */
export function inferStepLabelFromCodeLine(line: string, planStep: TestStep): string {
  const trimmed = line.trim();
  if (trimmed.startsWith("//")) {
    return formatStepLabel(planStep);
  }

  const expr = trimmed.replace(/^await\s+/, "").replace(/;\s*$/, "");

  let actionLabel: string | null = null;
  if (/\.doubleTap[A-Za-z_]/.test(expr) || /\.doubleTap\(/.test(expr)) {
    actionLabel = "Double tap";
  } else if (/\.longPress[A-Za-z_]/.test(expr) || /\.longPress\(/.test(expr)) {
    actionLabel = "Long press";
  } else if (/\.tap[A-Za-z_]/.test(expr) || /\.tap\(/.test(expr)) {
    actionLabel = "Tap";
  } else if (/\.fill[A-Za-z_]/.test(expr) || /\.fill\(/.test(expr)) {
    actionLabel = "Fill";
  } else if (/\.clear[A-Za-z_]/.test(expr) || /\.clear\(/.test(expr)) {
    actionLabel = "Clear field";
  } else if (/\.typeText/.test(expr)) {
    actionLabel = "Type text";
  } else if (/expect\w+Visible|\.toBeVisible\(/.test(expr)) {
    actionLabel = "Assert visible";
  } else if (/expect\w+Hidden|not\.toBeVisible|isHidden/.test(expr)) {
    actionLabel = "Assert hidden";
  } else if (/toHaveText|assertText/.test(expr)) {
    actionLabel = "Assert text";
  } else if (/toContainText|assertContainsText/.test(expr)) {
    actionLabel = "Assert contains text";
  } else if (/\.scroll[A-Za-z_]|scrollIntoView/.test(expr)) {
    actionLabel = "Scroll into view";
  } else if (/screen\.goBack|\.goBack\(/.test(expr)) {
    actionLabel = "Navigate back";
  } else if (/sleep\(/.test(expr)) {
    actionLabel = "Wait";
  } else if (/screenshot/.test(expr)) {
    actionLabel = "Screenshot";
  } else if (/swipe/.test(expr)) {
    actionLabel = "Swipe";
  }

  if (actionLabel === null) {
    return formatStepLabel(planStep);
  }

  const methodMatch = /\.([a-zA-Z0-9_]+)\(/.exec(expr);
  const target =
    planStep.targetDescription.trim() ||
    (methodMatch !== null ? humanizeMethodName(methodMatch[1]) : planStep.locatorHint?.trim() ?? "");

  const hint =
    planStep.locatorHint !== undefined && planStep.locatorHint.trim().length > 0
      ? ` (${planStep.locatorHint.trim()})`
      : "";

  return `${actionLabel} — ${target}${hint}`.slice(0, 120);
}

function splitExecutableLines(code: string): string[] {
  return code
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => {
      const t = line.trim();
      return t.length > 0 && !t.startsWith("//");
    });
}

export function buildTestStepBlocks(
  code: string,
  planStep: TestStep,
  formatLabel: (step: TestStep) => string = formatStepLabel,
  inferLabelFromLine: (line: string, step: TestStep) => string = inferStepLabelFromCodeLine,
): string[] {
  const lines = splitExecutableLines(code);
  if (lines.length === 0) {
    return [];
  }
  if (lines.length === 1) {
    const label = escapeForTsString(formatLabel(planStep));
    const body = lines[0].startsWith("    ") ? lines[0] : `    ${lines[0].trim()}`;
    return [`  await test.step('${label}', async () => {\n${body}\n  });`];
  }

  return lines.map((line) => {
    const label = escapeForTsString(inferLabelFromLine(line, planStep));
    const body = line.startsWith("    ") ? line : `    ${line.trim()}`;
    return `  await test.step('${label}', async () => {\n${body}\n  });`;
  });
}

/** Strip UI/copy artifacts like `tapLogin()` → `tapLogin`. */
export function normalizePageObjectMethodName(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  let name = raw.trim();
  if (name.length === 0) {
    return undefined;
  }
  if (name.endsWith("()")) {
    name = name.slice(0, -2).trim();
  }
  if (name.endsWith("();")) {
    name = name.slice(0, -3).trim();
  }
  return name.length > 0 ? name : undefined;
}

function isSafeMethodIdentifier(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

export function quoteMethodArgs(method: string, step: TestStep): string {
  if (step.value !== undefined && step.value.trim().length > 0) {
    const v = escapeForTsString(step.value.trim());
    if (method === "performLogin" && step.assertion === undefined) {
      return `'${v}', ''`;
    }
    return `'${v}'`;
  }
  if (step.assertion !== undefined && step.assertion.trim().length > 0) {
    const a = escapeForTsString(step.assertion.trim());
    if (/^(true|false|\d+)$/i.test(a)) {
      return a.toLowerCase() === "true" || a.toLowerCase() === "false" ? a.toLowerCase() : a;
    }
    return `'${a}'`;
  }
  return "";
}

function resolveMethodCall(
  entry: PageObjectStepEntry,
  step: TestStep,
): string | null {
  const explicit = normalizePageObjectMethodName(step.pageObjectMethod);
  if (explicit !== undefined && isSafeMethodIdentifier(explicit)) {
    const args = quoteMethodArgs(explicit, step);
    return args.length > 0
      ? `${entry.fixtureName}.${explicit}(${args})`
      : `${entry.fixtureName}.${explicit}()`;
  }

  const locatorKey = findLocatorKeyForStep(entry, step.targetDescription, step.locatorHint);
  if (locatorKey === null) {
    return null;
  }

  const inferred = methodNameForAction(locatorKey, step.action);
  if (inferred !== null && entry.methods.has(inferred)) {
    const args = quoteMethodArgs(inferred, step);
    return args.length > 0 ? `${entry.fixtureName}.${inferred}(${args})` : `${entry.fixtureName}.${inferred}()`;
  }

  if (step.action === "tap" && entry.methods.has(`tap${locatorKey.charAt(0).toUpperCase()}${locatorKey.slice(1)}`)) {
    const m = `tap${locatorKey.charAt(0).toUpperCase()}${locatorKey.slice(1)}`;
    return `${entry.fixtureName}.${m}()`;
  }

  return null;
}

function fallbackStepCode(step: TestStep, entry: PageObjectStepEntry | null): string {
  const fixture = entry?.fixtureName ?? "screen";
  const label = escapeForTsString(
    (step.locatorHint?.trim() || step.targetDescription.trim()).slice(0, 200),
  );

  switch (step.action) {
    case "wait":
      return `await sleep(${step.value?.trim() || "1000"});`;
    case "back":
      return `await screen.goBack();`;
    case "screenshot":
      return `await screen.screenshot();`;
    case "launchApp":
    case "terminateApp":
      return `// ${step.action}: handled by device fixture / mobilewright.config.ts`;
    case "assertVisible":
    case "assertHidden":
    case "tap":
    case "fill":
      return `// TODO: add pageObjectMethod or customCode for ${step.action} on "${step.targetDescription}" (${fixture})`;
    default:
      return `// TODO: ${step.action} — "${step.targetDescription}"`;
  }
}

export function generateStepMobilewrightCode(
  step: TestStep,
  pageObjects: PageObjectForSteps[],
): { code: string; fixtures: string[] } {
  if (step.customCode !== undefined && step.customCode.trim().length > 0) {
    const lines = step.customCode.trim().split("\n");
    const body = lines.map((line) => `    ${line}`).join("\n");
    return { code: body, fixtures: [] };
  }

  const index = buildPageObjectStepIndex(pageObjects);
  const entry = resolvePageObjectEntryForStep(index, step);
  const fixtures: string[] = [];

  if (entry !== null) {
    fixtures.push(entry.fixtureName);
    const call = resolveMethodCall(entry, step);
    if (call !== null) {
      return { code: `    await ${call};`, fixtures };
    }
  }

  const fallback = fallbackStepCode(step, entry);
  return { code: `    ${fallback}`, fixtures };
}

export function generateTestCaseStepCodes(
  testCase: TestCase,
  pageObjects: PageObjectForSteps[],
): StepCodegenResult {
  const fixtureNames = new Set<string>();
  const stepLines: string[] = [];
  const stepInnerLines: string[] = [];

  for (const step of testCase.steps) {
    const { code, fixtures } = generateStepMobilewrightCode(step, pageObjects);
    for (const f of fixtures) {
      fixtureNames.add(f);
    }
    stepInnerLines.push(code.trim());
    stepLines.push(...buildTestStepBlocks(code, step));
  }

  return { stepLines, stepInnerLines, fixtureNames };
}

function formatPlaywrightTags(testCase: TestCase): string[] {
  const tags = new Set<string>();
  for (const raw of testCase.tags) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    tags.add(trimmed.startsWith("@") ? trimmed : `@${trimmed}`);
  }
  tags.add(`@${testCase.priority}`);
  tags.add(testCase.id.startsWith("@") ? testCase.id : `@${testCase.id}`);
  for (const platform of testCase.platforms) {
    tags.add(`@${platform}`);
  }
  return Array.from(tags);
}

export function generateTestCaseBlock(
  testCase: TestCase,
  pageObjects: PageObjectForSteps[],
): { block: string; fixtureNames: string[] } {
  const { stepLines, fixtureNames } = generateTestCaseStepCodes(testCase, pageObjects);
  const tags = JSON.stringify(formatPlaywrightTags(testCase));
  const title = escapeForTsString(testCase.title);
  const fixtureList = ["screen", ...Array.from(fixtureNames)].filter(
    (f, i, arr) => arr.indexOf(f) === i,
  );
  const params = fixtureList.join(", ");

  const body = stepLines.length > 0 ? `\n${stepLines.join("\n")}\n` : "\n  // No steps\n";

  return {
    block: `test('${title}', { tag: ${tags} }, async ({ ${params} }) => {${body}});`,
    fixtureNames: Array.from(fixtureNames),
  };
}
