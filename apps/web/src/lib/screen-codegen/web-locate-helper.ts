/** Playwright web locator helper — scaffolded under support/web-locate.ts. Source of truth: packages/web-core/src/web-locate.ts */

export type WebLocatorStrategy = "testId" | "label" | "placeholder" | "role" | "text" | "css";

export type WebLocatorSpec = {
  strategy: WebLocatorStrategy;
  value: string;
  role?: string;
  frame?: string;
  shadowHost?: string;
  index?: number;
};
