import {
  isTestStepAction,
  TEST_STEP_ACTIONS,
  type TestStepAction,
} from "@jagadeeshqtsolv/core";

const ACTION_ALIASES: Record<string, TestStepAction> = {
  click: "tap",
  press: "tap",
  touch: "tap",
  select: "tap",
  tapbutton: "tap",
  doubleclick: "doubleTap",
  doubletap: "doubleTap",
  longpress: "longPress",
  hold: "longPress",
  input: "fill",
  enter: "fill",
  enterText: "fill",
  entertext: "fill",
  type: "typeText",
  typetext: "typeText",
  clearfield: "clear",
  verify: "assertVisible",
  assert: "assertVisible",
  checkvisible: "assertVisible",
  checkhidden: "assertHidden",
  verifytext: "assertText",
  asserttextcontains: "assertContainsText",
  contains: "assertContainsText",
  scroll: "scrollIntoView",
  scrollintoview: "scrollIntoView",
  swipeleft: "swipe",
  swiperight: "swipe",
  swipeup: "swipe",
  swipedown: "swipe",
  refresh: "pullToRefresh",
  pulltorefresh: "pullToRefresh",
  navigateback: "back",
  goback: "back",
  backbutton: "back",
  capturescreenshot: "screenshot",
  takescreenshot: "screenshot",
  launch: "launchApp",
  launchapp: "launchApp",
  openapp: "launchApp",
  closeapp: "terminateApp",
  terminate: "terminateApp",
  rotate: "setOrientation",
  orientation: "setOrientation",
  pause: "wait",
  sleep: "wait",
  delay: "wait",
  waitfor: "waitForVisible",
  deeplink: "openDeepLink",
  openlink: "openDeepLink",
  openurl: "openUrl",
  navigate: "openUrl",
};

function slugify(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug.length > 0 ? slug : fallback;
}

function toCamelCase(value: string): string {
  const parts = value.trim().split(/[\s_-]+/);
  if (parts.length === 0) return "";
  return parts
    .map((part, index) => {
      const lower = part.toLowerCase();
      if (index === 0) return lower;
      return lower.length > 0 ? `${lower[0]?.toUpperCase() ?? ""}${lower.slice(1)}` : "";
    })
    .join("");
}

function normalizeAction(raw: unknown): TestStepAction {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return "tap";
  }
  const trimmed = raw.trim();
  if (isTestStepAction(trimmed)) {
    return trimmed;
  }
  const camel = toCamelCase(trimmed);
  if (isTestStepAction(camel)) {
    return camel;
  }
  const compact = trimmed.replace(/\s+/g, "").toLowerCase();
  const fromAlias = ACTION_ALIASES[compact];
  if (fromAlias !== undefined) {
    return fromAlias;
  }
  for (const action of TEST_STEP_ACTIONS) {
    if (compact === action.toLowerCase()) {
      return action;
    }
  }
  return "tap";
}

function normalizePriority(raw: unknown): "P0" | "P1" | "P2" {
  if (raw === "P0" || raw === "P1" || raw === "P2") {
    return raw;
  }
  const text = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (text === "p0" || text.includes("critical") || text.includes("blocker") || text === "high") {
    return "P0";
  }
  if (text === "p2" || text.includes("low") || text.includes("minor")) {
    return "P2";
  }
  return "P1";
}

type NormalizedPlatform = "ios" | "android" | "chrome" | "firefox" | "safari" | "edge";

