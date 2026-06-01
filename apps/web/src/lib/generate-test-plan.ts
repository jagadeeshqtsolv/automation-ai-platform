import { generateText } from "ai";
import {
  TEST_STEP_ACTIONS_PROMPT,
  testPlanSchema,
  type TestPlan,
  type TestCaseType,
} from "@jagadeeshqtsolv/core";
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

const TEST_CASE_TYPE_DESCRIPTIONS: Record<TestCaseType, string> = {
  "smoke": "SMOKE — P0 critical-path tests that verify the core feature works end-to-end with minimal steps. Fast sanity check before deeper testing.",
  "functional": "FUNCTIONAL — positive happy-path tests covering all main flows with valid inputs and expected outcomes.",
  "negative": "NEGATIVE — invalid inputs, wrong credentials, unauthorised access, missing required fields, incorrect formats, and expected error messages.",
  "edgecase": "EDGE CASES — boundary values (min/max length, 0, 1, empty string, whitespace-only), special characters, very long strings, and numeric limits.",
  "e2e": "END-TO-END — complete user journeys spanning multiple screens or features (e.g. search → product detail → add to cart → checkout).",
};

const ALL_TEST_CASE_TYPES: TestCaseType[] = [
  "smoke", "functional", "negative", "edgecase", "e2e",
];

const TEST_CASE_TYPE_TAGS: Record<TestCaseType, string> = {
  smoke: "@smoke",
  functional: "@functional",
  negative: "@negative",
  edgecase: "@edgecase",
  e2e: "@e2e",
};

function categoryInstruction(types: TestCaseType[]): string {
  const maxPerCategory = Math.min(5, Math.max(3, Math.ceil(8 / types.length)));
  const typeLines = types.map((t) => `- ${t.toUpperCase()}: ${TEST_CASE_TYPE_DESCRIPTIONS[t]}`).join("\n");
  const tags = types.map((t) => TEST_CASE_TYPE_TAGS[t]).join(", ");
  return [
    `Your task: generate ${maxPerCategory} test cases per category for ONLY these ${types.length} categor${types.length === 1 ? "y" : "ies"}:`,
    typeLines,
    `Tag each case with its category tag (${tags}) plus @regression.`,
    `Do not generate any other test category.`,
  ].join("\n");
}

function buildMobileSystemPrompt(types: TestCaseType[]): string {
  return [
    "You are a mobile QA engineer. Respond with JSON only — no markdown, no commentary.",
    categoryInstruction(types),
    `JSON shape: ${MOBILE_PLAN_SCHEMA_DESCRIPTION}`,
    "Use exact action strings (tap, fill, etc). platforms: ios and/or android (lowercase).",
    "Encode setup as first step, not as preconditions. Keep steps concise.",
  ].join("\n");
}

function buildWebSystemPrompt(types: TestCaseType[]): string {
  return [
    "You are a web QA engineer. Respond with JSON only — no markdown, no commentary.",
    categoryInstruction(types),
    `JSON shape: ${WEB_PLAN_SCHEMA_DESCRIPTION}`,
    "Use exact action strings (tap=click, fill=form input). No mobile-only actions.",
    "platforms: always use only [\"chrome\"]. Do not include other browsers.",
    "Encode setup as first step, not as preconditions. Keep steps concise.",
  ].join("\n");
}

export async function generateTestPlanFromRequirement(params: {
  requirementTitle: string | null;
  requirementContent: string;
  projectId: string;
  platform?: "web" | "mobile";
  testCaseTypes?: TestCaseType[];
}): Promise<{ plan: TestPlan; model: string }> {
  const { model, modelId, isReasoningModel } = await resolveAIModel(params.projectId);
  const isWeb = params.platform === "web";
  const types = params.testCaseTypes ?? ALL_TEST_CASE_TYPES;
  const systemPrompt = isWeb
    ? buildWebSystemPrompt(types)
    : buildMobileSystemPrompt(types);

  const categoryLabel = types.map((t) => t.toUpperCase()).join(" + ");
  const userParts: string[] = [
    `Generate ${categoryLabel} test cases only.`,
  ];
  if (params.requirementTitle !== null && params.requirementTitle.trim().length > 0) {
    userParts.push(`Feature: ${params.requirementTitle.trim()}`);
  }
  userParts.push(`Requirements:\n${params.requirementContent}`);

  const messages: Array<{ role: "user" | "assistant"; content: string }> = isReasoningModel
    ? [{ role: "user", content: `${systemPrompt}\n\n${userParts.join("\n\n")}` }]
    : [{ role: "user", content: userParts.join("\n\n") }];

  const { text: raw } = await generateText({
    model,
    ...(isReasoningModel ? {} : { system: systemPrompt, temperature: 0.2 }),
    messages,
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

  const normalized = normalizeLlmTestPlan(parsed);
  const result = testPlanSchema.safeParse(normalized);
  if (!result.success) {
    throw result.error;
  }

  const filtered = filterTestPlanByCategories(result.data, types);

  return { plan: filtered, model: modelId };
}

function extractJsonFromResponse(text: string): string {
  const trimmed = text.trim();
  // Try direct parse first
  try { JSON.parse(trimmed); return trimmed; } catch {}
  // Strip markdown code fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (fenced) {
    const inner = fenced[1]!.trim();
    try { JSON.parse(inner); return inner; } catch {}
  }
  // Walk character-by-character to find the balanced outermost JSON object
  const start = trimmed.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
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

function normalizeTagKey(tag: string): string {
  return tag.trim().toLowerCase().replace(/^@/, "");
}

function filterTestPlanByCategories(plan: TestPlan, selectedTypes: TestCaseType[]): TestPlan {
  const excludedKeys = new Set<string>(ALL_TEST_CASE_TYPES.filter((t) => !selectedTypes.includes(t)));

  // Only remove cases that are explicitly tagged as an excluded category.
  // Cases with no category tag (e.g. only @regression) are kept.
  const validCases = plan.cases.filter((testCase) => {
    const keys = testCase.tags.map(normalizeTagKey);
    return !keys.some((k) => excludedKeys.has(k));
  });

  if (validCases.length === 0) {
    throw new Error(
      `No test cases generated for the selected categor${selectedTypes.length === 1 ? "y" : "ies"}: ${selectedTypes.join(", ")}. Please try again.`,
    );
  }

  return { ...plan, cases: validCases };
}
