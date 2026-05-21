/** Playwright web framework package manifest (browser automation). */
export const WEB_FRAMEWORK_PACKAGE_JSON = `{
  "name": "playwright-web-framework",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test",
    "test:report": "playwright show-report",
    "test:ui": "playwright test --ui",
    "capture:dom": "node scripts/capture-dom.mjs"
  },
  "devDependencies": {
    "@playwright/test": "^1.58.2",
    "typescript": "^5.8.3"
  }
}
`;
