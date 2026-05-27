import { generateText } from "ai";
import { testPlanSchema, type TestPlan } from "@automation-ai/core";
import { z } from "zod";
import { resolveAIModel } from "@/lib/project-ai-config";
import {
  aggregateRequirementTestPlan,
  normalizeRequirementSpecBundle,
  type EnvironmentLibraryEntry,
  type PageObjectLibraryEntry,
  type PomMobilewrightBundle,
  testSpecPathForRequirement,
} from "@/lib/generate-mobilewright-bundle";
import { buildPageObjectLibraryCatalog } from "@/lib/page-object-library-context";

const pomBundleSchema = z.object({
  pageObjectFiles: z
    .array(
      z.object({
        path: z.string().min(1).max(260),
        content: z.string().min(1).max(200_000),
      }),
    )
    .max(20)
    .optional()
    .default([]),
  testFiles: z
    .array(
      z.object({
        path: z.string().min(1).max(260),
        content: z.string().min(1).max(200_000),
      }),
    )
    .min(1)
    .max(20),
  testDataFile: z
    .object({
      path: z.string().min(1).max(260),
      content: z.string().min(1).max(200_000),
    })
    .optional(),
});

const WEB_POM_RULES = [
  "You generate Playwright **web** tests using Page Object Model (POM).",
  'Return JSON ONLY: { "pageObjectFiles": [...], "testFiles": [...] }',
  "Page object classes require exactly ONE import block: `import { webLocator, clickWhenVisible, ... } from '../support/web-actions'`. webLocator is exported from web-actions — do NOT add a separate import from web-locate.",
  "All available helpers from '../support/web-actions' (include ALL of these, including webLocator): webLocator, clickWhenVisible, doubleClickWhenVisible, longPressWhenVisible, hoverWhenVisible, fillWhenVisible, clearWhenVisible, typeTextWhenVisible, checkWhenVisible, uncheckWhenVisible, selectOptionWhenVisible, scrollIntoViewWhenVisible, getTextWhenVisible, expectVisible, expectHidden, expectText, expectContainsText, expectValue, expectEnabled, expectDisabled, expectChecked, expectUnchecked, expectFocused, expectCount, expectCountGreaterThan, clickOpensNewPage, waitForNewPage, closePage — never mobile tap helpers.",
  "clickWhenVisible / fillWhenVisible scroll targets into view and retry clicks when needed — do not add scrollIntoView before every click in tests.",
  "Locators: private static readonly L = { key: { strategy: 'testId'|'label'|'placeholder'|'role'|'text'|'css', value: '...', role?: 'button'|'link'|'textbox'|..., frame?: 'iframe#id', shadowHost?: 'x-component', actionKind: 'button'|'link'|'textbox'|'checkbox'|'radio'|'combobox'|'generic' as const }, ... } as const",
  "Use frame for elements inside iframes; shadowHost for open shadow DOM hosts. New tabs: use clickOpensNewPage(page, locator) when clicking opens a new tab; use waitForNewPage(page) to wait for an already-triggered popup.",
  "Prefer testId, css (#id or [name=]), label, placeholder, then role+name. Use click* for buttons/links, fill* for inputs, check*/uncheck* for checkboxes (never click* on checkbox inputs — labels intercept clicks).",
  "Checkbox locators: strategy css with input[type=checkbox][name=...] or #id; actionKind: 'checkbox' as const; methods check{Key}() using checkWhenVisible and uncheck{Key}() using uncheckWhenVisible.",
  "Methods use `this.page` and webLocator(this.page, ClassName.L.key).",
  "testFiles import { test, expect } from '../support/fixtures' only.",
  "Use injected fixture parameters (loginPage, homePage) — never `new LoginPage(page)` in tests.",
  "baseURL is set in playwright.config.ts from environments/qa.json — NEVER hardcode full URLs (e.g. https://example.com/login) in test files. Always use relative paths: `await page.goto('/')` for app entry, `await page.goto('/path')` for specific routes.",
  "Test data (search keywords, product names, user credentials, any string value used as test input) MUST be imported from `../testdata/test-data.json` — add `import testData from '../testdata/test-data.json';` (no assert clause) at the top of testFiles and reference values via testData (e.g. testData.search.keyword). Never hardcode test input strings directly in test() bodies.",
  "STEP NAMING — CRITICAL: Each plan step must map to EXACTLY ONE test.step(). The step title MUST be '{ActionLabel} — {targetDescription}' using these ActionLabel mappings: tap→Click, doubleTap→Double click, longPress→Click and hold, hover→Hover, fill→Fill, clear→Clear, typeText→Type, check→Check, uncheck→Uncheck, selectOption→Select, assertVisible/waitForVisible→Assert visible, assertHidden/waitForHidden→Assert hidden, assertText→Assert text, assertContainsText→Assert contains, assertValue→Assert value, assertEnabled→Assert enabled, assertDisabled→Assert disabled, assertChecked→Assert checked, assertUnchecked→Assert unchecked, assertFocused→Assert focused, assertCount→Assert count, assertCountGreaterThan→Assert count greater than, scrollIntoView→Scroll, back→Navigate back, openUrl/launchApp→Open, wait→Wait, screenshot→Screenshot, switchToFrame→Switch to iframe, switchToNewTab→Switch to tab, closeTab→Close tab. NEVER invent a custom step name. NEVER group multiple plan steps under a single test.step().",
  "PRECONDITIONS: For each entry in testCase.preconditions generate a test.step('Before — {preconditionText}', async () => { <code> }) placed BEFORE the plan steps. Map each precondition to real Playwright code using these rules — NEVER leave the body empty: (1) URL/reachability e.g. 'Application URL is reachable' or contains 'http' → `await page.goto('/'); await expect(page).not.toHaveTitle(/404|Error|Not Found/i);` (2) Login/authentication e.g. 'User is logged in', 'authenticated', 'valid credentials' → use the loginPage fixture: fill credentials from testData then click login, e.g. `await loginPage.fillUsername(testData.auth.username); await loginPage.fillPassword(testData.auth.password); await loginPage.clickLoginButton();` (3) Homepage/landing page e.g. 'User is on the homepage', 'home page is open' → `await page.goto('/');` (4) Specific page e.g. 'User is on the cart page', 'product detail page is open' → `await page.goto('/cart');` using the inferred route (5) Test data e.g. 'Test data: X = Y' → skip entirely, test data is already imported from test-data.json (6) Browser/app state e.g. 'Browser is open', 'App is running' → skip entirely, Playwright handles this. For any precondition that does not match a known pattern, generate `await page.goto('/');` as a safe default — never generate an empty body.",
  "Each test() title must exactly match the plan case title field.",
  "Map plan step actions to page-object methods: tap→click{Key}(), doubleTap→doubleClick{Key}(), longPress→longPress{Key}(), fill→fill{Key}(value), clear→clear{Key}(), typeText→typeText{Key}(value), assertVisible/waitForVisible→expect{Key}Visible(), assertHidden/waitForHidden→expect{Key}Hidden(), assertText→expect{Key}Text(text), assertContainsText→expect{Key}ContainsText(text), assertValue→expect{Key}Value(value), assertEnabled→expect{Key}Enabled(), assertDisabled→expect{Key}Disabled(), assertChecked→expect{Key}Checked() (use expect{Key}Unchecked() when assertion=false), assertFocused→expect{Key}Focused(), assertCount→expect{Key}Count(n), scrollIntoView→scroll{Key}IntoView().",
  "Non-locator actions (use inline in testFiles with the `page` fixture): back→await page.goBack(); openUrl/launchApp→await page.goto('/path'); wait→DO NOT use page.waitForTimeout — instead call the page-object method that waits for the element that appears/changes (e.g. cartPage.waitForCartCountVisible()), or use waitForVisible(locator)/waitForHidden(locator) inline; screenshot→await page.screenshot(); switchToFrame→set frame property in the L entry instead of inline code; switchToMainFrame→use locators without frame in L; switchToNewTab→const tab=await page.waitForEvent('popup',{timeout:30_000}); await tab.waitForLoadState('domcontentloaded'); closeTab→await page.close().",
  "No // or /* */ comments in TypeScript output.",
  "Each test() must be isolated — navigate from a known entry state per test.",
  "Never import @mobilewright/core or use sleep(). Never use page.waitForTimeout() — it causes flaky, slow tests. Always wait for an observable element state: call a page-object waitFor* or expectVisible method, or use waitForVisible(locator)/waitForHidden(locator) inline in the test.",
  "For navigation always use `await page.goto('/relative-path')` — baseURL is resolved from playwright.config.ts. launchApp → page.goto('/'). Never use absolute https:// URLs in test files. Do not use fixture.page (private).",
  "Do not add @ios or @android tags — web tests are browser-only.",
  "Never use `page.locator(...)` or raw `expect(page.locator(...))` in testFiles — every interaction must call a page-object fixture method.",
  "Put all locators in pageObjectFiles under `private static readonly L` with methods (click*, fill*, expect*).",
  "Page object class assignment: if a test flow touches multiple distinct pages of the application under test (e.g. Home, Search Results, Product Detail, Cart, Checkout), create a DEDICATED page object class for each distinct page — never group locators from different pages into CommonPage. Only use CommonPage for elements that are truly global across every page (site-wide nav bar, header, footer, global toast/snackbar). If ALL steps of a test belong to a single page that has no existing page object, create one dedicated class for it.",
  "Page-to-class matching priority: (1) match an existing page class by its callable methods or module path; (2) infer from action context — search-bar/search-button → SearchPage or HomePage; search results list → SearchResultsPage; product detail/add-to-cart/buy-now → ProductPage; cart/quantity/remove → CartPage; login form/sign-in → LoginPage; checkout/payment → CheckoutPage; (3) only if an element is genuinely site-wide (top-nav, global toast) → CommonPage. Always include new classes in pageObjectFiles with their own fixture parameter.",
].join("\n");

