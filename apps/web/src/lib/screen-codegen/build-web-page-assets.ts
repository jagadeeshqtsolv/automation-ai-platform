import type { WebPageElement } from "@jagadeeshqtsolv/core";
import {
  appendWebFlowMethodsToMethodSummary,
  enrichWebPageObjectWithFlowMethods,
} from "@/lib/enrich-web-page-object-flows";
import { enrichWebPageObjectWithStepMethods } from "@/lib/enrich-web-page-object-step-methods";
import { normalizePageClassName, normalizePageModulePath } from "@/lib/page-object-naming";
import { WEB_ACTIONS_IMPORT_BLOCK } from "@/lib/screen-codegen/web-actions-helper";
import { resolveWebActionKind } from "@/lib/screen-codegen/web-action-kind";
import { formatWebLocatorSpecLine } from "@/lib/screen-codegen/web-locator-spec-line";

function assertionMethods(className: string, el: WebPageElement): string[] {
  const cap = el.key.charAt(0).toUpperCase() + el.key.slice(1);
  const loc = `webLocator(this.page, ${className}.L.${el.key})`;
  return [
    `  async expect${cap}Visible(timeoutMs = 30_000): Promise<void> {`,
    `    await expectVisible(${loc}, timeoutMs);`,
    `  }`,
    ``,
    `  async expect${cap}Hidden(timeoutMs = 30_000): Promise<void> {`,
    `    await expectHidden(${loc}, timeoutMs);`,
    `  }`,
    ``,
    `  async expect${cap}Text(expected: string, timeoutMs = 30_000): Promise<void> {`,
    `    await expectText(${loc}, expected, timeoutMs);`,
    `  }`,
    ``,
    `  async expect${cap}ContainsText(substring: string, timeoutMs = 30_000): Promise<void> {`,
    `    await expectContainsText(${loc}, substring, timeoutMs);`,
    `  }`,
    ``,
    `  async expect${cap}Value(value: string, timeoutMs = 30_000): Promise<void> {`,
    `    await expectValue(${loc}, value, timeoutMs);`,
    `  }`,
    ``,
    `  async expect${cap}Enabled(timeoutMs = 30_000): Promise<void> {`,
    `    await expectEnabled(${loc}, timeoutMs);`,
    `  }`,
    ``,
    `  async expect${cap}Disabled(timeoutMs = 30_000): Promise<void> {`,
    `    await expectDisabled(${loc}, timeoutMs);`,
    `  }`,
    ``,
    `  async expect${cap}Checked(timeoutMs = 30_000): Promise<void> {`,
    `    await expectChecked(${loc}, timeoutMs);`,
    `  }`,
    ``,
    `  async expect${cap}Unchecked(timeoutMs = 30_000): Promise<void> {`,
    `    await expectUnchecked(${loc}, timeoutMs);`,
    `  }`,
    ``,
    `  async expect${cap}Focused(timeoutMs = 30_000): Promise<void> {`,
    `    await expectFocused(${loc}, timeoutMs);`,
    `  }`,
    ``,
    `  async expect${cap}Count(count: number, timeoutMs = 30_000): Promise<void> {`,
    `    await expectCount(${loc}, count, timeoutMs);`,
    `  }`,
    ``,
    `  async scroll${cap}IntoView(): Promise<void> {`,
    `    await scrollIntoViewWhenVisible(${loc});`,
    `  }`,
    ``,
  ];
}

