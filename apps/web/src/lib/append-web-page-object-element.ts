import type { WebPageElement } from "@automation-ai/core";
import { enrichWebPageObjectWithStepMethods } from "@/lib/enrich-web-page-object-step-methods";
import { buildWebPageClassFile } from "@/lib/screen-codegen/build-web-page-assets";
import { formatWebLocatorSpecLine } from "@/lib/screen-codegen/web-locator-spec-line";

type ParsedLocator = { key: string; strategy: string; value: string; role?: string };

function parseExistingLocators(content: string): ParsedLocator[] {
  const lBlockMatch = content.match(/private static readonly L = \{([\s\S]*?)\} as const/);
  if (lBlockMatch === null) {
    return [];
  }
  const out: ParsedLocator[] = [];
  const entryPattern = /(\w+):\s*\{([^}]+)\}/g;
  for (const match of lBlockMatch[1].matchAll(entryPattern)) {
    const key = match[1];
    const body = match[2];
    const strategy = /strategy:\s*'(\w+)'/.exec(body)?.[1] ?? "";
    const value = /value:\s*(['"])(.*?)\1/.exec(body)?.[2] ?? "";
    const role = /role:\s*(['"])(.*?)\1/.exec(body)?.[2];
    out.push({ key, strategy, value, role });
  }
  return out;
}

function locatorMatches(a: WebPageElement, b: ParsedLocator): boolean {
  if (a.strategy !== b.strategy || a.value !== b.value) {
    return false;
  }
  if (a.strategy === "role") {
    return (a.role ?? "") === (b.role ?? "");
  }
  return true;
}

function uniqueLocatorKey(base: string, existing: Set<string>): string {
  if (!existing.has(base)) {
    return base;
  }
  let i = 2;
  while (existing.has(`${base}${i}`)) {
    i += 1;
  }
  return `${base}${i}`;
}

/**
 * Adds a locator entry (and step-codegen methods via enrich) to an existing page object file.
 */
export function appendElementToWebPageObjectContent(
  content: string,
  element: WebPageElement,
  className: string,
): { content: string; locatorKey: string } {
  const exported = /export\s+class\s+(\w+)/.exec(content);
  if (exported === null || !content.includes("private static readonly L")) {
    const rebuilt = buildWebPageClassFile(className.replace(/Page$/i, ""), [element]);
    const keyMatch = /(\w+):\s*\{/.exec(rebuilt);
    const locatorKey = keyMatch?.[1] ?? element.key;
    return { content: rebuilt, locatorKey };
  }

  const existing = parseExistingLocators(content);
  const existingKeys = new Set(existing.map((e) => e.key));

  for (const row of existing) {
    if (locatorMatches(element, row)) {
      return { content: enrichWebPageObjectWithStepMethods(content), locatorKey: row.key };
    }
  }

  const locatorKey = uniqueLocatorKey(element.key, existingKeys);
  const elWithKey = { ...element, key: locatorKey };
  const line = formatWebLocatorSpecLine(elWithKey);

  let out = content.replace(/(\n  \} as const;)/, `\n${line}\n  } as const;`);
  out = enrichWebPageObjectWithStepMethods(out);
  return { content: out, locatorKey };
}