function extractJsonFromResponse(text: string): string {
  const trimmed = text.trim();
  try { JSON.parse(trimmed); return trimmed; } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fenced) {
    const inner = fenced[1]!.trim();
    try { JSON.parse(inner); return inner; } catch {}
  }
  const start = trimmed.indexOf("{");
  if (start !== -1) {
    let depth = 0, inString = false, escape = false;
    for (let i = start; i < trimmed.length; i++) {
      const c = trimmed[i]!;
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === "{") depth++;
      else if (c === "}") { depth--; if (depth === 0) return trimmed.slice(start, i + 1); }
    }
  }
  return trimmed;
}

export async function generatePlaywrightWebPomBundle(params: {
  plan: TestPlan;
  pageObjects: PageObjectLibraryEntry[];
  environment: EnvironmentLibraryEntry | null;
  requirementTitle: string | null;
  projectId: string;
  scope?: "full-plan" | "single-case";
  focusTestCaseId?: string;
  currentTestData?: string;
}): Promise<{ bundle: PomMobilewrightBundle & { testDataFile?: { path: string; content: string } }; model: string }> {
  const { model, modelId } = await resolveAIModel(params.projectId);
  const plan = testPlanSchema.parse(params.plan);
  const hasLibrary = params.pageObjects.length > 0;
  const libraryContext =
    params.environment === null
      ? "No environment selected."
      : ["Environment:", params.environment.name, params.environment.configJson].join("\n");
  const pagesBlock =
    params.pageObjects.length === 0
      ? "No page objects yet — create under pageobjects/."
      : buildPageObjectLibraryCatalog(params.pageObjects);
  const specPath = testSpecPathForRequirement(params.requirementTitle);

  const { text: raw } = await generateText({
    model,
    system: ["Expert Playwright web engineer.", WEB_POM_RULES].join("\n"),
    temperature: 0.12,
    messages: [
      {
        role: "user",
        content: [
          "Generate Playwright web specs for this requirement.",
          `Single testFiles path: ${specPath}`,
          params.scope === "single-case" && params.focusTestCaseId !== undefined
            ? `Return exactly ONE entry in testFiles containing only the focused case id "${params.focusTestCaseId}".`
            : "Return exactly ONE entry in testFiles containing ALL test cases from the plan JSON.",
          params.scope === "single-case" && params.focusTestCaseId !== undefined
            ? `Generate only the single test() block for case id "${params.focusTestCaseId}". Do not include test() blocks for any other cases in the plan JSON.`
            : "Include one test() per case id in the plan JSON.",
          "Test plan:",
          JSON.stringify(plan),
          libraryContext,
          pagesBlock,
          hasLibrary
            ? "Existing page objects are listed above. For each page object file: if ALL methods called by the test cases already exist in the catalog, omit that file from pageObjectFiles. If ANY method is missing, include the COMPLETE updated class (all existing methods + new ones) in pageObjectFiles so missing methods are added."
            : "",
          "",
          "Current testdata/test-data.json (add any new keys the tests need — output the full updated JSON as testDataFile with path 'testdata/test-data.json'):",
          params.currentTestData ?? "{}",
        ].join("\n"),
      },
    ],
  });

  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("Model returned an empty response");
  }

  const cleaned = extractJsonFromResponse(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned) as unknown;
  } catch {
    throw new Error("Model returned non-JSON content");
  }

  const rawBundle = pomBundleSchema.parse(parsed);
  const bundle = normalizeRequirementSpecBundle(
    rawBundle,
    params.requirementTitle,
    plan,
    params.pageObjects.map((p) => p.className),
    params.pageObjects,
    { platform: "web" },
  );

  return { bundle: { ...bundle, testDataFile: rawBundle.testDataFile }, model: modelId };
}

export { aggregateRequirementTestPlan, testSpecPathForRequirement };
