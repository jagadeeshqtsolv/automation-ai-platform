import { generateText } from "ai";
import { TEST_STEP_ACTIONS_PROMPT, testPlanSchema, type TestCase, type TestPlan } from "@automation-ai/core";
import { z } from "zod";
import { resolveAIModel } from "@/lib/project-ai-config";
import {
  enrichPageObjectWithExpectVisibilityMethods,
  enrichPageObjectWithFlowMethods,
} from "@/lib/enrich-page-object-flows";
import { enrichWebPageObjectWithFlowMethods } from "@/lib/enrich-web-page-object-flows";
import type { PageObjectSource } from "@/lib/page-object-expect-method-index";
import {
  buildPageObjectLibraryCatalog,
  stripRedundantGeneratedPageObjects,
} from "@/lib/page-object-library-context";
import { sanitizeGeneratedTestFileContent } from "@/lib/sanitize-generated-test-file";
import { sanitizePageObjectFileContent } from "@/lib/sanitize-page-object-file";
import { sanitizeWebPageObjectFileContent } from "@/lib/sanitize-web-page-object";

const fileEntrySchema = z.object({
  path: z.string().min(1).max(260),
  content: z.string().min(1).max(200_000),
});

const pomBundleSchema = z.object({
  pageObjectFiles: z.array(fileEntrySchema).max(20).optional().default([]),
  testFiles: z.array(fileEntrySchema).min(1).max(20),
});

export type PomMobilewrightBundle = z.infer<typeof pomBundleSchema>;

export type PageObjectLibraryEntry = {
  modulePath: string;
  className: string;
  content: string;
  methodSummary: string;
  screenName?: string | null;
};

export type EnvironmentLibraryEntry = {
  name: string;
  slug: string;
  configJson: string;
};

export function slugifyRequirementName(requirementTitle: string | null): string {
  const slug = (requirementTitle?.trim() || "requirement")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug.length > 0 ? slug : "requirement";
}

/** One spec file per requirement — all tests for that requirement live here. */
export function testSpecPathForRequirement(requirementTitle: string | null): string {
  return `tests/${slugifyRequirementName(requirementTitle)}.spec.ts`;
}

export function aggregateRequirementTestPlan(
  plans: TestPlan[],
  requirementTitle: string | null,
): TestPlan {
  const casesById = new Map<string, TestCase>();
  for (const plan of plans) {
    for (const testCase of plan.cases) {
      casesById.set(testCase.id, testCase);
    }
  }
  const cases = Array.from(casesById.values());
  if (cases.length === 0) {
    throw new Error("No test cases found for this requirement");
  }
  return {
    version: 1,
    suiteName: requirementTitle?.trim() || "Requirement",
    cases,
  };
}

function collectPageObjectClassNames(
  bundle: PomMobilewrightBundle,
  libraryClassNames: string[],
): string[] {
  const names = new Set(libraryClassNames);
  for (const file of bundle.pageObjectFiles) {
    const exported = /export\s+class\s+(\w+)/.exec(file.content);
    if (exported?.[1]) {
      names.add(exported[1]);
    }
    const fromPath = file.path.split("/").pop()?.replace(/\.ts$/i, "");
    if (fromPath !== undefined && fromPath.length > 0) {
      names.add(fromPath);
    }
  }
  return Array.from(names);
}

export type NormalizeSpecBundleOptions = {
  platform?: "mobile" | "web";
};

