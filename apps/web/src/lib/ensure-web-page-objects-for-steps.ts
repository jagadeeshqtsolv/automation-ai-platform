import type { TestCase, TestStep } from "@automation-ai/core";
import {
  buildPageObjectStepIndex,
  resolvePageObjectEntry,
  resolvePageObjectEntryForStep,
} from "@/lib/page-object-step-index";
import { generateWebStepCode } from "@/lib/steps-to-playwright";
import { appendElementToWebPageObjectContent } from "@/lib/append-web-page-object-element";
import { buildWebPageClassFile } from "@/lib/screen-codegen/build-web-page-assets";
import { generateTestFixturesSource, TEST_FIXTURES_MODULE_PATH } from "@/lib/generate-test-fixtures";
import { writeFrameworkFiles } from "@/lib/local-framework/writer";
import {
  COMMON_PAGE_CLASS_NAME,
  COMMON_PAGE_MODULE_PATH,
  COMMON_PAGE_SCREEN_NAME,
  locatorKeyFromDescription,
  parseStepLocatorToWebElement,
  stepUsesPageObjectLocator,
} from "@/lib/parse-step-locator";
import { normalizePageClassName, normalizePageModulePath } from "@/lib/page-object-naming";
import type { PageObjectForSteps } from "@/lib/steps-to-mobilewright";
import { upsertWebPageObjectContent } from "@/lib/upsert-web-page-object";

function buildCommonPageTemplate(): string {
  return buildWebPageClassFile(COMMON_PAGE_SCREEN_NAME, []);
}

function findPageObjectIndex(pageObjects: PageObjectForSteps[], className: string): number {
  return pageObjects.findIndex((p) => p.className === className);
}

function resolveTargetPage(
  pageObjects: PageObjectForSteps[],
  step: TestStep,
): { className: string; screenName: string | null; modulePath: string; content: string } {
  const index = buildPageObjectStepIndex(pageObjects, { platform: "web" });
  const byScreen = resolvePageObjectEntry(index, step.screenName);
  if (byScreen !== null) {
    const row = pageObjects.find((p) => p.className === byScreen.className);
    if (row !== undefined) {
      return {
        className: row.className,
        screenName: row.screenName,
        modulePath: inferModulePath(row),
        content: row.content,
      };
    }
  }

  const byStep = resolvePageObjectEntryForStep(index, step);
  if (byStep !== null) {
    const row = pageObjects.find((p) => p.className === byStep.className);
    if (row !== undefined) {
      return {
        className: row.className,
        screenName: row.screenName,
        modulePath: inferModulePath(row),
        content: row.content,
      };
    }
  }

  if (step.screenName !== undefined && step.screenName.trim().length > 0) {
    const className = normalizePageClassName(step.screenName);
    const idx = findPageObjectIndex(pageObjects, className);
    if (idx >= 0) {
      const row = pageObjects[idx];
      return {
        className: row.className,
        screenName: row.screenName,
        modulePath: inferModulePath(row),
        content: row.content,
      };
    }
    return {
      className,
      screenName: step.screenName.trim(),
      modulePath: normalizePageModulePath(className),
      content: buildWebPageClassFile(step.screenName, []),
    };
  }

  const commonIdx = findPageObjectIndex(pageObjects, COMMON_PAGE_CLASS_NAME);
  if (commonIdx >= 0) {
    const row = pageObjects[commonIdx];
    return {
      className: row.className,
      screenName: row.screenName,
      modulePath: inferModulePath(row),
      content: row.content,
    };
  }

  return {
    className: COMMON_PAGE_CLASS_NAME,
    screenName: COMMON_PAGE_SCREEN_NAME,
    modulePath: COMMON_PAGE_MODULE_PATH,
    content: buildCommonPageTemplate(),
  };
}

function inferModulePath(row: PageObjectForSteps): string {
  const fromClass = normalizePageModulePath(row.className);
  if (row.content.includes(`export class ${row.className}`)) {
    return fromClass;
  }
  return fromClass;
}

function stepAlreadyHasMethod(step: TestStep, pageObjects: PageObjectForSteps[]): boolean {
  if (!stepUsesPageObjectLocator(step)) {
    return true;
  }
  const { code } = generateWebStepCode(step, pageObjects);
  const trimmed = code.trim();
  if (trimmed.includes("page.locator(") || /expect\s*\(\s*page\.locator/.test(trimmed)) {
    return false;
  }
  if (trimmed.startsWith("// TODO")) {
    return false;
  }
  return trimmed.startsWith("await ");
}

/**
 * Ensures each web plan step that needs a locator has a matching page-object method.
 * Unmatched locators go to the named screen page, a new page for `screenName`, or {@link COMMON_PAGE_CLASS_NAME}.
 */
export async function ensureWebPageObjectsForSteps(params: {
  projectId: string;
  projectName: string;
  steps: TestStep[];
  pageObjects: PageObjectForSteps[];
  /** When false, only updates the returned in-memory page objects (preview). Default true. */
  persist?: boolean;
}): Promise<PageObjectForSteps[]> {
  const persist = params.persist !== false;
  const updated: PageObjectForSteps[] = params.pageObjects.map((p) => ({ ...p }));
  const dirty = new Set<string>();

  for (const step of params.steps) {
    if (!stepUsesPageObjectLocator(step)) {
      continue;
    }
    if (stepAlreadyHasMethod(step, updated)) {
      continue;
    }

    const baseKey = locatorKeyFromDescription(step.targetDescription);
    const element = parseStepLocatorToWebElement(step, baseKey);
    if (element === null) {
      continue;
    }

    const target = resolveTargetPage(updated, step);
    const { content: nextContent, locatorKey } = appendElementToWebPageObjectContent(
      target.content,
      element,
      target.className,
    );

    const idx = findPageObjectIndex(updated, target.className);
    if (idx >= 0) {
      updated[idx] = {
        ...updated[idx],
        content: nextContent,
        screenName: target.screenName,
      };
    } else {
      updated.push({
        className: target.className,
        screenName: target.screenName,
        content: nextContent,
        methodSummary: undefined,
      });
    }

    dirty.add(target.className);
    void locatorKey; // locator appended under this key
  }

  if (dirty.size === 0 || !persist) {
    return updated;
  }

  for (const className of dirty) {
    const row = updated.find((p) => p.className === className);
    if (row === undefined) {
      continue;
    }
    const modulePath = inferModulePath(row);
    await upsertWebPageObjectContent({
      projectId: params.projectId,
      projectName: params.projectName,
      modulePath,
      content: row.content,
      className: row.className,
      screenName: row.screenName,
    });
  }

  const fixtureRows = updated.map((p) => ({
    className: p.className,
    modulePath: inferModulePath(p),
  }));

  await writeFrameworkFiles({
    projectId: params.projectId,
    projectName: params.projectName,
    files: [
      {
        relativePath: TEST_FIXTURES_MODULE_PATH,
        content: generateTestFixturesSource(fixtureRows, "web"),
      },
    ],
    overwritePageObjects: false,
    overwriteTests: false,
  });

  return updated;
}

export async function ensureWebPageObjectsForTestCase(params: {
  projectId: string;
  projectName: string;
  testCase: TestCase;
  pageObjects: PageObjectForSteps[];
  persist?: boolean;
}): Promise<PageObjectForSteps[]> {
  return ensureWebPageObjectsForSteps({
    projectId: params.projectId,
    projectName: params.projectName,
    steps: params.testCase.steps,
    pageObjects: params.pageObjects,
    persist: params.persist,
  });
}
