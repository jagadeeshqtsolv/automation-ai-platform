/** Mobilewright-only interaction helpers — support/actions.ts on mobile projects only. */
export const MOBILE_ACTIONS_HELPER_SOURCE = `import type { Locator } from "@mobilewright/core";
import { expect } from "@mobilewright/test";

/** Waits until the locator is visible, then taps (handles slow mounts / animations). */
export async function expectVisibleThenTap(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await expect(locator).toBeVisible({ timeout: timeoutMs });
  await locator.tap();
}

/** Waits until visible, then fills (inputs / text fields). */
export async function fillWhenVisible(locator: Locator, value: string, timeoutMs = 30_000): Promise<void> {
  await expect(locator).toBeVisible({ timeout: timeoutMs });
  await locator.fill(value);
}

/** Assertion-only helper for expectations without an interaction. */
export async function expectLocatorVisible(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await expect(locator).toBeVisible({ timeout: timeoutMs });
}

/** Asserts the locator is not attached / not visible (menus, post-logout state, etc.). */
export async function expectLocatorHidden(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await expect(locator).not.toBeVisible({ timeout: timeoutMs });
}
`;
