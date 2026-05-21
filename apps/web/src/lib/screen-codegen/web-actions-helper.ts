/** All helpers page objects may import from `support/web-actions.ts`. Keep in sync with WEB_ACTIONS_HELPER_SOURCE. */
export const WEB_ACTION_EXPORTS = [
  "checkWhenVisible",
  "clearWhenVisible",
  "clickOpensNewPage",
  "clickWhenVisible",
  "closePage",
  "doubleClickWhenVisible",
  "expectChecked",
  "expectContainsText",
  "expectCount",
  "expectCountGreaterThan",
  "expectDisabled",
  "expectEnabled",
  "expectFocused",
  "expectHidden",
  "expectText",
  "expectUnchecked",
  "expectValue",
  "expectVisible",
  "fill",
  "fillWhenVisible",
  "getTextWhenVisible",
  "hoverWhenVisible",
  "longPressWhenVisible",
  "scrollIntoView",
  "scrollIntoViewWhenVisible",
  "selectOptionWhenVisible",
  "typeTextWhenVisible",
  "uncheckWhenVisible",
  "waitForNewPage",
] as const;

export const WEB_ACTIONS_IMPORT_BLOCK = `import {
  ${WEB_ACTION_EXPORTS.join(",\n  ")},
} from "../support/web-actions";`;

