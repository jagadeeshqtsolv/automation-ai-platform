import type { TestStep, WebPageElement, WebPageElementActionKind } from "@automation-ai/shared";

export const COMMON_PAGE_CLASS_NAME = "CommonPage";
export const COMMON_PAGE_MODULE_PATH = "pageobjects/CommonPage.ts";
export const COMMON_PAGE_SCREEN_NAME = "Common";

function actionKindFromLocatorHint(raw: string, targetDescription: string): WebPageElementActionKind | null {
  const combined = `${raw} ${targetDescription}`.toLowerCase();
  if (/type\s*=\s*["']checkbox["']|input\[type=["']?checkbox/i.test(raw)) {
    return "checkbox";
  }
  if (/type\s*=\s*["']radio["']|input\[type=["']?radio/i.test(raw)) {
    return "radio";
  }
  if (
    /privacy|agree to|terms and conditions|accept terms|opt-?in|newsletter/.test(combined) &&
    /checkbox|agree|consent|policy/.test(combined)
  ) {
    return "checkbox";
  }
  return null;
}

function actionKindForStep(
  action: TestStep["action"],
  rawLocator: string,
  targetDescription: string,
): WebPageElementActionKind {
  const fromLocator = actionKindFromLocatorHint(rawLocator, targetDescription);
  if (fromLocator !== null) {
    return fromLocator;
  }

  switch (action) {
    case "fill":
    case "clear":
    case "typeText":
    case "assertValue":
      return "textbox";
    case "assertChecked":
      return "checkbox";
    case "assertSelected":
      return "combobox";
    case "tap":
    case "doubleTap":
    case "longPress":
      return "button";
    default:
      return "generic";
  }
}

/** CamelCase identifier from human-readable target text. */
export function locatorKeyFromDescription(targetDescription: string): string {
  const words = targetDescription
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) {
    return "element";
  }
  const joined = words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i === 0) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
  const safe = joined.replace(/[^a-zA-Z0-9_]/g, "");
  if (safe.length === 0 || !/^[a-zA-Z]/.test(safe)) {
    return `el${safe.length > 0 ? safe : "Element"}`;
  }
  return safe.slice(0, 72);
}

/**
 * Best-effort parse of plan `locatorHint` / target into a web locator definition.
 * Returns null when no stable selector can be inferred.
 */
function parseFrameAndShadowFromHint(raw: string): {
  rest: string;
  frame?: string;
  shadowHost?: string;
} {
  let rest = raw;
  let frame: string | undefined;
  let shadowHost: string | undefined;

  const frameMatch = /(?:^|[\s,;])(?:frame|iframe)\s*[=:]\s*([^\s,;]+)/i.exec(raw);
  if (frameMatch !== null) {
    frame = frameMatch[1].trim();
    rest = rest.replace(frameMatch[0], " ").trim();
  }

  const shadowMatch = /(?:^|[\s,;])(?:shadowHost|shadow)\s*[=:]\s*([^\s,;]+)/i.exec(raw);
  if (shadowMatch !== null) {
    shadowHost = shadowMatch[1].trim();
    rest = rest.replace(shadowMatch[0], " ").trim();
  }

  return { rest, frame, shadowHost };
}

function attachFrameShadow(
  el: WebPageElement,
  frame?: string,
  shadowHost?: string,
): WebPageElement {
  return {
    ...el,
    ...(frame !== undefined && frame.length > 0 ? { frame } : {}),
    ...(shadowHost !== undefined && shadowHost.length > 0 ? { shadowHost } : {}),
  };
}

export function parseStepLocatorToWebElement(step: TestStep, key: string): WebPageElement | null {
  const hint = step.locatorHint?.trim() ?? "";
  const target = step.targetDescription.trim();
  const rawInput = hint.length > 0 ? hint : target;
  if (rawInput.length === 0) {
    return null;
  }

  const { rest: raw, frame, shadowHost } = parseFrameAndShadowFromHint(rawInput);
  if (raw.length === 0 && (frame !== undefined || shadowHost !== undefined)) {
    return null;
  }

  const actionKind = actionKindForStep(step.action, raw, target);

  const dataTest = /\[data-test(?:id)?=["']([^"']+)["']\]/i.exec(raw);
  if (dataTest !== null) {
    return attachFrameShadow({ key, strategy: "testId", value: dataTest[1], actionKind }, frame, shadowHost);
  }

  const dataTestBare = /^data-test(?:id)?=["']?([^"'\s]+)["']?$/i.exec(raw);
  if (dataTestBare !== null) {
    return attachFrameShadow({ key, strategy: "testId", value: dataTestBare[1], actionKind }, frame, shadowHost);
  }

  const roleMatch = /role\s*=\s*(\w+)(?:\s*,\s*name\s*=\s*["']([^"']+)["'])?/i.exec(raw);
  if (roleMatch !== null) {
    const role = roleMatch[1];
    const name = roleMatch[2] ?? target;
    if (name.length > 0) {
      return attachFrameShadow(
        { key, strategy: "role", role, value: name.slice(0, 300), actionKind },
        frame,
        shadowHost,
      );
    }
  }

  const labelMatch = /(?:getByLabel|label)\s*\(\s*["']([^"']+)["']\s*\)/i.exec(raw);
  if (labelMatch !== null) {
    return attachFrameShadow(
      { key, strategy: "label", value: labelMatch[1].slice(0, 300), actionKind },
      frame,
      shadowHost,
    );
  }

  const placeholderMatch = /(?:getByPlaceholder|placeholder)\s*\(\s*["']([^"']+)["']\s*\)/i.exec(raw);
  if (placeholderMatch !== null) {
    return attachFrameShadow(
      { key, strategy: "placeholder", value: placeholderMatch[1].slice(0, 300), actionKind },
      frame,
      shadowHost,
    );
  }

  const textMatch = /(?:getByText|text)\s*=\s*["']([^"']+)["']/i.exec(raw);
  if (textMatch !== null) {
    return attachFrameShadow(
      { key, strategy: "text", value: textMatch[1].slice(0, 300), actionKind },
      frame,
      shadowHost,
    );
  }

  if (/^#[\w-]+$/.test(raw) || /^\[[\w-]+[^\]]*\]$/.test(raw) || raw.includes("[data-") || /^\.[\w-]+/.test(raw)) {
    return attachFrameShadow(
      { key, strategy: "css", value: raw.slice(0, 300), actionKind },
      frame,
      shadowHost,
    );
  }

  if (hint.length === 0 && target.length > 0 && target.length <= 120 && !/[\[\]#.=<>]/.test(target)) {
    return attachFrameShadow(
      { key, strategy: "text", value: target.slice(0, 300), actionKind },
      frame,
      shadowHost,
    );
  }

  if (hint.length > 0) {
    return attachFrameShadow(
      { key, strategy: "css", value: raw.slice(0, 300), actionKind },
      frame,
      shadowHost,
    );
  }

  return null;
}

/** Actions that never need a page-object locator (navigation, timing, device-only). */
export function stepUsesPageObjectLocator(step: TestStep): boolean {
  if (step.customCode !== undefined && step.customCode.trim().length > 0) {
    return false;
  }
  switch (step.action) {
    case "wait":
    case "back":
    case "openUrl":
    case "screenshot":
    case "launchApp":
    case "terminateApp":
    case "setOrientation":
    case "tapAt":
    case "swipe":
    case "pullToRefresh":
    case "gesture":
    case "pressButton":
    case "openDeepLink":
    case "switchToFrame":
    case "switchToMainFrame":
    case "switchToNewTab":
    case "closeTab":
      return false;
    default:
      return true;
  }
}
