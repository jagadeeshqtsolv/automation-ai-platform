import type { ProjectPlatformType } from "@automation-ai/core";
import type { TestCase } from "@automation-ai/core";
import {
  generateTestCaseBlock as generateMobileTestCaseBlock,
  generateTestCaseStepCodes as generateMobileTestCaseStepCodes,
  type PageObjectForSteps,
  type StepCodegenResult,
} from "@/lib/steps-to-mobilewright";
import {
  generateWebTestCaseBlock,
  generateWebTestCaseStepCodes,
} from "@/lib/steps-to-playwright";

/** Platform-aware test spec block generation (mobile = Mobilewright, web = Playwright). */
export function generateTestCaseBlock(
  testCase: TestCase,
  pageObjects: PageObjectForSteps[],
  platform: ProjectPlatformType,
): { block: string; fixtureNames: string[] } {
  if (platform === "web") {
    return generateWebTestCaseBlock(testCase, pageObjects);
  }
  return generateMobileTestCaseBlock(testCase, pageObjects);
}

export function generateTestCaseStepCodes(
  testCase: TestCase,
  pageObjects: PageObjectForSteps[],
  platform: ProjectPlatformType,
): StepCodegenResult {
  if (platform === "web") {
    return generateWebTestCaseStepCodes(testCase, pageObjects);
  }
  return generateMobileTestCaseStepCodes(testCase, pageObjects);
}

export type { PageObjectForSteps, StepCodegenResult };