function normalizePlatforms(raw: unknown): NormalizedPlatform[] {
  const mobile = new Set<NormalizedPlatform>();
  let hasWebBrowser = false;
  const values = Array.isArray(raw) ? raw : raw !== undefined && raw !== null ? [raw] : [];

  for (const entry of values) {
    if (typeof entry !== "string") continue;
    const lower = entry.trim().toLowerCase();
    if (lower.length === 0) continue;

    // Mobile
    if (lower.includes("ios") || lower.includes("iphone") || lower.includes("ipad") || lower === "apple") {
      mobile.add("ios");
    }
    if (lower.includes("android")) {
      mobile.add("android");
    }
    if (lower === "both" || lower === "all" || lower === "mobile" || lower === "native") {
      mobile.add("ios");
      mobile.add("android");
    }

    // Web browsers — any web browser mention → use chrome only
    if (
      lower === "web" || lower === "browser" ||
      lower.includes("chrome") || lower.includes("chromium") ||
      lower.includes("firefox") || lower.includes("gecko") ||
      lower.includes("safari") || lower.includes("webkit") ||
      lower.includes("edge") || lower === "msedge" || lower === "microsoftedge"
    ) {
      hasWebBrowser = true;
    }
  }

  // Web platform: always chrome only (user can add more browsers manually)
  if (hasWebBrowser) return ["chrome"];
  if (mobile.size > 0) return [...mobile];
  // Default fallback — mobile if nothing detected
  return ["android", "ios"];
}

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeStep(raw: unknown, index: number, caseId: string): Record<string, unknown> {
  const step = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const idRaw = typeof step.id === "string" ? step.id.trim() : "";
  const targetRaw = typeof step.targetDescription === "string" ? step.targetDescription.trim() : "";
  const titleFallback =
    typeof step.title === "string" && step.title.trim().length > 0 ? step.title.trim() : "";

  return {
    id: idRaw.length > 0 ? idRaw : `${caseId}-step-${index + 1}`,
    action: normalizeAction(step.action),
    targetDescription:
      targetRaw.length > 0
        ? targetRaw
        : titleFallback.length > 0
          ? titleFallback
          : `Step ${index + 1}`,
    ...(typeof step.locatorHint === "string" && step.locatorHint.trim().length > 0
      ? { locatorHint: step.locatorHint.trim() }
      : {}),
    ...(typeof step.value === "string" && step.value.length > 0 ? { value: step.value } : {}),
    ...(typeof step.assertion === "string" && step.assertion.length > 0
      ? { assertion: step.assertion }
      : {}),
  };
}

function normalizeCase(raw: unknown, index: number): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as Record<string, unknown>;
  const title = typeof item.title === "string" ? item.title.trim() : "";
  if (title.length === 0) return null;

  const idRaw = typeof item.id === "string" ? item.id.trim() : "";
  const caseId = idRaw.length > 0 ? idRaw : slugify(title, `case-${index + 1}`);

  const stepsRaw = Array.isArray(item.steps) ? item.steps : [];
  const steps = stepsRaw
    .map((step, stepIndex) => normalizeStep(step, stepIndex, caseId))
    .filter((step) => typeof step.targetDescription === "string" && step.targetDescription.length > 0);

  if (steps.length === 0) {
    steps.push(
      normalizeStep(
        {
          id: `${caseId}-step-1`,
          action: "tap",
          targetDescription: title,
        },
        0,
        caseId,
      ),
    );
  }

  return {
    id: caseId,
    title,
    priority: normalizePriority(item.priority),
    platforms: normalizePlatforms(item.platforms),
    preconditions: asStringArray(item.preconditions),
    tags: asStringArray(item.tags),
    steps,
  };
}

/** Coerce common LLM mistakes (click → tap, Android → android) before Zod validation. */
export function normalizeLlmTestPlan(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) {
    return raw;
  }
  const root = raw as Record<string, unknown>;
  const suiteName =
    typeof root.suiteName === "string" && root.suiteName.trim().length > 0
      ? root.suiteName.trim()
      : "Generated test suite";

  const casesRaw = Array.isArray(root.cases) ? root.cases : [];
  const cases = casesRaw
    .map((item, index) => normalizeCase(item, index))
    .filter((item): item is Record<string, unknown> => item !== null);

  return {
    version: 1,
    suiteName,
    cases,
  };
}
