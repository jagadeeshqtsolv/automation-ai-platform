import { generateText } from "ai";
import { TEST_STEP_ACTIONS_PROMPT, testPlanSchema, type TestPlan } from "@automation-ai/core";
import { formatGenerationError } from "@/lib/format-generation-error";
import { resolveAIModel } from "@/lib/project-ai-config";
import { normalizeLlmTestPlan } from "@/lib/normalize-llm-test-plan";

const MOBILE_PLAN_SCHEMA_DESCRIPTION = `{
  "version": 1,
  "suiteName": "string",
  "cases": [
    {
      "id": "string (slug, unique within suite)",
      "title": "string",
      "priority": "P0" | "P1" | "P2",
      "platforms": ["ios" and/or "android"],
      "preconditions": ["string"],
      "tags": ["string"],
      "steps": [
        {
          "id": "string",
          "action": ${TEST_STEP_ACTIONS_PROMPT},
          "targetDescription": "string (human readable)",
          "locatorHint": "optional string (label, role+name, accessibility id)",
          "value": "optional — text, ms, swipe direction, x,y coords, bundle id, orientation, URL, timeout, gesture hint, screenshot name",
          "assertion": "optional — expected text/value, true/false for checked/selected/focused, or numeric count for assertCount"
        }
      ]
    }
  ]
}`;

const WEB_PLAN_SCHEMA_DESCRIPTION = `{
  "version": 1,
  "suiteName": "string",
  "cases": [
    {
      "id": "string (slug, unique within suite)",
      "title": "string",
      "priority": "P0" | "P1" | "P2",
      "platforms": ["chrome" and/or "firefox" and/or "safari" and/or "edge"],
      "preconditions": ["string"],
      "tags": ["string"],
      "steps": [
        {
          "id": "string",
          "action": ${TEST_STEP_ACTIONS_PROMPT},
          "targetDescription": "string (human readable)",
          "locatorHint": "optional string (label, role+name, data-testid, CSS selector like #id or [name=x])",
          "value": "optional — text to fill, timeout ms, URL, screenshot name",
          "assertion": "optional — expected text/value, true/false for checked/focused, or numeric count for assertCount"
        }
      ]
    }
  ]
}`;

const MOBILE_SYSTEM_PROMPT = [
  "You are a principal mobile QA engineer.",
  "Turn product requirements into executable-style test cases for native mobile apps.",
  "Respond with JSON ONLY. No markdown fences. No commentary.",
  `The JSON MUST match this shape: ${MOBILE_PLAN_SCHEMA_DESCRIPTION}`,
  "Use realistic steps; prefer accessibility-friendly locator hints (labels, roles, names).",
  "Use only the exact action strings listed (e.g. tap, not click). platforms must be lowercase ios and/or android.",
  "Include negative and edge cases where appropriate.",
].join("\n");

const WEB_SYSTEM_PROMPT = [
  "You are a principal web QA engineer.",
  "Turn product requirements into executable-style test cases for web applications running in a browser.",
  "Respond with JSON ONLY. No markdown fences. No commentary.",
  `The JSON MUST match this shape: ${WEB_PLAN_SCHEMA_DESCRIPTION}`,
  "Use realistic steps; prefer accessibility-friendly locator hints (label text, role+name, data-testid, or CSS selectors like #id or [name=x]).",
  "Use only the exact action strings listed. For web: tap = click a button/link, fill = fill a form field. Avoid mobile-only actions (tapAt, swipe, launchApp, terminateApp, setOrientation, pullToRefresh, pressButton, openDeepLink, gesture).",
  "Set platforms to an array of applicable browsers from: chrome, firefox, safari, edge. Default to [\"chrome\"] when not specified.",
  "Preconditions must be browser/web appropriate — e.g. 'Browser is open', 'User is on the login page', 'User is logged out', 'User is on the home page'. Never write 'App is installed', 'Device is connected', or any native-app precondition.",
  "Include negative and edge cases where appropriate.",
].join("\n");

export async function generateTestPlanFromRequirement(params: {
  requirementTitle: string | null;
  requirementContent: string;
  projectId: string;
  platform?: "web" | "mobile";
}): Promise<{ plan: TestPlan; model: string }> {
  const { model, modelId } = await resolveAIModel(params.projectId);
  const isWeb = params.platform === "web";
  const userParts: string[] = [];
  if (params.requirementTitle !== null && params.requirementTitle.trim().length > 0) {
    userParts.push(`Title: ${params.requirementTitle.trim()}`);
  }
  userParts.push(`Requirements:\n${params.requirementContent}`);

  const { text: raw } = await generateText({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: isWeb ? WEB_SYSTEM_PROMPT : MOBILE_SYSTEM_PROMPT },
      { role: "user", content: userParts.join("\n\n") },
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

  const normalized = normalizeLlmTestPlan(parsed);
  const result = testPlanSchema.safeParse(normalized);
  if (!result.success) {
    throw result.error;
  }
  return { plan: result.data, model: modelId };
}
