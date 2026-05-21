/** Shared Mobilewright framework package manifest (all per-project frameworks use the same deps). */
export const FRAMEWORK_PACKAGE_JSON = `{
  "name": "mobilewright-framework",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "mobilewright test",
    "test:report": "mobilewright show-report",
    "doctor": "mobilewright doctor",
    "capture:tree": "node scripts/capture-view-tree.mjs"
  },
  "devDependencies": {
    "@mobilewright/test": "^0.0.35",
    "mobilewright": "^0.0.35",
    "typescript": "^5.8.3"
  }
}
`;
