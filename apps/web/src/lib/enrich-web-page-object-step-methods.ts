import { WEB_ACTIONS_IMPORT_BLOCK } from "@/lib/screen-codegen/web-actions-helper";

function appendMethodsBeforeClassClose(content: string, methods: string): string {
  const trimmed = content.trimEnd();
  if (!trimmed.endsWith("}")) {
    return content;
  }
  return `${trimmed.slice(0, -1)}\n${methods}\n}\n`;
}

function pascalCaseLocatorKey(key: string): string {
  if (key.length === 0) return key;
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

function hasMethod(content: string, name: string): boolean {
  return new RegExp(`\\basync\\s+${name}\\s*\\(`).test(content);
}

const WEB_LOCATE_IMPORT_RE = /\nimport\s+\{\s*webLocator\s*\}\s+from\s+["']\.\.\/support\/web-locate["']\s*;/g;

function ensureWebActionImports(content: string): string {
  let out = content;
  if (/from\s+["']\.\.\/support\/web-actions["']/.test(out)) {
    out = out.replace(
      /import\s+\{[\s\S]*?\}\s+from\s+["']\.\.\/support\/web-actions["']\s*;/,
      WEB_ACTIONS_IMPORT_BLOCK,
    );
    out = out.replace(WEB_LOCATE_IMPORT_RE, "");
    return out;
  }
  const locateImport = /import\s+\{\s*webLocator\s*\}\s+from\s+["']\.\.\/support\/web-locate["']\s*;/;
  if (locateImport.test(out)) {
    return out.replace(locateImport, WEB_ACTIONS_IMPORT_BLOCK);
  }
  return out;
}

type LocatorKind = "textbox" | "checkbox" | "combobox" | "clickable";

function inferLocatorKind(content: string, cap: string): LocatorKind {
  if (hasMethod(content, `fill${cap}`)) return "textbox";
  if (hasMethod(content, `check${cap}`)) return "checkbox";
  if (hasMethod(content, `select${cap}`)) return "combobox";
  return "clickable";
}

function inferLocatorKindFromEntry(entryBody: string, content: string, cap: string): LocatorKind {
  const kindMatch = /actionKind:\s*["'](\w+)["']/.exec(entryBody);
  if (kindMatch !== null) {
    if (kindMatch[1] === "checkbox") return "checkbox";
    if (kindMatch[1] === "textbox") return "textbox";
    if (kindMatch[1] === "combobox") return "combobox";
    if (kindMatch[1] === "radio") return "clickable";
    if (kindMatch[1] === "button" || kindMatch[1] === "link") return "clickable";
  }
  if (/type\s*=\s*["']checkbox["']|input\[type=checkbox\]/i.test(entryBody)) {
    return "checkbox";
  }
  return inferLocatorKind(content, cap);
}

/**
 * Adds step-codegen methods for each locator in `L` (visibility, assertions, scroll, etc.).
 * Used when building the web page-object step index — does not modify mobile screens.
 */
export function enrichWebPageObjectWithStepMethods(content: string): string {
  const classMatch = content.match(/export class (\w+)/);
  const lBlockMatch = content.match(/private static readonly L = \{([\s\S]*?)\} as const/);
  if (classMatch === null || lBlockMatch === null) {
    return content;
  }

  const className = classMatch[1];
  const entryPattern = /(\w+):\s*\{([^}]*)\}/g;
  const methods: string[] = [];
  const loc = (key: string) => `webLocator(this.page, ${className}.L.${key})`;

  for (const match of lBlockMatch[1].matchAll(entryPattern)) {
    const key = match[1];
    const entryBody = match[2];
    const cap = pascalCaseLocatorKey(key);
    const kind = inferLocatorKindFromEntry(entryBody, content, cap);

    const add = (name: string, body: string) => {
      if (!hasMethod(content, name) && !methods.some((m) => m.includes(`async ${name}(`))) {
        methods.push(`  async ${name}${body}`);
      }
    };

    if (kind === "clickable") {
      add(`click${cap}`, `(): Promise<void> {\n    await clickWhenVisible(${loc(key)});\n  }\n`);
      add(`doubleClick${cap}`, `(): Promise<void> {\n    await doubleClickWhenVisible(${loc(key)});\n  }\n`);
      add(`longPress${cap}`, `(): Promise<void> {\n    await longPressWhenVisible(${loc(key)});\n  }\n`);
    }

    if (kind === "textbox") {
      add(`fill${cap}`, `(value: string): Promise<void> {\n    await fillWhenVisible(${loc(key)}, value);\n  }\n`);
      add(`clear${cap}`, `(): Promise<void> {\n    await clearWhenVisible(${loc(key)});\n  }\n`);
      add(
        `typeText${cap}`,
        `(value: string): Promise<void> {\n    await typeTextWhenVisible(${loc(key)}, value);\n  }\n`,
      );
    }

    if (kind === "checkbox") {
      add(`check${cap}`, `(): Promise<void> {\n    await checkWhenVisible(${loc(key)});\n  }\n`);
      add(`uncheck${cap}`, `(): Promise<void> {\n    await uncheckWhenVisible(${loc(key)});\n  }\n`);
    }

    if (kind === "combobox") {
      add(
        `select${cap}`,
        `(value: string): Promise<void> {\n    await selectOptionWhenVisible(${loc(key)}, value);\n  }\n`,
      );
    }

    add(
      `expect${cap}Visible`,
      `(timeoutMs = 30_000): Promise<void> {\n    await expectVisible(${loc(key)}, timeoutMs);\n  }\n`,
    );
    add(
      `expect${cap}Hidden`,
      `(timeoutMs = 30_000): Promise<void> {\n    await expectHidden(${loc(key)}, timeoutMs);\n  }\n`,
    );
    add(
      `expect${cap}Text`,
      `(expected: string, timeoutMs = 30_000): Promise<void> {\n    await expectText(${loc(key)}, expected, timeoutMs);\n  }\n`,
    );
    add(
      `expect${cap}ContainsText`,
      `(substring: string, timeoutMs = 30_000): Promise<void> {\n    await expectContainsText(${loc(key)}, substring, timeoutMs);\n  }\n`,
    );
    add(
      `expect${cap}Value`,
      `(value: string, timeoutMs = 30_000): Promise<void> {\n    await expectValue(${loc(key)}, value, timeoutMs);\n  }\n`,
    );
    add(
      `expect${cap}Enabled`,
      `(timeoutMs = 30_000): Promise<void> {\n    await expectEnabled(${loc(key)}, timeoutMs);\n  }\n`,
    );
    add(
      `expect${cap}Disabled`,
      `(timeoutMs = 30_000): Promise<void> {\n    await expectDisabled(${loc(key)}, timeoutMs);\n  }\n`,
    );
    add(
      `expect${cap}Checked`,
      `(timeoutMs = 30_000): Promise<void> {\n    await expectChecked(${loc(key)}, timeoutMs);\n  }\n`,
    );
    add(
      `expect${cap}Unchecked`,
      `(timeoutMs = 30_000): Promise<void> {\n    await expectUnchecked(${loc(key)}, timeoutMs);\n  }\n`,
    );
    add(
      `expect${cap}Focused`,
      `(timeoutMs = 30_000): Promise<void> {\n    await expectFocused(${loc(key)}, timeoutMs);\n  }\n`,
    );
    add(
      `expect${cap}Count`,
      `(count: number, timeoutMs = 30_000): Promise<void> {\n    await expectCount(${loc(key)}, count, timeoutMs);\n  }\n`,
    );
    add(
      `scroll${cap}IntoView`,
      `(): Promise<void> {\n    await scrollIntoViewWhenVisible(${loc(key)});\n  }\n`,
    );
  }

  if (methods.length === 0) {
    return content;
  }

  let out = appendMethodsBeforeClassClose(content, methods.join("\n"));
  out = ensureWebActionImports(out);
  return out;
}