export function normalizeRequirementSpecBundle(
  bundle: PomMobilewrightBundle,
  requirementTitle: string | null,
  plan?: TestPlan,
  libraryClassNames: string[] = [],
  library: PageObjectLibraryEntry[] = [],
  options?: NormalizeSpecBundleOptions,
): PomMobilewrightBundle {
  const platform = options?.platform ?? "mobile";
  const isWeb = platform === "web";
  const keptPageObjects = stripRedundantGeneratedPageObjects(bundle.pageObjectFiles, library);
  const enrichedPageObjects = keptPageObjects.map((f) => ({
    ...f,
    content: isWeb
      ? sanitizeWebPageObjectFileContent(enrichWebPageObjectWithFlowMethods(f.content), f.path)
      : sanitizePageObjectFileContent(
        enrichPageObjectWithExpectVisibilityMethods(enrichPageObjectWithFlowMethods(f.content)),
      ),
  }));

  if (bundle.testFiles.length === 0) {
    return { ...bundle, pageObjectFiles: enrichedPageObjects };
  }

  const specPath = testSpecPathForRequirement(requirementTitle);
  const raw = bundle.testFiles.map((f) => f.content).join("\n\n");
  const fixtureClasses = collectPageObjectClassNames(
    { ...bundle, pageObjectFiles: enrichedPageObjects },
    libraryClassNames,
  );
  const fixtureClassesForTests =
    library.length > 0 ? library.map((p) => p.className) : fixtureClasses;
  const enrichLibraryContent = (content: string): string =>
    isWeb ? content : enrichPageObjectWithExpectVisibilityMethods(content);
  const pageObjectSources: PageObjectSource[] = [
    ...library.map((p) => ({
      className: p.className,
      content: enrichLibraryContent(p.content),
    })),
    ...enrichedPageObjects.map((f) => {
      const classMatch = f.content.match(/export class (\w+)/);
      return {
        className: classMatch?.[1] ?? "",
        content: f.content,
      };
    }),
  ].filter((row) => row.className.length > 0);
  const content = sanitizeGeneratedTestFileContent(
    raw,
    plan?.cases,
    fixtureClassesForTests,
    pageObjectSources,
    { platform },
  );
  return {
    ...bundle,
    pageObjectFiles: enrichedPageObjects,
    testFiles: [{ path: specPath, content }],
  };
}

export { sanitizeGeneratedTestFileContent } from "@/lib/sanitize-generated-test-file";

function buildLibraryContext(pages: PageObjectLibraryEntry[], env: EnvironmentLibraryEntry | null): string {
  const envBlock =
    env === null
      ? "No environment selected. Tests should not hardcode environment-specific URLs; use in-app navigation only."
      : [
        "Selected environment:",
        `- name: ${env.name}`,
        `- slug: ${env.slug}`,
        "- config JSON (read-only test configuration; never log or echo secrets):",
        env.configJson,
      ].join("\n");

  const pagesBlock =
    pages.length === 0
      ? "No existing page objects. You may create pageObjectFiles under pageobjects/ with locators + methods in ONE class each (private static readonly L = { ... })."
      : buildPageObjectLibraryCatalog(pages);

  return `${envBlock}\n\n${pagesBlock}`;
}

function libraryReuseRules(hasLibrary: boolean): string[] {
  if (!hasLibrary) {
    return [];
  }
  return [
    "CRITICAL — existing page object library is non-empty:",
    "- Set pageObjectFiles to [] (empty array). Do NOT recreate classes that already exist in the catalog.",
    "- In testFiles, use ONLY injected fixture parameters from the catalog (suffix mirrors class name: `loginPage` for LoginPage, `catalogScreen` for CatalogScreen, etc.).",
    "- NEVER write `new SomePage(screen)`, `new (await import(...)).SomePage(screen)`, or import page object classes in testFiles.",
    "- Call existing composed methods (performLogin, tapMenuItemLogin, expectAllMenuItemsVisible, etc.) instead of reimplementing low-level tap/fill steps.",
    "- Do not invent alternate class names for the same screen: reuse the exact catalog class/fixture pair (AI bundles typically use `*Page`; device recorder uses `*Screen`).",
  ];
}

