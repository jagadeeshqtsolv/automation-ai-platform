/** Playwright strict-mode violation: multiple elements matched one locator. */

export type StrictModeHealTarget = {
  modulePath: string;
  locatorKey: string;
  index: number;
};

const STRICT_MODE_RE = /strict mode violation/i;

const PAGE_OBJECT_FRAME_RE =
  /at\s+(\w+)\.(\w+)\s*\([^)]*pageobjects[/\\]([A-Za-z0-9_-]+\.ts):(\d+)/g;

const ACTION_PREFIXES = [
  "doubleClick",
  "longPress",
  "click",
  "typeText",
  "fill",
  "clear",
  "check",
  "uncheck",
  "select",
  "scroll",
] as const;

const EXPECT_SUFFIX_RE =
  /^expect(\w+?)(Visible|Hidden|Text|ContainsText|Value|Enabled|Disabled|Checked|Unchecked|Focused|Count)$/;

export function methodNameToLocatorKey(methodName: string): string | null {
  for (const prefix of ACTION_PREFIXES) {
    if (methodName.startsWith(prefix) && methodName.length > prefix.length) {
      const rest = methodName.slice(prefix.length);
      if (rest.length === 0) {
        return null;
      }
      return `${rest.charAt(0).toLowerCase()}${rest.slice(1)}`;
    }
  }
  const expectMatch = EXPECT_SUFFIX_RE.exec(methodName);
  if (expectMatch !== null) {
    const name = expectMatch[1];
    return `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Add or replace `index` on a locator entry inside `private static readonly L`. */
export function patchLocatorIndexInPageObject(
  content: string,
  locatorKey: string,
  index: number,
): string {
  const entryRe = new RegExp(
    `(${escapeRegExp(locatorKey)}:\\s*\\{)([^{}]*)(\\},)`,
    "m",
  );
  const match = entryRe.exec(content);
  if (match === null) {
    return content;
  }
  let body = match[2];
  if (/index\s*:\s*\d+/.test(body)) {
    body = body.replace(/index\s*:\s*\d+/, `index: ${index}`);
  } else {
    const trimmed = body.trimEnd();
    const sep = trimmed.length > 0 && !trimmed.endsWith(",") ? ", " : "";
    body = `${body}${sep}index: ${index}`;
  }
  return content.replace(entryRe, `$1${body}$3`);
}

export function collectStrictModeHealTargets(logText: string): StrictModeHealTarget[] {
  if (!STRICT_MODE_RE.test(logText)) {
    return [];
  }

  const seen = new Set<string>();
  const targets: StrictModeHealTarget[] = [];

  for (const match of logText.matchAll(PAGE_OBJECT_FRAME_RE)) {
    const className = match[1];
    const methodName = match[2];
    const fileName = match[3];
    const locatorKey = methodNameToLocatorKey(methodName);
    if (locatorKey === null) {
      continue;
    }
    const modulePath = `pageobjects/${fileName}`;
    const dedupe = `${modulePath}::${locatorKey}`;
    if (seen.has(dedupe)) {
      continue;
    }
    seen.add(dedupe);
    targets.push({ modulePath, locatorKey, index: 0 });
    void className;
  }

  return targets;
}

export function applyStrictModePatchesToPageObjects(
  pageObjects: Array<{ modulePath: string; content: string }>,
  targets: StrictModeHealTarget[],
): Array<{ modulePath: string; content: string }> {
  if (targets.length === 0) {
    return [];
  }

  const byPath = new Map(pageObjects.map((p) => [p.modulePath, p.content]));
  const updatedPaths = new Set<string>();

  for (const target of targets) {
    const current = byPath.get(target.modulePath);
    if (current === undefined || !current.includes("private static readonly L")) {
      continue;
    }
    const patched = patchLocatorIndexInPageObject(current, target.locatorKey, target.index);
    if (patched !== current) {
      byPath.set(target.modulePath, patched);
      updatedPaths.add(target.modulePath);
    }
  }

  return [...updatedPaths].map((modulePath) => ({
    modulePath,
    content: byPath.get(modulePath) ?? "",
  }));
}
