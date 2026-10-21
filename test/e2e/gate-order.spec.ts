// Plan: Script gating; decision #44. A real browser on a page of its own, so script execution order
// and the nonce rule are observed rather than simulated. Serves the built `dist` (check:build runs
// first in CI); the core is reached through an import map, as a bundler would resolve it.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const ORIGIN = "https://example.com";
const NONCE = "gate0rder";

const config = {
  schemaVersion: 1,
  policyVersion: "1",
  defaultLocale: "en",
  categories: [{ id: "necessary", required: true }, { id: "analytics" }],
  locales: {
    en: {
      title: "Cookies",
      description: "Choose.",
      acceptAll: "Accept all",
      rejectAll: "Reject all",
      settings: "Settings",
      save: "Save",
      close: "Close",
      alwaysActive: "Always active",
      settingsTitle: "Settings",
      categories: {
        necessary: { name: "Necessary", description: "Needed." },
        analytics: { name: "Analytics", description: "Measures." },
      },
    },
  },
};

const page_ = (body: string[]) => `<!doctype html>
<html lang="en">
  <head>
    <title>Gate order</title>
    <script nonce="${NONCE}">window.order = [];</script>
    <script type="importmap" nonce="${NONCE}">{"imports":{"@edgesweden/consent":"/index.js"}}</script>
  </head>
  <body>
    ${body.join("\n    ")}
    <script type="module" nonce="${NONCE}">
      import { mount } from "@edgesweden/consent";
      import { installScriptGating } from "/gate.js";
      const config = ${JSON.stringify(config)};
      installScriptGating(config);
      mount(config);
    </script>
  </body>
</html>`;

const inline = (category: string, label: string, nonce = true) =>
  `<script type="text/plain" data-consent="${category}"${nonce ? ` nonce="${NONCE}"` : ""}>window.order.push("${label}");</script>`;

function dist(file: string): string {
  try {
    return readFileSync(`dist/${file}`, "utf8");
  } catch {
    throw new Error(`dist/${file} is missing; run pnpm build first.`);
  }
}

async function serve(page: Page, html: string, delay = 300): Promise<void> {
  const js = { contentType: "text/javascript" };
  await page.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/") {
      await route.fulfill({
        contentType: "text/html",
        headers: { "Content-Security-Policy": `script-src 'self' 'nonce-${NONCE}'` },
        body: html,
      });
    } else if (url.pathname === "/index.js" || url.pathname === "/gate.js") {
      await route.fulfill({ ...js, body: dist(url.pathname.slice(1)) });
    } else if (url.pathname === "/slow.js") {
      // Slower than the inline script after it would take to run if it were not held.
      await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({ ...js, body: `window.order.push("external ${url.search.slice(1)}");` });
    } else {
      await route.fulfill({ status: 404 });
    }
  });
}

const order = (page: Page) => page.evaluate(() => (window as unknown as { order: string[] }).order);

test("activated scripts run in document order, each once, and need the page's nonce", async ({
  page,
}) => {
  await serve(
    page,
    page_([
      '<script type="text/plain" data-consent="necessary" src="/slow.js?necessary"></script>',
      inline("necessary", "inline necessary"),
      '<script type="text/plain" data-consent="analytics" src="/slow.js?analytics"></script>',
      inline("analytics", "inline analytics"),
      inline("analytics", "no nonce", false),
    ]),
  );
  await page.goto(`${ORIGIN}/`);

  await expect.poll(() => order(page)).toEqual(["external necessary", "inline necessary"]);

  await page.getByRole("button", { name: "Accept all" }).click();
  await expect
    .poll(() => order(page))
    .toEqual(["external necessary", "inline necessary", "external analytics", "inline analytics"]);

  // Nothing else is pending; a later change runs nothing twice.
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const core = await import("@edgesweden/consent" as string);
    core.withdraw();
  });
  expect(await order(page)).toHaveLength(4);
});

test("a script granted while an earlier one loads runs before a later waiting one", async ({
  page,
}) => {
  await serve(
    page,
    page_([
      '<script type="text/plain" data-consent="necessary" src="/slow.js?necessary"></script>',
      inline("analytics", "inline analytics"),
      inline("necessary", "inline necessary"),
    ]),
    1500,
  );
  // The slow script delays the load event; choose while it is still loading.
  await page.goto(`${ORIGIN}/`, { waitUntil: "commit" });
  await page.getByRole("button", { name: "Accept all" }).click();
  expect(await order(page)).toEqual([]);
  await expect
    .poll(() => order(page))
    .toEqual(["external necessary", "inline analytics", "inline necessary"]);
});

test("a gated script of a type the browser does not run holds nothing", async ({ page }) => {
  await serve(
    page,
    page_([
      '<script type="text/plain" data-consent="necessary" data-consent-type="text/typescript" src="/slow.js?typescript"></script>',
      inline("necessary", "inline necessary"),
    ]),
  );
  await page.goto(`${ORIGIN}/`);
  await expect.poll(() => order(page), { timeout: 2000 }).toEqual(["inline necessary"]);
});
