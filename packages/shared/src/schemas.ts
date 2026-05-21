import { z } from "zod";
import { projectPlatformTypeSchema } from "./project-platform";
import { TEST_STEP_ACTIONS } from "./test-step-actions";

/** Limits for prompt injection / abuse — tune per product tier */
export const REQUIREMENT_MAX_CHARS = 48_000;
export const PROJECT_NAME_MAX = 120;
export const ENV_NAME_MAX = 80;
export const ENV_SLUG_MAX = 64;
export const CONFIG_JSON_MAX = 16_000;
export const PAGE_OBJECT_PATH_MAX = 200;
export const PAGE_OBJECT_CONTENT_MAX = 120_000;
export const METHOD_SUMMARY_MAX = 4_000;

export const organizationMemberRoleSchema = z.enum(["owner", "member"]);

export const registerBodySchema = z.object({
  inviteToken: z.string().min(16).max(128),
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(120).optional(),
});

export const createInviteBodySchema = z.object({
  email: z.string().email().max(200),
  role: organizationMemberRoleSchema.default("member"),
});

export const assignMemberBodySchema = z.object({
  email: z.string().email().max(200),
  role: organizationMemberRoleSchema.default("member"),
});

export const loginBodySchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(128),
});

export const createOrganizationBodySchema = z.object({
  name: z.string().min(1).max(120),
});

export const setOrganizationDisabledBodySchema = z.object({
  disabled: z.boolean(),
});

export const updateProjectOpenAISettingsBodySchema = z.object({
  openaiApiKey: z.string().min(1).max(256).nullable().optional(),
  openaiModel: z.string().min(1).max(80).nullable().optional(),
});

export const createProjectBodySchema = z.object({
  name: z.string().min(1).max(PROJECT_NAME_MAX),
  organizationId: z.string().uuid(),
  platformType: projectPlatformTypeSchema.default("mobile"),
});

export const createRequirementBodySchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(REQUIREMENT_MAX_CHARS),
});

export const updateRequirementBodySchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(REQUIREMENT_MAX_CHARS),
});

export const generatePlanBodySchema = z.object({
  requirementId: z.string().uuid(),
});

export const generateCodeBodySchema = z.object({
  testPlanId: z.string().uuid(),
  /** When set, generate Mobilewright for this case only; omit to generate the full plan */
  testCaseId: z.string().min(1).max(120).optional(),
  environmentId: z.string().uuid().optional(),
  /** When true, replace page objects in the library that share a module path with generated files */
  overwriteExistingPageObjects: z.boolean().optional().default(false),
});

export const createEnvironmentBodySchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(ENV_NAME_MAX),
  slug: z
    .string()
    .min(1)
    .max(ENV_SLUG_MAX)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase letters, digits, or hyphen segments"),
  description: z.string().max(500).optional(),
  configJson: z.string().max(CONFIG_JSON_MAX).optional(),
});

export const updateEnvironmentBodySchema = z.object({
  name: z.string().min(1).max(ENV_NAME_MAX).optional(),
  description: z.string().max(500).nullable().optional(),
  configJson: z.string().max(CONFIG_JSON_MAX).optional(),
});

export const createPageObjectBodySchema = z.object({
  projectId: z.string().uuid(),
  className: z.string().min(1).max(120),
  modulePath: z.string().min(1).max(PAGE_OBJECT_PATH_MAX),
  content: z.string().min(1).max(PAGE_OBJECT_CONTENT_MAX),
  methodSummary: z.string().max(METHOD_SUMMARY_MAX).optional(),
});

export const updatePageObjectBodySchema = z.object({
  className: z.string().min(1).max(120).optional(),
  content: z.string().min(1).max(PAGE_OBJECT_CONTENT_MAX).optional(),
  methodSummary: z.string().max(METHOD_SUMMARY_MAX).optional(),
  elementsJson: z.string().max(CONFIG_JSON_MAX).optional(),
});

/** Mobile (Mobilewright) accessibility locator strategies. */
export const mobileLocatorStrategySchema = z.enum(["testId", "label", "text", "role", "placeholder"]);

/** @deprecated Use mobileLocatorStrategySchema — kept for compatibility. */
export const locatorStrategySchema = mobileLocatorStrategySchema;

