import type { ScreenElement } from "@automation-ai/shared";
import { appendFlowMethodsToMethodSummary, enrichPageObjectWithFlowMethods } from "@/lib/enrich-page-object-flows";
import { normalizeScreenClassName, normalizeScreenModulePath } from "@/lib/page-object-naming";

export function screenClassName(screenName: string): string {
  return normalizeScreenClassName(screenName);
}

export function screenModulePath(screenName: string): string {
  return normalizeScreenModulePath(screenName);
}

function escapeTsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Locator map lives inside the screen class as `private static readonly L` — edit there when UI changes. */
export function buildScreenClassFile(screenName: string, elements: ScreenElement[]): string {
  const className = screenClassName(screenName);

  const locatorLines = elements.map((el) => {
    const base = `    ${el.key}: { strategy: '${el.strategy}' as const, value: '${escapeTsString(el.value)}'`;
    if (el.strategy === "role" && el.role) {
      return `${base}, role: '${escapeTsString(el.role)}' },`;
    }
    return `${base} },`;
  });

  const methods: string[] = [];

  for (const el of elements) {
    const methodBase = el.key.charAt(0).toUpperCase() + el.key.slice(1);
    if (el.strategy === "text") {
      methods.push(
        `  async tap${methodBase}(): Promise<void> {`,
        `    await expectVisibleThenTap(locate(this.screen, ${className}.L.${el.key}));`,
        `  }`,
        "",
        `  async expect${methodBase}Visible(): Promise<void> {`,
        `    await expectLocatorVisible(locate(this.screen, ${className}.L.${el.key}));`,
        `  }`,
        "",
      );
    } else {
      methods.push(
        `  async tap${methodBase}(): Promise<void> {`,
        `    await expectVisibleThenTap(locate(this.screen, ${className}.L.${el.key}));`,
        `  }`,
        "",
        `  async fill${methodBase}(value: string): Promise<void> {`,
        `    await fillWhenVisible(locate(this.screen, ${className}.L.${el.key}), value);`,
        `  }`,
        "",
      );
    }
  }

  return [
    `import type { Screen } from "@mobilewright/core";`,
    `import { locate } from "../support/locate";`,
    `import { expectLocatorVisible, expectVisibleThenTap, fillWhenVisible } from "../support/actions";`,
    "",
    `export class ${className} {`,
    `  /** Locator definitions — keep in sync with the live app. */`,
    `  private static readonly L = {`,
    ...locatorLines,
    `  } as const;`,
    "",
    `  constructor(private readonly screen: Screen) {}`,
    "",
    ...methods,
    `}`,
    "",
  ].join("\n");
}

export function buildScreenAssets(screenName: string, elements: ScreenElement[]): {
  pageModulePath: string;
  pageContent: string;
  className: string;
  methodSummary: string;
} {
  const rawContent = buildScreenClassFile(screenName, elements);
  const pageContent = enrichPageObjectWithFlowMethods(rawContent);
  const className = screenClassName(screenName);
  const atomicSummary = elements
    .map((e) => {
      const cap = e.key.charAt(0).toUpperCase() + e.key.slice(1);
      return e.strategy === "text" ? `tap${cap}(), expect${cap}Visible()` : `tap${cap}(), fill${cap}()`;
    })
    .join(", ");
  const methodSummary = appendFlowMethodsToMethodSummary(atomicSummary, pageContent);

  return {
    pageModulePath: screenModulePath(screenName),
    pageContent,
    className,
    methodSummary,
  };
}
