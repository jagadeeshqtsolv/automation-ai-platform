import { testPlanSchema, type TestPlan } from "@automation-ai/shared";
import { z } from "zod";
import { normalizeOpenAITemperature, resolveOpenAIClient } from "@/lib/openai-client";
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
});

const WEB_POM_RULES = [
  "You generate Playwright **web** tests using Page Object Model (POM).",
  'Return JSON ONLY: { "pageObjectFiles": [...], "testFiles": [...] }',
  "Page object classes require exactly two import lines: (1) `import { webLocator } from '../support/web-locate'` and (2) `import { clickWhenVisible, ... } from '../support/web-actions'`. Do NOT include webLocator in the web-actions import — it is only imported from web-locate.",
  "All available helpers from '../support/web-actions': clickWhenVisible, doubleClickWhenVisible, longPressWhenVisible, hoverWhenVisible, fillWhenVisible, clearWhenVisible, typeTextWhenVisible, checkWhenVisible, uncheckWhenVisible, selectOptionWhenVisible, scrollIntoViewWhenVisible, getTextWhenVisible, expectVisible, expectHidden, expectText, expectContainsText, expectValue, expectEnabled, expectDisabled, expectChecked, expectUnchecked, expectFocused, expectCount, expectCountGreaterThan, clickOpensNewPage, waitForNewPage, closePage — never mobile tap helpers.",
  "clickWhenVisible / fillWhenVisible scroll targets into view and retry clicks when needed — do not add scrollIntoView before every click in tests.",
  "Locators: private static readonly L = { key: { strategy: 'testId'|'label'|'placeholder'|'role'|'text'|'css', value: '...', role?: 'button'|'link'|'textbox'|..., frame?: 'iframe#id', shadowHost?: 'x-component', actionKind: 'button'|'link'|'textbox'|'checkbox'|'radio'|'combobox'|'generic' as const }, ... } as const",
  "Use frame for elements inside iframes; shadowHost for open shadow DOM hosts. New tabs: use clickOpensNewPage(page, locator) when clicking opens a new tab; use waitForNewPage(page) to wait for an already-triggered popup.",
  "Prefer testId, css (#id or [name=]), label, placeholder, then role+name. Use click* for buttons/links, fill* for inputs, check*/uncheck* for checkboxes (never click* on checkbox inputs — labels intercept clicks).",
  "Checkbox locators: strategy css with input[type=checkbox][name=...] or #id; actionKind: 'checkbox' as const; methods check{Key}() using checkWhenVisible and uncheck{Key}() using uncheckWhenVisible.",
  "Methods use `this.page` and webLocator(this.page, ClassName.L.key).",
  "testFiles import { test, expect } from '../support/fixtures' only.",
  "Use injected fixture parameters (loginPage, homePage) — never `new LoginPage(page)` in tests.",
  "baseURL is set in playwright.config.ts — app entry / launch must use `await page.goto('/')` (baseURL root), never `/login` unless the step explicitly navigates to a login route.",
  "Use await test.step('Click — …', async () => { ... }) for each action (not Tap).",
  "Map plan step actions to page-object methods: tap→click{Key}(), doubleTap→doubleClick{Key}(), longPress→longPress{Key}(), fill→fill{Key}(value), clear→clear{Key}(), typeText→typeText{Key}(value), assertVisible/waitForVisible→expect{Key}Visible(), assertHidden/waitForHidden→expect{Key}Hidden(), assertText→expect{Key}Text(text), assertContainsText→expect{Key}ContainsText(text), assertValue→expect{Key}Value(value), assertEnabled→expect{Key}Enabled(), assertDisabled→expect{Key}Disabled(), assertChecked→expect{Key}Checked() (use expect{Key}Unchecked() when assertion=false), assertFocused→expect{Key}Focused(), assertCount→expect{Key}Count(n), scrollIntoView→scroll{Key}IntoView().",
  "Non-locator actions (use inline in testFiles with the `page` fixture): back→await page.goBack(); openUrl/launchApp→await page.goto('/path'); wait→await page.waitForTimeout(ms); screenshot→await page.screenshot(); switchToFrame→set frame property in the L entry instead of inline code; switchToMainFrame→use locators without frame in L; switchToNewTab→const tab=await page.waitForEvent('popup',{timeout:30_000}); await tab.waitForLoadState('domcontentloaded'); closeTab→await page.close().",
  "No // or /* */ comments in TypeScript output.",
  "Each test() must be isolated — navigate from a known entry state per test.",
  "Never import @mobilewright/core or use sleep() — for waits use `await page.waitForTimeout(ms)` with the `page` fixture in the test callback.",
  "For navigation use `await page.goto('/relative-path')` against baseURL, or a full https URL when required. launchApp → page.goto('/'). Do not use fixture.page (private).",
  "Do not add @ios or @android tags — web tests are browser-only.",
  "Never use `page.locator(...)` or raw `expect(page.locator(...))` in testFiles — every interaction must call a page-object fixture method.",
  "Put all locators in pageObjectFiles under `private static readonly L` with methods (click*, fill*, expect*).",
  "When no screen-specific page exists, add locators and methods to CommonPage (pageobjects/CommonPage.ts, fixture commonPage).",
  "If a step targets a named screen, prefer that screen's page class; otherwise use CommonPage.",
].join("\n");

export async function generatePlaywrightWebPomBundle(params: {
  plan: TestPlan;
  pageObjects: PageObjectLibraryEntry[];
  environment: EnvironmentLibraryEntry | null;
  requirementTitle: string | null;
  projectId: string;
  scope?: "full-plan" | "single-case";
  focusTestCaseId?: string;
}): Promise<{ bundle: PomMobilewrightBundle; model: string }> {
  const { client, model } = await resolveOpenAIClient(params.projectId);
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

  const completion = await client.chat.completions.create({
    model,
    temperature: normalizeOpenAITemperature(model, 0.12),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ["Expert Playwright web engineer.", WEB_POM_RULES].join("\n") },
      {
        role: "user",
        content: [
          "Generate Playwright web specs for this requirement.",
          `Single testFiles path: ${specPath}`,
          "Test plan:",
          JSON.stringify(plan),
          libraryContext,
          pagesBlock,
          hasLibrary ? "pageObjectFiles must be [] when catalog is non-empty." : "",
        ].join("\n"),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
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
    { platform: "web" },
  );

  return { bundle, model };
}

export { aggregateRequirementTestPlan, testSpecPathForRequirement };
