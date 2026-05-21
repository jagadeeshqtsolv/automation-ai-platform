import { WEB_ACTIONS_IMPORT_BLOCK } from "@/lib/screen-codegen/web-actions-helper";
import { enrichWebPageObjectWithStepMethods } from "@/lib/enrich-web-page-object-step-methods";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function pascalCaseKey(key: string): string {
  if (key.length === 0) {
    return key;
  }
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

function isCheckboxLocatorEntry(entryBody: string): boolean {
  return (
    /actionKind:\s*["']checkbox["']/i.test(entryBody) ||
    /type\s*=\s*["']checkbox["']/i.test(entryBody) ||
    /input\[type=["']?checkbox/i.test(entryBody)
  );
}

function parseCheckboxKeysFromL(content: string): string[] {
  const lBlock = content.match(/private static readonly L = \{([\s\S]*?)\} as const/);
  if (lBlock === null) {
    return [];
  }
  const keys: string[] = [];
  for (const match of lBlock[1].matchAll(/(\w+):\s*\{([^}]+)\}/g)) {
    if (isCheckboxLocatorEntry(match[2])) {
      keys.push(match[1]);
    }
  }
  return keys;
}

/** Ensures actionKind is present on L entries when inferable from locator value. */
function ensureActionKindInLBlock(content: string): string {
  const lMatch = content.match(/(private static readonly L = \{)([\s\S]*?)(\} as const)/);
  if (lMatch === null) {
    return content;
  }

  const body = lMatch[2].replace(
    /(\w+):\s*\{((?:(?!actionKind:)[^}])*)\}/g,
    (entry, key: string, inner: string) => {
      if (/actionKind:/.test(inner)) {
        return entry;
      }
      let actionKind = "generic";
      if (/type\s*=\s*["']checkbox["']|input\[type=["']?checkbox/i.test(inner)) {
        actionKind = "checkbox";
      } else if (/type\s*=\s*["']submit["']|type\s*=\s*["']button["']/i.test(inner)) {
        actionKind = "button";
      } else if (/input\[type=["']?(?:text|password|email|search|tel)/i.test(inner)) {
        actionKind = "textbox";
      } else if (/strategy:\s*['"]role['"]/.test(inner) && /role:\s*['"]link['"]/.test(inner)) {
        actionKind = "link";
      } else if (/strategy:\s*['"]role['"]/.test(inner) && /role:\s*['"]button['"]/.test(inner)) {
        actionKind = "button";
      }
      const trimmed = inner.trimEnd();
      const sep = trimmed.length > 0 && !trimmed.endsWith(",") ? ", " : "";
      return `${key}: { ${inner}${sep}actionKind: '${actionKind}' as const }`;
    },
  );

  return `${lMatch[1]}${body}${lMatch[3]}`;
}

/** Removes click* for checkbox keys; adds check* using checkWhenVisible when missing. */
function fixCheckboxInteractionMethods(content: string, className: string): string {
  const checkboxKeys = parseCheckboxKeysFromL(content);
  if (checkboxKeys.length === 0 || className.length === 0) {
    return content;
  }

  let out = content;

  for (const key of checkboxKeys) {
    const cap = pascalCaseKey(key);
    const clickName = `click${cap}`;
    const checkName = `check${cap}`;

    const clickMethodRe = new RegExp(
      `\\n\\s*async ${escapeRegExp(clickName)}\\(\\): Promise<void> \\{[\\s\\S]*?\\}\\n`,
      "g",
    );
    out = out.replace(clickMethodRe, "\n");

    out = out.replace(
      new RegExp(
        `async ${escapeRegExp(clickName)}\\(\\): Promise<void> \\{[\\s\\S]*?clickWhenVisible\\(`,
        "g",
      ),
      `async ${checkName}(): Promise<void> {\n    await checkWhenVisible(`,
    );

    if (!new RegExp(`\\basync ${escapeRegExp(checkName)}\\s*\\(`).test(out)) {
      const method = [
        "",
        `  async ${checkName}(): Promise<void> {`,
        `    await checkWhenVisible(webLocator(this.page, ${className}.L.${key}));`,
        `  }`,
      ].join("\n");
      const classClose = out.lastIndexOf("\n}");
      if (classClose > 0) {
        out = `${out.slice(0, classClose)}${method}${out.slice(classClose)}`;
      }
    }
  }

  return out;
}

function ensureWebImports(content: string): string {
  if (/from\s+["']\.\.\/support\/web-actions["']/.test(content)) {
    return content.replace(
      /import\s+\{[\s\S]*?\}\s+from\s+["']\.\.\/support\/web-actions["']\s*;/,
      WEB_ACTIONS_IMPORT_BLOCK,
    );
  }
  const locateImport = /import\s+\{\s*webLocator\s*\}\s+from\s+["']\.\.\/support\/web-locate["']\s*;/;
  if (locateImport.test(content)) {
    return content.replace(locateImport, (m) => `${m}\n${WEB_ACTIONS_IMPORT_BLOCK}`);
  }
  return content;
}

/**
 * Normalizes LLM- or heal-generated web page objects: actionKind on L, checkbox → check* + checkWhenVisible.
 */
export function sanitizeWebPageObjectFileContent(content: string): string {
  const classMatch = content.match(/export class (\w+)/);
  const className = classMatch?.[1] ?? "";

  let out = content;
  out = ensureActionKindInLBlock(out);
  out = ensureWebImports(out);
  out = fixCheckboxInteractionMethods(out, className);
  out = enrichWebPageObjectWithStepMethods(out);

  return out.trimEnd() + "\n";
}
