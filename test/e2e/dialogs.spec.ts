// Plan: Principles, 2 and Tests, "Focus trap in blocking mode", "Non-blocking mode", "Reduced motion".
import {
  NON_BLOCKING,
  banner,
  en,
  expect,
  pages,
  settings,
  storedConsent,
  test,
} from "./fixtures.js";

test.describe("blocking banner", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(banner(page)).toBeFocused();
  });

  test("Tab cycles inside the banner and the page behind it is inert", async ({ page }) => {
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const inside = await banner(page).evaluate((el) => el.contains(document.activeElement));
      expect(inside).toBe(true);
    }
    for (const part of ["header", "main", "footer"]) {
      await expect(page.locator(part)).toHaveAttribute("inert", "");
    }
  });

  test("Escape and a backdrop click do nothing", async ({ page, context }) => {
    await page.keyboard.press("Escape");
    await page.mouse.click(5, 5);
    await expect(banner(page)).toBeVisible();
    await expect(banner(page).getByRole("button", { name: en.close })).toHaveCount(0);
    expect(await storedConsent(context)).toBeNull();
  });

  test("Escape closes the settings dialog and returns focus to the banner's button", async ({
    page,
  }) => {
    const opener = banner(page).getByRole("button", { name: en.settings });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(settings(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(settings(page)).toBeHidden();
    await expect(banner(page)).toBeVisible();
    await expect(opener).toBeFocused();
  });

  test("Escape from the footer's settings dialog returns focus to the footer control", async ({
    page,
  }) => {
    await banner(page).getByRole("button", { name: en.rejectAll }).click();
    const opener = page.getByRole("button", { name: pages.en.cookieSettings });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(settings(page)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(settings(page)).toBeHidden();
    await expect(opener).toBeFocused();
  });
});

test.describe("non-blocking banner", () => {
  test.use({ baseURL: NON_BLOCKING });

  test("the close control stores nothing and the banner returns on the next page", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await expect(banner(page)).toBeVisible();
    await expect(page.locator("main")).not.toHaveAttribute("inert", "");
    await banner(page).getByRole("button", { name: en.close }).click();
    await expect(banner(page)).toBeHidden();
    expect(await storedConsent(context)).toBeNull();
    await page.goto("/about/");
    await expect(banner(page)).toBeVisible();
  });
});

test("no animation or transition under prefers-reduced-motion: reduce", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await banner(page).getByRole("button", { name: en.settings }).click();
  await expect(settings(page)).toBeVisible();
  const motion = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".consent-root, .consent-root *")).flatMap((el) => {
      const style = getComputedStyle(el);
      const durations = [style.animationName, style.transitionDuration];
      return durations.some((d) => d !== "none" && !/^0s(, 0s)*$/.test(d)) ? [el.className] : [];
    }),
  );
  expect(motion).toEqual([]);
});
