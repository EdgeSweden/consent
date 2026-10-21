// Plan: Demo, Script gating, Google Consent Mode v2; Tests, "The required gated script runs and the
// required Consent Mode key is granted before a choice". The demo installs both adapters through
// the integration's generated page script.
import type { Page, Request } from "@playwright/test";
import { BLOCKING, banner, en, expect, test } from "./fixtures.js";

const activated = (page: Page) => page.locator("#gated-scripts li");

async function commands(page: Page): Promise<unknown[]> {
  return page
    .locator("#data-layer li")
    .evaluateAll((items) => items.map((li) => JSON.parse(li.textContent ?? "null") as unknown));
}

const defaults = [
  "consent",
  "default",
  {
    security_storage: "granted",
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    personalization_storage: "denied",
  },
];

const update = (value: "granted" | "denied") => [
  "consent",
  "update",
  {
    security_storage: "granted",
    analytics_storage: value,
    ad_storage: value,
    ad_user_data: value,
    ad_personalization: value,
  },
];

function gated(requests: Request[]): string[] {
  return requests
    .map((r) => r.url())
    .filter((url) => url.startsWith(`${BLOCKING}/gated/`))
    .map((url) => url.slice(`${BLOCKING}/gated/`.length));
}

test("before a choice only the required script runs and Consent Mode has only its default", async ({
  page,
}) => {
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  await expect(activated(page)).toHaveText(["necessary"]);
  await page.waitForLoadState("networkidle");
  expect(gated(requests)).toEqual(["necessary.js"]);
  expect(await commands(page)).toEqual([defaults]);
});

test("Accept all runs each optional script once and updates Consent Mode", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: en.acceptAll }).click();
  await expect(activated(page)).toHaveText(["necessary", "analytics", "marketing"]);
  expect(await commands(page)).toEqual([defaults, update("granted")]);

  // A withdrawal denies again; a script that has run stays and nothing runs twice.
  await page.locator("#withdraw").click();
  await expect(page.locator("#data-layer li")).toHaveCount(3);
  expect(await commands(page)).toEqual([defaults, update("granted"), update("denied")]);
  await expect(activated(page)).toHaveText(["necessary", "analytics", "marketing"]);
});

test("Reject all runs no optional script and sends no update", async ({ page }) => {
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  await page.goto("/");
  await page.getByRole("button", { name: en.rejectAll }).click();
  await expect(banner(page)).toBeHidden();
  await page.waitForLoadState("networkidle");
  expect(gated(requests)).toEqual(["necessary.js"]);
  await expect(activated(page)).toHaveText(["necessary"]);
  expect(await commands(page)).toEqual([defaults]);
});

test("a stored grant runs the scripts and updates Consent Mode at mount on the next page", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: en.acceptAll }).click();
  await page.goto("/about/");
  await expect(activated(page)).toHaveText(["necessary", "analytics", "marketing"]);
  expect(await commands(page)).toEqual([defaults, update("granted")]);
});