function methodLinesForElement(className: string, el: WebPageElement): string[] {
  const cap = el.key.charAt(0).toUpperCase() + el.key.slice(1);
  const loc = `webLocator(this.page, ${className}.L.${el.key})`;
  const lines: string[] = [];
  const kind = resolveWebActionKind(el);

  switch (kind) {
    case "textbox":
      lines.push(
        `  async fill${cap}(value: string): Promise<void> {`,
        `    await fillWhenVisible(${loc}, value);`,
        `  }`,
        ``,
        `  async clear${cap}(): Promise<void> {`,
        `    await clearWhenVisible(${loc});`,
        `  }`,
        ``,
        `  async typeText${cap}(value: string): Promise<void> {`,
        `    await typeTextWhenVisible(${loc}, value);`,
        `  }`,
        ``,
      );
      break;
    case "checkbox":
      lines.push(
        `  async check${cap}(): Promise<void> {`,
        `    await checkWhenVisible(${loc});`,
        `  }`,
        ``,
        `  async uncheck${cap}(): Promise<void> {`,
        `    await uncheckWhenVisible(${loc});`,
        `  }`,
        ``,
      );
      break;
    case "combobox":
      lines.push(
        `  async select${cap}(value: string): Promise<void> {`,
        `    await selectOptionWhenVisible(${loc}, value);`,
        `  }`,
        ``,
      );
      break;
    case "radio":
      lines.push(
        `  async select${cap}(): Promise<void> {`,
        `    await clickWhenVisible(${loc});`,
        `  }`,
        ``,
      );
      break;
    case "button":
    case "link":
    case "generic":
    default:
      lines.push(
        `  async click${cap}(): Promise<void> {`,
        `    await clickWhenVisible(${loc});`,
        `  }`,
        ``,
        `  async doubleClick${cap}(): Promise<void> {`,
        `    await doubleClickWhenVisible(${loc});`,
        `  }`,
        ``,
        `  async longPress${cap}(): Promise<void> {`,
        `    await longPressWhenVisible(${loc});`,
        `  }`,
        ``,
      );
      break;
  }

  lines.push(...assertionMethods(className, el));
  return lines;
}

function methodSummaryForElement(el: WebPageElement): string {
  const cap = el.key.charAt(0).toUpperCase() + el.key.slice(1);
  const assertions = `expect${cap}Visible(), expect${cap}Hidden(), expect${cap}Text(), scroll${cap}IntoView()`;
  switch (resolveWebActionKind(el)) {
    case "textbox":
      return `fill${cap}(), clear${cap}(), typeText${cap}(), ${assertions}`;
    case "checkbox":
      return `check${cap}(), uncheck${cap}(), ${assertions}`;
    case "combobox":
      return `select${cap}(value), ${assertions}`;
    case "radio":
      return `select${cap}(), ${assertions}`;
    default:
      return `click${cap}(), doubleClick${cap}(), longPress${cap}(), ${assertions}`;
  }
}

export function buildWebPageClassFile(pageName: string, elements: WebPageElement[]): string {
  const className = normalizePageClassName(pageName);
  const locatorLines = elements.map(formatWebLocatorSpecLine);
  const methods = elements.flatMap((el) => methodLinesForElement(className, el));

  return [
    `import type { Page } from "@playwright/test";`,
    WEB_ACTIONS_IMPORT_BLOCK,
    ``,
    `export class ${className} {`,
    `  private static readonly L = {`,
    ...locatorLines,
    `  } as const;`,
    ``,
    `  constructor(private readonly page: Page) {}`,
    ``,
    ...methods,
    `}`,
    ``,
  ].join("\n");
}

export function buildWebPageAssets(pageName: string, elements: WebPageElement[]): {
  pageModulePath: string;
  pageContent: string;
  className: string;
  methodSummary: string;
} {
  const rawContent = buildWebPageClassFile(pageName, elements);
  const withFlows = enrichWebPageObjectWithFlowMethods(rawContent);
  const pageContent = enrichWebPageObjectWithStepMethods(withFlows);
  const className = normalizePageClassName(pageName);
  const atomicSummary = elements.map(methodSummaryForElement).join(", ");
  const methodSummary = appendWebFlowMethodsToMethodSummary(atomicSummary, pageContent);

  return {
    pageModulePath: normalizePageModulePath(className),
    pageContent,
    className,
    methodSummary,
  };
}