export const screenElementSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Key must be a valid identifier"),
  strategy: mobileLocatorStrategySchema,
  value: z.string().min(1).max(300),
  role: z.string().max(80).optional(),
});

export type ScreenElement = z.infer<typeof screenElementSchema>;

/** Web (Playwright) locator strategies — includes CSS for stable id/name selectors. */
export const webLocatorStrategySchema = z.enum([
  "testId",
  "label",
  "placeholder",
  "role",
  "text",
  "css",
]);

export const webPageElementActionKindSchema = z.enum([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "generic",
]);

export const webPageElementSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Key must be a valid identifier"),
  strategy: webLocatorStrategySchema,
  value: z.string().min(1).max(300),
  role: z.string().max(80).optional(),
  /** CSS selector for iframe (Playwright frameLocator). */
  frame: z.string().min(1).max(300).optional(),
  /** CSS selector for shadow host element before inner locator. */
  shadowHost: z.string().min(1).max(300).optional(),
  /** 0-based index when multiple elements match (auto-heal sets 0 = first). */
  index: z.number().int().min(0).max(20).optional(),
  actionKind: webPageElementActionKindSchema,
});

export type WebPageElement = z.infer<typeof webPageElementSchema>;
export type WebPageElementActionKind = z.infer<typeof webPageElementActionKindSchema>;

const recordedPageNameSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(
    /^[A-Za-z][A-Za-z0-9\s\-_]*$/,
    "Name must start with a letter (e.g. Login or Checkout shipping)",
  );

export const saveScreenFromDeviceBodySchema = z.object({
  projectId: z.string().uuid(),
  screenName: recordedPageNameSchema,
  environmentId: z.string().uuid().optional(),
  elements: z.array(screenElementSchema).min(1).max(80),
  overwriteExisting: z.boolean().optional().default(true),
});

export const saveWebPageFromBrowserBodySchema = z.object({
  projectId: z.string().uuid(),
  pageName: recordedPageNameSchema,
  environmentId: z.string().uuid().optional(),
  elements: z.array(webPageElementSchema).min(1).max(80),
  overwriteExisting: z.boolean().optional().default(true),
});

export const testStepActionSchema = z.enum(TEST_STEP_ACTIONS);

export const testStepSchema = z.object({
  id: z.string().min(1),
  action: testStepActionSchema,
  targetDescription: z.string().min(1),
  /** Accessibility label, role+name hint, or id — best-effort from LLM */
  locatorHint: z.string().optional(),
  /** Page object class or screen label (e.g. CatalogScreen, Login) for fixture method reuse */
  screenName: z.string().max(120).optional(),
  /** Explicit page-object method on the fixture (e.g. performLogin, tapOpenMenu) */
  pageObjectMethod: z
    .string()
    .max(120)
    .optional()
    .transform((val) => {
      if (val === undefined) {
        return undefined;
      }
      let name = val.trim();
      if (name.endsWith("()")) {
        name = name.slice(0, -2).trim();
      }
      return name.length > 0 ? name : undefined;
    }),
  value: z.string().optional(),
  assertion: z.string().optional(),
  /** Raw TypeScript for this step — used as-is inside test.step when set */
  customCode: z.string().max(4_000).optional(),
});

export const testCasePlatformSchema = z.enum([
  "ios",
  "android",
  "chrome",
  "firefox",
  "safari",
  "edge",
]);

export type TestCasePlatform = z.infer<typeof testCasePlatformSchema>;

export const testCaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  priority: z.enum(["P0", "P1", "P2"]).default("P1"),
  platforms: z.array(testCasePlatformSchema).min(1),
  preconditions: z.array(z.string()).default([]),
  steps: z.array(testStepSchema).min(1),
  tags: z.array(z.string()).default([]),
});

export const testPlanSchema = z.object({
  version: z.literal(1),
  suiteName: z.string().min(1),
  cases: z.array(testCaseSchema).min(0),
});

/** Stored when a requirement is created from the test-plan flow with no details yet. */
export const EMPTY_REQUIREMENT_CONTENT_PLACEHOLDER =
  "No requirement details yet. Add acceptance criteria on the Requirements tab when ready.";

