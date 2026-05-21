import { pageObjectFixtureName } from "@/lib/generate-test-fixtures";
import { enrichPageObjectWithExpectVisibilityMethods } from "@/lib/enrich-page-object-flows";
import { enrichWebPageObjectWithStepMethods } from "@/lib/enrich-web-page-object-step-methods";
import { extractAsyncMethodNames } from "@/lib/page-object-library-context";
import { normalizeScreenClassName } from "@/lib/page-object-naming";

export type PageObjectStepEntry = {
  className: string;
  screenName: string | null;
  fixtureName: string;
  methods: Set<string>;
  /** Locator label/value (lowercase) → locator key in L */
  labelToKey: Map<string, string>;
};

export function parseMethodNamesFromSummary(summary: string): string[] {
  return summary
    .split(",")
    .map((part) => part.trim())
    .map((part) => (part.endsWith("()") ? part.slice(0, -2).trim() : part))
    .filter((part) => part.length > 0 && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(part));
}

function mergeMethodNames(...groups: Array<Iterable<string>>): Set<string> {
  const methods = new Set<string>();
  for (const group of groups) {
    for (const name of group) {
      const trimmed = name.trim();
      if (trimmed.length > 0) {
        methods.add(trimmed);
      }
    }
  }
  return methods;
}