/** Playwright web interaction helpers — support/web-actions.ts (never mixed with mobile support/actions.ts). */
export const WEB_ACTIONS_HELPER_SOURCE = `import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { webLocator } from "./web-locate";

export { webLocator };

async function isInViewport(locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  if (box === null || box.width <= 0 || box.height <= 0) {
    return false;
  }
  const viewport = locator.page().viewportSize();
  if (viewport === null) {
    return true;
  }
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.x + box.width <= viewport.width &&
    box.y + box.height <= viewport.height
  );
}

/** Scroll into view and center — avoids sticky headers / clipped nav. */
async function prepareLocatorForInteraction(locator: Locator, timeoutMs: number): Promise<void> {
  await expect(locator).toBeVisible({ timeout: timeoutMs });
  await locator.scrollIntoViewIfNeeded({ timeout: timeoutMs });
  await locator
    .evaluate((el) => {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    })
    .catch(() => undefined);
}

async function programmaticClick(locator: Locator): Promise<void> {
  await locator.evaluate((el) => {
    (el as HTMLElement).click();
  });
}

/** Clicks the first matching element that is actually inside the viewport (nav often has duplicate off-screen links). */
async function clickLocatable(locator: Locator, timeoutMs: number): Promise<void> {
  const clickTimeout = Math.min(10_000, timeoutMs);
  const count = await locator.count();

  for (let i = 0; i < count; i++) {
    const candidate = locator.nth(i);
    await prepareLocatorForInteraction(candidate, timeoutMs);
    if (!(await isInViewport(candidate))) {
      continue;
    }
    try {
      await candidate.click({ timeout: clickTimeout });
      return;
    } catch {
      try {
        await candidate.click({ timeout: clickTimeout, force: true });
        return;
      } catch {
        await programmaticClick(candidate);
        return;
      }
    }
  }

  const fallback = locator.first();
  await prepareLocatorForInteraction(fallback, timeoutMs);
  await programmaticClick(fallback);
}

export async function clickWhenVisible(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await expect(locator.first()).toBeVisible({ timeout: timeoutMs });
  await clickLocatable(locator, timeoutMs);
}

export async function hoverWhenVisible(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await prepareLocatorForInteraction(locator, timeoutMs);
  await locator.hover({ timeout: Math.min(10_000, timeoutMs) });
}

export async function getTextWhenVisible(locator: Locator, timeoutMs = 30_000): Promise<string> {
  await expect(locator).toBeVisible({ timeout: timeoutMs });
  return (await locator.textContent()) ?? "";
}

/** Waits for a popup/new tab opened from the current page. */
export async function waitForNewPage(page: Page, timeoutMs = 30_000): Promise<Page> {
  const popup = await page.waitForEvent("popup", { timeout: timeoutMs });
  await popup.waitForLoadState("domcontentloaded");
  return popup;
}

/** Clicks a control that opens a new tab/window; returns the new Page. */
export async function clickOpensNewPage(
  page: Page,
  locator: Locator,
  timeoutMs = 30_000,
): Promise<Page> {
  const popupPromise = page.waitForEvent("popup", { timeout: timeoutMs });
  await clickWhenVisible(locator, timeoutMs);
  const popup = await popupPromise;
  await popup.waitForLoadState("domcontentloaded");
  return popup;
}

export async function closePage(tab: Page): Promise<void> {
  await tab.close();
}

export async function doubleClickWhenVisible(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await prepareLocatorForInteraction(locator, timeoutMs);
  await locator.dblclick({ timeout: Math.min(10_000, timeoutMs) });
}

export async function longPressWhenVisible(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await prepareLocatorForInteraction(locator, timeoutMs);
  await locator.click({ delay: 800, timeout: Math.min(10_000, timeoutMs) });
}

export async function fillWhenVisible(locator: Locator, value: string, timeoutMs = 30_000): Promise<void> {
  await prepareLocatorForInteraction(locator, timeoutMs);
  await locator.fill(value, { timeout: Math.min(10_000, timeoutMs) });
}

export { fillWhenVisible as fill };

export async function clearWhenVisible(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await prepareLocatorForInteraction(locator, timeoutMs);
  await locator.fill("", { timeout: Math.min(10_000, timeoutMs) });
}

export async function typeTextWhenVisible(locator: Locator, value: string, timeoutMs = 30_000): Promise<void> {
  await prepareLocatorForInteraction(locator, timeoutMs);
  await locator.pressSequentially(value, { timeout: Math.min(10_000, timeoutMs) });
}

async function setCheckboxState(locator: Locator, checked: boolean, timeoutMs: number): Promise<void> {
  await expect(locator.first()).toBeVisible({ timeout: timeoutMs });
  const input = locator.first();
  const current = await input.isChecked().catch(() => null);
  if (current === checked) {
    return;
  }

  await prepareLocatorForInteraction(input, timeoutMs);
  const actionTimeout = Math.min(10_000, timeoutMs);

  const applyCheck = async (force: boolean): Promise<void> => {
    if (checked) {
      await input.check({ timeout: actionTimeout, force });
    } else {
      await input.uncheck({ timeout: actionTimeout, force });
    }
  };

  try {
    await applyCheck(false);
    return;
  } catch {
    // Label often intercepts pointer events on custom-control checkboxes.
  }

  const id = await input.getAttribute("id");
  if (id !== null && id.trim().length > 0) {
    const label = input.page().locator('label[for="' + id + '"]').filter({ visible: true });
    if ((await label.count()) > 0) {
      await clickLocatable(label, timeoutMs);
      if ((await input.isChecked().catch(() => !checked)) === checked) {
        return;
      }
    }
  }

  try {
    await applyCheck(true);
    return;
  } catch {
    await input.evaluate((el, wantChecked) => {
      const box = el as HTMLInputElement;
      if (box.checked !== wantChecked) {
        box.click();
      }
    }, checked);
  }
}

export async function checkWhenVisible(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await setCheckboxState(locator, true, timeoutMs);
}

export async function uncheckWhenVisible(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await setCheckboxState(locator, false, timeoutMs);
}

export async function selectOptionWhenVisible(
  locator: Locator,
  value: string,
  timeoutMs = 30_000,
): Promise<void> {
  await prepareLocatorForInteraction(locator, timeoutMs);
  await locator.selectOption(value, { timeout: Math.min(10_000, timeoutMs) });
}

export async function scrollIntoViewWhenVisible(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await expect(locator.first()).toBeVisible({ timeout: timeoutMs });
  const count = await locator.count();
  for (let i = 0; i < count; i++) {
    const candidate = locator.nth(i);
    if (await isInViewport(candidate)) {
      await prepareLocatorForInteraction(candidate, timeoutMs);
      return;
    }
  }
  await prepareLocatorForInteraction(locator.first(), timeoutMs);
}

export { scrollIntoViewWhenVisible as scrollIntoView };

export async function expectVisible(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await expect(locator.first()).toBeVisible({ timeout: timeoutMs });
}

export async function expectHidden(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await expect(locator).not.toBeVisible({ timeout: timeoutMs });
}

export async function expectText(locator: Locator, text: string, timeoutMs = 30_000): Promise<void> {
  await expect(locator).toHaveText(text, { timeout: timeoutMs });
}

export async function expectContainsText(locator: Locator, text: string, timeoutMs = 30_000): Promise<void> {
  await expect(locator).toContainText(text, { timeout: timeoutMs });
}

export async function expectValue(locator: Locator, value: string, timeoutMs = 30_000): Promise<void> {
  await expect(locator).toHaveValue(value, { timeout: timeoutMs });
}

export async function expectEnabled(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await expect(locator).toBeEnabled({ timeout: timeoutMs });
}

export async function expectDisabled(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await expect(locator).toBeDisabled({ timeout: timeoutMs });
}

export async function expectChecked(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await expect(locator).toBeChecked({ timeout: timeoutMs });
}

export async function expectUnchecked(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await expect(locator).not.toBeChecked({ timeout: timeoutMs });
}

export async function expectFocused(locator: Locator, timeoutMs = 30_000): Promise<void> {
  await expect(locator).toBeFocused({ timeout: timeoutMs });
}

export async function expectCount(locator: Locator, count: number, timeoutMs = 30_000): Promise<void> {
  await expect(locator).toHaveCount(count, { timeout: timeoutMs });
}

export async function expectCountGreaterThan(locator: Locator, min: number, timeoutMs = 30_000): Promise<void> {
  await expect
    .poll(async () => await locator.count(), { timeout: timeoutMs })
    .toBeGreaterThan(min);
}
`;
