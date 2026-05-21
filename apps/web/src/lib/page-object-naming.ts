const GENERIC_BASES = new Set(["screen", "object", "view", "page", "ui", "app", "main"]);

function splitLabel(raw: string): string[] {
  return raw
    .trim()
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_\-./]+/)
    .map((part) => part.replace(/[^a-zA-Z0-9]/g, ""))
    .filter((part) => part.length > 0);
}

/** PascalCase from human-readable screen or class labels (e.g. "login screen" → LoginScreen). */
export function toPascalCaseLabel(raw: string): string {
  const parts = splitLabel(raw);
  if (parts.length === 0) return "";
  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join("");
}

/** Ensures a meaningful PascalCase class name ending with `Page`. */
export function normalizePageClassName(raw: string, hint?: string): string {
  const primary = toPascalCaseLabel(raw.replace(/Page$/i, ""));
  const secondary =
    hint !== undefined && hint.trim().length > 0 ? toPascalCaseLabel(hint.replace(/Page$/i, "")) : "";

  let base = primary.length > 0 ? primary : secondary;
  if (base.length === 0 || GENERIC_BASES.has(base.toLowerCase())) {
    base = secondary.length > 0 && !GENERIC_BASES.has(secondary.toLowerCase()) ? secondary : "Screen";
  }

  const className = base.endsWith("Page") ? base : `${base}Page`;
  return /^[A-Z][A-Za-z0-9]*Page$/.test(className) ? className : "ScreenPage";
}

/** PascalCase class name ending with `Screen` — used for device-recorder output. */
export function normalizeScreenClassName(raw: string, hint?: string): string {
  const primary = toPascalCaseLabel(raw.replace(/Screen$/i, "").replace(/Page$/i, ""));
  const secondary =
    hint !== undefined && hint.trim().length > 0
      ? toPascalCaseLabel(hint.replace(/Screen$/i, "").replace(/Page$/i, ""))
      : "";

  let base = primary.length > 0 ? primary : secondary;
  if (base.length === 0 || GENERIC_BASES.has(base.toLowerCase())) {
    base =
      secondary.length > 0 && !GENERIC_BASES.has(secondary.toLowerCase())
        ? secondary
        : "Recorded";
  }

  const className = base.endsWith("Screen") ? base : `${base}Screen`;
  return /^[A-Z][A-Za-z0-9]*Screen$/.test(className) ? className : "RecordedScreen";
}

export function normalizePageModulePath(className: string): string {
  return `pageobjects/${normalizePageClassName(className)}.ts`;
}

export function normalizeScreenModulePath(className: string): string {
  return `pageobjects/${normalizeScreenClassName(className)}.ts`;
}

/** Rewrites exported class name and static `ClassName.L` references in generated TS. */
export function alignPageObjectClassInContent(content: string, className: string): string {
  const normalized = normalizePageClassName(className);
  const exported = /export\s+class\s+(\w+)/.exec(content);
  if (exported === null) {
    return content;
  }
  const previous = exported[1];
  if (previous === normalized) {
    return content;
  }
  return content
    .replace(new RegExp(`export\\s+class\\s+${previous}\\b`, "g"), `export class ${normalized}`)
    .replace(new RegExp(`\\b${previous}\\.L\\b`, "g"), `${normalized}.L`);
}

export function normalizePageObjectFile(params: {
  path: string;
  content: string;
  className?: string;
  screenName?: string;
}): { path: string; content: string; className: string } {
  const pathHint = params.path.split("/").pop()?.replace(/\.ts$/i, "") ?? "";
  const hinted = params.className ?? params.screenName ?? pathHint;
  const className = normalizePageClassName(hinted, params.screenName ?? pathHint);
  const path = normalizePageModulePath(className);
  const content = alignPageObjectClassInContent(params.content, className);
  return { path, content, className };
}
