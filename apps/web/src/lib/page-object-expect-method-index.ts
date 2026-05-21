import { pageObjectFixtureName } from "@/lib/generate-test-fixtures";
import { enrichPageObjectWithExpectVisibilityMethods } from "@/lib/enrich-page-object-flows";

function pascalCaseLocatorKey(key: string): string {
  if (key.length === 0) return key;
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

function parseLocatorValues(content: string): Map<string, string> {
  const lBlockMatch = content.match(/private static readonly L = \{([\s\S]*?)\} as const/);
  if (lBlockMatch === null) {
    return new Map();
  }

  const valueToMethod = new Map<string, string>();
  const entryPattern = /(\w+):\s*\{[^}]*value:\s*(['"])(.*?)\2/g;
  for (const match of lBlockMatch[1].matchAll(entryPattern)) {
    const key = match[1];
    const label = match[3].trim();
    if (label.length === 0) continue;
    valueToMethod.set(label, `expect${pascalCaseLocatorKey(key)}Visible`);
  }
  return valueToMethod;
}

export type PageObjectSource = { className: string; content: string };

/** fixture name → accessibility label/value → expect*Visible method on that fixture */
export function buildPageObjectExpectMethodIndex(
  sources: PageObjectSource[],
): Map<string, Map<string, string>> {
  const index = new Map<string, Map<string, string>>();

  for (const source of sources) {
    const classMatch = source.content.match(/export class (\w+)/);
    const className = classMatch?.[1] ?? source.className;
    if (className.trim().length === 0) continue;

    const enriched = enrichPageObjectWithExpectVisibilityMethods(source.content);
    const fixture = pageObjectFixtureName(className);
    const methods = parseLocatorValues(enriched);
    if (methods.size === 0) continue;

    const existing = index.get(fixture) ?? new Map<string, string>();
    for (const [label, method] of methods) {
      existing.set(label, method);
    }
    index.set(fixture, existing);
  }

  return index;
}
