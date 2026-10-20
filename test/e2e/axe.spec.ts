// Plan: Tests, "axe with no violations in each state". axe skips inert content, so the page
// behind the banner is audited after a choice.
import { axe, banner, en, settings, test, expect } from "./fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
});

test("fresh banner", async ({ page }) => {
  await axe(page);
});

test("settings dialog open", async ({ page }) => {
  await banner(page).getByRole("button", { name: en.settings }).click();
  await expect(settings(page)).toBeVisible();
  await axe(page);
});

for (const choice of [en.rejectAll, en.acceptAll]) {
  test(`after ${choice}`, async ({ page }) => {
    await banner(page).getByRole("button", { name: choice }).click();
    await expect(banner(page)).toBeHidden();
    await axe(page);
  });
}