const POM_TEST_RULES = [
  "You generate Mobilewright tests using Page Object Model (POM).",
  "Return JSON ONLY with this shape:",
  '{ "pageObjectFiles": [ { "path": "pageobjects/LoginPage.ts", "content": "..." } ], "testFiles": [ { "path": "tests/example.spec.ts", "content": "..." } ] }',
  "Page object class names must be meaningful PascalCase and end with `Page` (e.g. LoginPage, CheckoutShippingPage).",
  "File paths must be `pageobjects/<ClassName>.ts` matching the class name.",
  "Each page object class keeps locators and methods in one file:",
  "  - Use `private static readonly L = { key: { strategy: 'testId'|'label'|'text'|'role'|'placeholder', value: '...' }, ... } as const`",
  "  - Import `locate` from `../support/locate`, `expect` from `@mobilewright/test`.",
  "  - Tap/fill/assert via locators: `await locate(this.screen, LoginPage.L.username).tap()` — never `screen.tap(locate(...))` (screen.tap is coordinate-only).",
  "  - Assertions: `await expect(locate(this.screen, LoginPage.L.title)).toBeVisible()` — never `screen.expect`.",
  "  - test() tag arrays must use `@` prefixes, e.g. `{ tag: ['@smoke', '@US-101'] }`.",
  "  - Never call `screen.tap`, `screen.expect`, or `screen.getBy*` in testFiles — only page object methods.",
  "testFiles must import { test, expect } from '../support/fixtures' only (not @mobilewright/test).",
  "Do not import page object classes in testFiles — use fixtures from support/fixtures (e.g. loginPage, homePage).",
  "Never instantiate page objects inside tests: no `new XxxPage(screen)` and no dynamic import of pageobjects.",
  "Each page object should expose composed flow methods where appropriate (e.g. performLogin(username, password) grouping fillUsername, fillPassword, tapLogin).",
  "Tests must call composed flow methods on injected fixtures instead of repeating low-level steps when those methods exist in the catalog.",
  "Device/platform/bundleId settings come from mobilewright.config.ts (generated from Setup environment) — do not call test.use() in specs.",
  "Do not call screen.launchApp(), screen.terminateApp(), or screen.swipe() in testFiles — the device fixture launches the app from config; use page-object locator.swipe/scroll helpers instead.",
  "Tests must NOT call screen.getBy* directly.",
  "Use strategy 'testId' for iOS accessibility identifiers (maps to getByTestId).",
  "For volatile test data use crypto.randomUUID() in specs when needed.",
  "Example test callback: test('title', { tag: [...] }, async ({ screen, loginPage, homePage }) => { await loginPage.performLogin('user', 'pass'); })",
  "Do NOT include comments in generated TypeScript: no // line comments and no /* */ blocks.",
  "Do not annotate steps with comment lines; use descriptive test() titles only.",
  "Each test() title must exactly match the plan case `title` field.",
  "CRITICAL — test isolation: every test() must reach its starting UI itself (assume only the fresh app launch state). Never rely on another test() having run before it — workers run tests independently.",
  "When a case needs login, navigation, or logged-in state: first assert the default launch screen (e.g. catalog/products), open menu, tap Log In, then act — or call an existing composed flow on a fixture (e.g. performLogin) if the catalog exposes it.",
  "Never assert absence of UI with expect(fixture.someExpectVisibleMethod()).rejects.toThrow(). That is brittle with Playwright/Mobilewright. Add or use page-object methods that call expect(locator).not.toBeVisible() / hidden helpers from ../support/actions instead.",
  "In testFiles never invent symbolic helpers like expectElementVisible('SomeSymbolicKey') unless that exact method exists in the catalog — only call real methods from the library summary.",
  "Do not tag a test as @ios when steps only use Android resource-id locators (e.g. android:id/button1); split platform-specific cases or keep tags accurate.",
  "Only request fixture parameters the test body actually uses (e.g. catalogScreen, loginScreen) — omit unused screen fixtures from the async ({ ... }) destructuring.",
  "Do not use screen.waitForTimeout or page.waitForTimeout (not available). For wait steps use `import { sleep } from '@mobilewright/core'` and `await sleep(ms)`, or prefer page object assertions that wait for UI state.",
  "Prefer assertion/wait methods on page objects over arbitrary fixed sleeps when the next step validates UI.",
  "Never use test.beforeEach, test.afterEach, test.beforeAll, test.afterAll, or test.describe in testFiles. Every plan step must be await calls inside the matching test() body.",
  "Only list fixture parameters the test body actually uses (e.g. catalogScreen, menuScreen) — never pass every screen fixture on every test.",
  "Wrap each interaction/assertion in await test.step('Action — target', async () => { ... }) so HTML/JSON reports list Tap, Fill, Double tap, Assert visible, etc. Use human action verbs (Tap, Fill, Assert visible, Navigate back, Wait) — not only scenario titles like 'menu is visible'. One test.step per await when a case has multiple actions.",
  `Map plan step actions to Mobilewright: ${TEST_STEP_ACTIONS_PROMPT}.`,
  "Interactions: tap/doubleTap/longPress/fill/clear → locator APIs; typeText → driver.typeText(value) on focused field; tapAt → screen.tap(x,y) from value.",
  "Assertions: assertVisible/assertHidden → expect(locator).toBeVisible() / not.toBeVisible() or expectLocatorHidden; assertText → toHaveText; assertContainsText → toContainText; assertValue → getValue() compare; assertEnabled/assertDisabled → toBeEnabled/not.toBeEnabled; assertChecked/assertSelected/assertFocused → matching is* or waitFor state; assertCount → expect(await locator.count()).toBe(n) with assertion as count.",
  "Gestures: scrollIntoView → locator.scrollIntoViewIfNeeded({ direction }); swipe/pullToRefresh → locator.swipe or screen.swipe (value: direction, pullToRefresh usually down); gesture → driver.gesture or page-object wrapper (value describes path); back → screen.goBack(); pressButton → screen.pressButton(value).",
  "App/device: screenshot → screen.screenshot() or locator.screenshot(); launchApp/terminateApp → device launchApp/terminateApp(bundleId from value); setOrientation → setOrientation(portrait|landscape).",
  "Timing/links: wait → sleep(ms); waitForVisible/waitForHidden → locator.waitFor({ state: 'visible'|'hidden', timeout }); openDeepLink → in-app navigation; openUrl → driver.openUrl(value). Never hardcode secrets or production URLs.",
].join("\n");

