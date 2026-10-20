// Plan: Tests, "Locale switch changes every string; {link:<id>} renders as a link".
import { banner, en, expect, pages, settings, sv, test } from "./fixtures.js";
import type { Page } from "@playwright/test";

type Strings = typeof en;

/** The description with each {link:<id>} token replaced by its label, as rendered. */
const rendered = (s: Strings, text: string) =>
  text.replace(
    /\{link:([^}]+)\}/g,
    (_, id: string) => s.links?.find((l) => l.id === id)?.label ?? "",
  );

async function expectStrings(page: Page, s: Strings): Promise<void> {
  const policy = s.links?.[0];
  if (policy === undefined) throw new Error("the demo's locales each have a policy link");
  const first = banner(page, s);
  await expect(first).toBeVisible();
  await expect(first).toContainText(rendered(s, s.description));
  for (const name of [s.acceptAll, s.rejectAll, s.settings]) {
    await expect(first.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(first.getByRole("link", { name: policy.label })).toHaveAttribute(
    "href",
    policy.href,
  );

  await first.getByRole("button", { name: s.settings, exact: true }).click();
  const second = settings(page, s);
  await expect(second).toBeVisible();
  await expect(second).toContainText(rendered(s, s.settingsDescription ?? ""));
  await expect(second.getByRole("link", { name: policy.label })).toBeVisible();
  for (const name of [s.acceptAll, s.rejectAll, s.save]) {
    await expect(second.getByRole("button", { name, exact: true })).toBeVisible();
  }
  for (const category of Object.values(s.categories)) {
    await expect(second).toContainText(category.name);
    await expect(second).toContainText(category.description);
  }
  for (const service of Object.values(s.services ?? {})) {
    await expect(second).toContainText(service.name);
  }
  await expect(second).toContainText(s.alwaysActive);
}

test("the English page shows every English string", async ({ page }) => {
  await page.goto("/");
  await expectStrings(page, en);
});

test("switching to Swedish shows every Swedish string", async ({ page }) => {
  await page.goto("/");
  await banner(page).getByRole("button", { name: en.rejectAll }).click();
  await page.getByRole("link", { name: pages.en.otherLanguage.label }).click();
  await expect(page).toHaveURL(/\/sv\/$/);
  // The stored choice holds across languages; the dialog is reopened to see its strings.
  await expect(banner(page, sv)).toBeHidden();
  await page.context().clearCookies();
  await page.reload();
  await expectStrings(page, sv);
});

for (const lang of ["en", "sv"] as const) {
  const t = pages[lang];
  for (const { path, title, body } of Object.values(t.pages)) {
    test(`${path} shows its ${lang} page copy`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page).toHaveTitle(title);
      await expect(page.locator("main h1")).toHaveText(title);
      await expect(page.locator("main p").first()).toHaveText(body);
      // The page behind a blocking banner is inert, so it is located by text and href, not role.
      for (const text of [t.state, t.records, t.cookieSettings, t.withdraw]) {
        await expect(page.getByText(text, { exact: true }).first()).toBeAttached();
      }
      for (const linked of Object.values(t.pages)) {
        await expect(
          page.locator(`a[href="${linked.path}"]`, { hasText: linked.title }).first(),
        ).toBeAttached();
      }
      const other = page.locator(
        `a[href="${t.otherLanguage.href}"][lang="${t.otherLanguage.lang}"]`,
      );
      await expect(other).toHaveText(t.otherLanguage.label);
    });
  }
}
