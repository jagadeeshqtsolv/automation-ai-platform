// Skeleton aligned with `npx mobilewright init` output.
// See https://mobilewright.dev/docs/
import { test, expect } from "@mobilewright/test";

test.skip("app launches and shows home screen (configure bundleId + device first)", async ({ screen }) => {
  await expect(screen.getByText("Welcome")).toBeVisible();
});
