/** Playwright web locator helper — scaffolded under support/web-locate.ts (web projects only). */
export const WEB_LOCATE_HELPER_SOURCE = `import type { Page, Locator, FrameLocator } from "@playwright/test";

export type WebLocatorStrategy = "testId" | "label" | "placeholder" | "role" | "text" | "css";

export type WebLocatorSpec = {
  strategy: WebLocatorStrategy;
  value: string;
  /** ARIA role when strategy is "role" (e.g. button, textbox, link). */
  role?: string;
  /** CSS selector for an iframe — scopes the locator with frameLocator (e.g. iframe#payment). */
  frame?: string;
  /** CSS selector for a shadow host — chained before the inner locator (open shadow roots). */
  shadowHost?: string;
  /** When multiple elements match, use this 0-based index (default 0 = first). */
  index?: number;
};

type LocatorRoot = Page | FrameLocator | Locator;

/** When index is set, pin to that match; otherwise keep all visible matches for click helpers to pick in-viewport. */
function visibleMatches(loc: Locator, index: number | undefined): Locator {
  const filtered = loc.filter({ visible: true });
  if (index !== undefined) {
    return filtered.nth(index);
  }
  return filtered;
}

function locatorOnRoot(
  root: LocatorRoot,
  spec: Pick<WebLocatorSpec, "strategy" | "value" | "role" | "index">,
): Locator {
  switch (spec.strategy) {
    case "css":
      return root.locator(spec.value);
    case "testId":
      return root.getByTestId(spec.value);
    case "label":
      return root.getByLabel(spec.value, { exact: true });
    case "placeholder":
      return root.getByPlaceholder(spec.value, { exact: true });
    case "role": {
      const role = spec.role ?? "button";
      const text = spec.value;
      // <a> links: getByRole('link', { name }) often misses when name is from innerText; tag + hasText is reliable.
      if (role === "link") {
        return visibleMatches(root.locator("a", { hasText: text }), spec.index);
      }
      if (role === "button") {
        return visibleMatches(
          root.locator('button, [role="button"], input[type="button"], input[type="submit"]', {
            hasText: text,
          }),
          spec.index,
        );
      }
      return visibleMatches(
        root.getByRole(role as Parameters<Page["getByRole"]>[0], { name: text, exact: true }),
        spec.index,
      );
    }
    case "text":
      return visibleMatches(root.getByText(spec.value, { exact: true }), spec.index);
    default: {
      const _exhaustive: never = spec.strategy;
      return _exhaustive;
    }
  }
}

export function webLocator(page: Page, spec: WebLocatorSpec): Locator {
  const frame = spec.frame?.trim();
  const shadowHost = spec.shadowHost?.trim();
  const inner: Pick<WebLocatorSpec, "strategy" | "value" | "role" | "index"> = {
    strategy: spec.strategy,
    value: spec.value,
    role: spec.role,
    index: spec.index,
  };

  let root: LocatorRoot = frame !== undefined && frame.length > 0 ? page.frameLocator(frame) : page;
  if (shadowHost !== undefined && shadowHost.length > 0) {
    root = root.locator(shadowHost);
  }
  return locatorOnRoot(root, inner);
}
`;
