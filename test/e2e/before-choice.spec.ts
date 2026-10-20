// Plan: Principles, 1 and Tests, "No storage and no request for an optional service before a choice".
import type { Request } from "@playwright/test";
import { BLOCKING, banner, expect, storedConsent, test } from "./fixtures.js";

/**
 * The only requests a fresh page may make: the document itself, and the scripts and stylesheet
 * Astro built into /_astro/. Any fetch, XHR, beacon or other script fails the test.
 */
function expected(request: Request, document: string): boolean {
  if (request.method() !== "GET") return false;
  if (request.resourceType() === "document") return request.url() === document;
  return (
    ["script", "stylesheet"].includes(request.resourceType()) &&
    new RegExp(`^${BLOCKING}/_astro/[\\w.-]+\\.(js|css)$`).test(request.url())
  );
}

test("nothing is stored or requested beyond the page's own assets before a choice", async ({
  page,
  context,
}) => {
  const requests: Request[] = [];
  page.on("request", (request) => requests.push(request));
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(await storedConsent(context)).toBeNull();
  expect(await context.cookies()).toEqual([]);
  const storage = await page.evaluate(() => [localStorage.length, sessionStorage.length]);
  expect(storage).toEqual([0, 0]);
  const unexpected = requests
    .filter((r) => !expected(r, `${BLOCKING}/`))
    .map((r) => `${r.resourceType()} ${r.method()} ${r.url()}`);
  expect(unexpected).toEqual([]);
  expect(requests.filter((r) => r.resourceType() === "script").length).toBeGreaterThan(0);
});

test("before a choice the required category is granted and the optional ones denied", async ({
  page,
}) => {
  await page.goto("/");
  await expect(banner(page)).toBeVisible();
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-consent-necessary", "granted");
  await expect(html).toHaveAttribute("data-consent-analytics", "denied");
  await expect(html).toHaveAttribute("data-consent-marketing", "denied");
  const state = JSON.parse((await page.locator("#consent-state").textContent()) ?? "null");
  expect(state).toMatchObject({
    categories: { necessary: true, analytics: false, marketing: false },
    at: null,
  });
});
