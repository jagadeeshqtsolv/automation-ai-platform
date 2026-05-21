# Mobilewright runner example

This folder is **not** part of the npm workspace so it can track Mobilewright releases independently.

```bash
cd examples/runner
npm install
npm run doctor   # verify simulators / tooling
npm test         # default sample is skipped until you configure bundleId + device
```

Paste generated TypeScript from the web app into `tests/generated/` (create the folder), then run `npm test` again.

- Product docs: [https://mobilewright.dev/](https://mobilewright.dev/)
- Configure `mobilewright.config.ts` for your **bundle id**, **platform**, and **device**, then wire cloud farms (BrowserStack, LambdaTest, Mobile Use, etc.) per their Mobilewright / Appium integration guides.
