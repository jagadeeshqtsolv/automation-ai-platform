import type { TestStep } from "@jagadeeshqtsolv/core";

/** True when the plan step means “open the app at baseURL”, not a deep link. */
export function isWebAppEntryStep(step: TestStep): boolean {
  if (step.action === "launchApp") {
    return true;
  }
  const text = `${step.targetDescription} ${step.value ?? ""}`.toLowerCase();
  return (
    /\blaunch\b.*\b(app|application|site|browser)\b/.test(text) ||
    /\bopen\b.*\b(app|application|site)\b/.test(text) ||
    /\bnavigate\s+to\s+(the\s+)?(app|application|entry|home)\b/.test(text) ||
    /\bgo\s+to\s+(the\s+)?(app|application|entry|home)\b/.test(text) ||
    /\bstart\b.*\b(app|application|site)\b/.test(text)
  );
}

/**
 * Path or URL for `page.goto()` on web projects.
 * App entry always uses `/` so Playwright resolves against `baseURL` in playwright.config.ts.
 */
export function resolveWebGotoPath(step: TestStep): string {
  if (step.action === "launchApp" || isWebAppEntryStep(step)) {
    return "/";
  }

  const value = step.value?.trim() ?? "";
  const desc = step.targetDescription.trim();

  if (value.length === 0) {
    if (desc.length === 0) {
      return "/";
    }
    if (/^https?:\/\//i.test(desc)) {
      return desc;
    }
    if (desc.startsWith("/")) {
      return desc;
    }
    return "/";
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  const path = value.startsWith("/") ? value : `/${value}`;

  if (path === "/login" && isWebAppEntryStep(step)) {
    return "/";
  }

  if (!value.includes("/") && !value.includes(".") && /^[a-z][a-z0-9\s-]*$/i.test(value)) {
    return "/";
  }

  return path;
}