export const createTestPlanBodySchema = z
  .object({
    suiteName: z.string().min(1).max(200),
    /** Link to an existing requirement. Omit to create a new requirement for this plan. */
    requirementId: z.string().uuid().optional(),
    requirementTitle: z.string().max(200).optional(),
    requirementContent: z.string().max(REQUIREMENT_MAX_CHARS).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.requirementId !== undefined) {
      return;
    }
    const content = data.requirementContent?.trim() ?? "";
    if (content.length > 0) {
      return;
    }
    // Empty content is allowed — server applies EMPTY_REQUIREMENT_CONTENT_PLACEHOLDER.
    if (data.requirementTitle !== undefined && data.requirementTitle.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Requirement title cannot be blank when provided",
        path: ["requirementTitle"],
      });
    }
  });

export const updateTestCaseBodySchema = z.object({
  testCase: testCaseSchema,
});

export const createTestCaseBodySchema = z.object({
  testCase: testCaseSchema,
});

export type TestPlan = z.infer<typeof testPlanSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
export type TestStep = z.infer<typeof testStepSchema>;

export const EXECUTION_CONFIG_JSON_MAX = 8_000;

export const executionProviderSchema = z.enum([
  "local",
  "saucelabs",
  "browserstack",
  "lambdatest",
  "custom",
]);

export const sauceLabsExecutionSchema = z.object({
  username: z.string().min(1).max(200),
  accessKey: z.string().min(1).max(256).optional(),
  region: z.enum(["us-west-1", "eu-central-1", "apac-southeast-1"]).default("us-west-1"),
  deviceName: z.string().min(1).max(120).optional(),
  platformVersion: z.string().min(1).max(40).optional(),
  app: z.string().min(1).max(500).optional(),
  buildName: z.string().min(1).max(120).optional(),
});

export const browserStackExecutionSchema = z.object({
  username: z.string().min(1).max(200),
  accessKey: z.string().min(1).max(256).optional(),
  deviceName: z.string().min(1).max(120).optional(),
  osVersion: z.string().min(1).max(40).optional(),
  appUrl: z.string().min(1).max(500).optional(),
});

export const lambdaTestExecutionSchema = z.object({
  username: z.string().min(1).max(200),
  accessKey: z.string().min(1).max(256).optional(),
  deviceName: z.string().min(1).max(120).optional(),
  platformVersion: z.string().min(1).max(40).optional(),
  appUrl: z.string().min(1).max(500).optional(),
});

export const customExecutionSchema = z.object({
  hubUrl: z.string().url().max(500),
  capabilitiesJson: z.string().max(4_000).default("{}"),
});

export const executionConfigSchema = z.object({
  provider: executionProviderSchema.default("local"),
  saucelabs: sauceLabsExecutionSchema.optional(),
  browserstack: browserStackExecutionSchema.optional(),
  lambdatest: lambdaTestExecutionSchema.optional(),
  custom: customExecutionSchema.optional(),
});

export const updateExecutionConfigBodySchema = z.object({
  config: executionConfigSchema,
  saucelabsAccessKey: z.string().min(1).max(256).nullable().optional(),
  browserstackAccessKey: z.string().min(1).max(256).nullable().optional(),
  lambdatestAccessKey: z.string().min(1).max(256).nullable().optional(),
});

export const runTestsBodySchema = z.object({
  specPaths: z.array(z.string().min(1).max(PAGE_OBJECT_PATH_MAX)).min(1).max(50),
  environmentId: z.string().uuid().optional(),
  grep: z.string().min(1).max(200).optional(),
});

/** Optional context for AI auto-heal from a failed test run. */
export const healTestRunBodySchema = z.object({
  problemDescription: z.string().min(1).max(4000).optional(),
});

export type ExecutionConfig = z.infer<typeof executionConfigSchema>;
export type ExecutionProvider = z.infer<typeof executionProviderSchema>;

export function executionProviderLabel(provider: ExecutionProvider): string {
  switch (provider) {
    case "local":
      return "Local device / simulator";
    case "saucelabs":
      return "Sauce Labs";
    case "browserstack":
      return "BrowserStack";
    case "lambdatest":
      return "LambdaTest";
    case "custom":
      return "Custom Appium hub";
    default:
      return provider;
  }
}