export async function generateMobilewrightPomBundle(params: {
  plan: TestPlan;
  pageObjects: PageObjectLibraryEntry[];
  environment: EnvironmentLibraryEntry | null;
  requirementTitle: string | null;
  projectId: string;
  scope?: "full-plan" | "single-case";
  /** When set, emphasize updating this case while keeping all cases in the requirement spec */
  focusTestCaseId?: string;
}): Promise<{ bundle: PomMobilewrightBundle; model: string }> {
  const { model, modelId } = await resolveAIModel(params.projectId);
  const plan = testPlanSchema.parse(params.plan);
  const hasLibrary = params.pageObjects.length > 0;
  const libraryContext = buildLibraryContext(params.pageObjects, params.environment);
  const specPath = testSpecPathForRequirement(params.requirementTitle);
  const systemRules = [...POM_TEST_RULES.split("\n"), ...libraryReuseRules(hasLibrary)].join("\n");

  const { text: raw } = await generateText({
    model,
    system: ["You are an expert Mobilewright engineer.", systemRules].join("\n"),
    temperature: 0.12,
    messages: [
      {
        role: "user",
        content: [
          "Generate Mobilewright specs for this requirement.",
          params.scope === "single-case" && params.focusTestCaseId !== undefined
            ? `Return exactly ONE entry in testFiles containing only the focused case id "${params.focusTestCaseId}".`
            : "Return exactly ONE entry in testFiles containing ALL test cases from the plan JSON.",
          `Each case must be its own test() block in that single file. The testFiles path MUST be exactly: ${specPath}`,
          params.scope === "single-case" && params.focusTestCaseId !== undefined
            ? `Generate only the single test() block for case id "${params.focusTestCaseId}". Do not include test() blocks for any other cases in the plan JSON.`
            : "Include one test() per case id in the plan JSON.",
          "Test plan JSON:",
          JSON.stringify(plan),
          "",
          "Project library context:",
          libraryContext,
          hasLibrary
            ? "Reminder: pageObjectFiles must be []. Tests must use fixture methods from the catalog only."
            : "",
        ].join("\n"),
      },
    ],
  });

  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Model returned an empty response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Model returned non-JSON content");
  }

  const bundle = normalizeRequirementSpecBundle(
    pomBundleSchema.parse(parsed),
    params.requirementTitle,
    plan,
    params.pageObjects.map((p) => p.className),
    params.pageObjects,
  );
  return { bundle, model: modelId };
}

export function flattenPomBundleForStorage(bundle: PomMobilewrightBundle): string {
  const parts: string[] = [];
  if (bundle.pageObjectFiles.length > 0) {
    parts.push("// === Page objects ===");
    for (const f of bundle.pageObjectFiles) {
      parts.push(`// ---- ${f.path} ----`, f.content);
    }
  }
  parts.push("// === Tests ===");
  for (const f of bundle.testFiles) {
    parts.push(`// ---- ${f.path} ----`, f.content);
  }
  return parts.join("\n\n");
}
