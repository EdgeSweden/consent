// Plan: Tests, "Keyboard-only path", "Cookie contents after each kind of choice", "Reopen from the
// footer control and withdraw()". Every choice here is made from the keyboard.
import {
  banner,
  en,
  expect,
  pages,
  recordedActions,
  settings,
  storedConsent,
  test,
  type StoredConsent,
} from "./fixtures.js";
import type { Locator, Page } from "@playwright/test";

const all = (value: boolean) => ({ necessary: true, analytics: value, marketing: value });

/** Tabs until `target` has focus, then presses `key`. */
async function reach(page: Page, target: Locator, key = "Enter"): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) {
      return page.keyboard.press(key);
    }
  }
  throw new Error(`could not reach ${String(target)} with Tab`);
}

const inBanner = (page: Page, name: string) =>
  reach(page, banner(page).getByRole("button", { name }));
const inSettings = (page: Page, name: string) =>
  reach(page, settings(page).getByRole("button", { name }));
const toggle = (page: Page, id: "analytics" | "marketing") =>
  page.getByRole("checkbox", { name: en.categories[id]?.name ?? id });

function expectCookie(stored: StoredConsent | null, categories: Record<string, boolean>): void {
  expect(stored).toMatchObject({ v: 1, p: "2026-10", c: categories });
  expect(stored?.t).toBeGreaterThan(Date.now() / 1000 - 60);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(banner(page)).toBeFocused();
});

test("Accept all stores every category and records accept_all", async ({ page, context }) => {
  await inBanner(page, en.acceptAll);
  await expect(banner(page)).toBeHidden();
  expectCookie(await storedConsent(context), all(true));
  expect(await recordedActions(page)).toEqual(["accept_all"]);
  await expect(page.locator("html")).toHaveAttribute("data-consent-analytics", "granted");
});

test("Reject all stores the refusal and records reject_all", async ({ page, context }) => {
  await inBanner(page, en.rejectAll);
  await expect(banner(page)).toBeHidden();
  expectCookie(await storedConsent(context), all(false));
  expect(await recordedActions(page)).toEqual(["reject_all"]);
});

test("a stored choice hides the banner on the next page", async ({ page }) => {
  await inBanner(page, en.rejectAll);
  await page.goto("/about/");
  await expect(page.locator("#consent-state")).toContainText('"at"');
  await expect(banner(page)).toBeHidden();
});

test("Settings, one switch on and Save stores a custom choice", async ({ page, context }) => {
  await inBanner(page, en.settings);
  await expect(settings(page)).toBeFocused();
  await reach(page, toggle(page, "analytics"), "Space");
  await expect(toggle(page, "analytics")).toBeChecked();
  await inSettings(page, en.save);
  await expect(settings(page)).toBeHidden();
  expectCookie(await storedConsent(context), { ...all(false), analytics: true });
  expect(await recordedActions(page)).toEqual(["custom"]);
});

test("reopen from the footer, all switches off and Save records withdraw", async ({
  page,
  context,
}) => {
  await inBanner(page, en.acceptAll);
  await reach(page, page.getByRole("button", { name: pages.en.cookieSettings }));
  await expect(settings(page)).toBeFocused();
  for (const id of ["analytics", "marketing"] as const) {
    await expect(toggle(page, id)).toBeChecked();
    await reach(page, toggle(page, id), "Space");
  }
  await inSettings(page, en.save);
  expectCookie(await storedConsent(context), all(false));
  expect(await recordedActions(page)).toEqual(["accept_all", "withdraw"]);
  await expect(page.getByRole("button", { name: pages.en.cookieSettings })).toBeFocused();
});

test("withdraw() after Accept all denies every optional category", async ({ page, context }) => {
  await inBanner(page, en.acceptAll);
  await page.getByRole("button", { name: pages.en.withdraw }).click();
  expectCookie(await storedConsent(context), all(false));
  expect(await recordedActions(page)).toEqual(["accept_all", "withdraw"]);
  await expect(page.locator("html")).toHaveAttribute("data-consent-analytics", "denied");
});

test("reopening and saving unchanged switches writes and records nothing", async ({
  page,
  context,
}) => {
  await inBanner(page, en.rejectAll);
  const before = await storedConsent(context);
  await page.getByRole("button", { name: pages.en.cookieSettings }).click();
  await settings(page).getByRole("button", { name: en.save }).click();
  await expect(settings(page)).toBeHidden();
  expect(await storedConsent(context)).toEqual(before);
  expect(await recordedActions(page)).toEqual(["reject_all"]);
});

test("a changed policyVersion re-prompts and denies every optional category", async ({
  page,
  context,
}) => {
  const old = { v: 1, p: "2026-01", t: 1_700_000_000, c: all(true) };
  await context.addCookies([
    { name: "consent", value: encodeURIComponent(JSON.stringify(old)), url: page.url() },
  ]);
  await page.reload();
  await expect(banner(page)).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-consent-analytics", "denied");
  await inBanner(page, en.acceptAll);
  expectCookie(await storedConsent(context), all(true));
});