function parseLocatorEntries(content: string): Map<string, string> {
  const lBlockMatch = content.match(/private static readonly L = \{([\s\S]*?)\} as const/);
  if (lBlockMatch === null) {
    return new Map();
  }
  const labelToKey = new Map<string, string>();
  const entryPattern = /(\w+):\s*\{[^}]*value:\s*(['"])(.*?)\2/g;
  for (const match of lBlockMatch[1].matchAll(entryPattern)) {
    const key = match[1];
    const label = match[3].trim();
    if (label.length > 0) {
      labelToKey.set(label.toLowerCase(), key);
    }
  }
  return labelToKey;
}

function pascalCaseLocatorKey(key: string): string {
  if (key.length === 0) return key;
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

export function buildPageObjectStepIndex(
  sources: Array<{
    className: string;
    screenName: string | null;
    content: string;
    methodSummary?: string;
  }>,
  options?: { platform?: "mobile" | "web" },
): PageObjectStepEntry[] {
  const rows: PageObjectStepEntry[] = [];
  const isWeb = options?.platform === "web";

  for (const source of sources) {
    const classMatch = source.content.match(/export class (\w+)/);
    const className = classMatch?.[1] ?? source.className;
    if (className.trim().length === 0) continue;

    const enriched = isWeb
      ? enrichWebPageObjectWithStepMethods(source.content)
      : enrichPageObjectWithExpectVisibilityMethods(source.content);
    const fromContent = extractAsyncMethodNames(enriched);
    const fromSummary =
      typeof source.methodSummary === "string"
        ? parseMethodNamesFromSummary(source.methodSummary)
        : [];
    rows.push({
      className,
      screenName: source.screenName,
      fixtureName: pageObjectFixtureName(className),
      methods: mergeMethodNames(fromContent, fromSummary),
      labelToKey: parseLocatorEntries(enriched),
    });
  }

  return rows;
}

export function resolvePageObjectEntryForStep(
  index: PageObjectStepEntry[],
  step: { screenName?: string; targetDescription: string; locatorHint?: string },
): PageObjectStepEntry | null {
  const byScreen = resolvePageObjectEntry(index, step.screenName);
  if (byScreen !== null) {
    return byScreen;
  }

  const candidates: Array<{ entry: PageObjectStepEntry; key: string; score: number }> = [];
  for (const entry of index) {
    const key = findLocatorKeyForStep(entry, step.targetDescription, step.locatorHint);
    if (key === null) {
      continue;
    }
    let score = 1;
    const needles = [step.locatorHint, step.targetDescription]
      .map((s) => s?.trim().toLowerCase())
      .filter((s): s is string => s !== undefined && s.length > 0);
    for (const needle of needles) {
      const exact = entry.labelToKey.get(needle);
      if (exact === key) {
        score = 3;
        break;
      }
    }
    candidates.push({ entry, key, score });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.entry ?? null;
}

export function resolvePageObjectEntry(
  index: PageObjectStepEntry[],
  screenName: string | undefined,
): PageObjectStepEntry | null {
  if (screenName === undefined || screenName.trim().length === 0) {
    return null;
  }
  const raw = screenName.trim();
  const normalizedClass = normalizeScreenClassName(raw);
  const lower = raw.toLowerCase();

  for (const entry of index) {
    if (entry.className === raw || entry.className === normalizedClass) {
      return entry;
    }
    if (entry.screenName !== null && entry.screenName.toLowerCase() === lower) {
      return entry;
    }
    const base = entry.className.replace(/Screen$|Page$/i, "").toLowerCase();
    if (base.length > 0 && (lower === base || lower === `${base}screen` || lower === `${base}page`)) {
      return entry;
    }
  }
  return null;
}

export function findLocatorKeyForStep(
  entry: PageObjectStepEntry,
  targetDescription: string,
  locatorHint?: string,
): string | null {
  const candidates = [locatorHint, targetDescription]
    .map((s) => s?.trim().toLowerCase())
    .filter((s): s is string => s !== undefined && s.length > 0);

  for (const needle of candidates) {
    const exact = entry.labelToKey.get(needle);
    if (exact !== undefined) return exact;
  }

  for (const needle of candidates) {
    for (const [label, key] of entry.labelToKey) {
      if (label.includes(needle) || needle.includes(label)) {
        return key;
      }
    }
  }
  return null;
}

export function methodNameForAction(locatorKey: string, action: string): string | null {
  const pascal = pascalCaseLocatorKey(locatorKey);

  switch (action) {
    case "tap":
      return `tap${pascal}`;
    case "doubleTap":
      return `doubleTap${pascal}`;
    case "longPress":
      return `longPress${pascal}`;
    case "fill":
      return `fill${pascal}`;
    case "clear":
      return `clear${pascal}`;
    case "typeText":
      return `typeText${pascal}`;
    case "assertVisible":
      return `expect${pascal}Visible`;
    case "assertHidden":
      return `expect${pascal}Hidden`;
    case "assertText":
      return `expect${pascal}Text`;
    case "scrollIntoView":
      return `scroll${pascal}IntoView`;
    default:
      return null;
  }
}

/** Playwright page-object method names for plan step actions (click*, expect*, etc.). */
export function methodNameForWebAction(locatorKey: string, action: string): string | null {
  const pascal = pascalCaseLocatorKey(locatorKey);

  switch (action) {
    case "tap":
      return `click${pascal}`;
    case "doubleTap":
      return `doubleClick${pascal}`;
    case "longPress":
      return `longPress${pascal}`;
    case "fill":
      return `fill${pascal}`;
    case "clear":
      return `clear${pascal}`;
    case "typeText":
      return `typeText${pascal}`;
    case "assertVisible":
    case "waitForVisible":
      return `expect${pascal}Visible`;
    case "assertHidden":
    case "waitForHidden":
      return `expect${pascal}Hidden`;
    case "assertText":
      return `expect${pascal}Text`;
    case "assertContainsText":
      return `expect${pascal}ContainsText`;
    case "assertValue":
      return `expect${pascal}Value`;
    case "assertEnabled":
      return `expect${pascal}Enabled`;
    case "assertDisabled":
      return `expect${pascal}Disabled`;
    case "assertChecked":
      return `expect${pascal}Checked`;
    case "assertSelected":
      return `select${pascal}`;
    case "assertFocused":
      return `expect${pascal}Focused`;
    case "assertCount":
      return `expect${pascal}Count`;
    case "scrollIntoView":
      return `scroll${pascal}IntoView`;
    default:
      return null;
  }
}
