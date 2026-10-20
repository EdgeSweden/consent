// Shared e2e setup: every test fails on a CSP violation (plan: Tests, "Zero CSP violations") and
// gets helpers for the banner, the settings dialog and the consent cookie.
import AxeBuilder from "@axe-core/playwright";
import { expect, test as base, type BrowserContext, type Page } from "@playwright/test";
import { consentStrings, pageStrings } from "../../examples/astro/src/strings.js";

export { expect };
export const BLOCKING = "http://localhost:4391";
export const NON_BLOCKING = "http://localhost:4392";
export const en = consentStrings.en;
export const sv = consentStrings.sv;
export const pages = pageStrings;

export interface StoredConsent {
  v: number;
  p: string;
  t: number;
  c: Record<string, boolean>;
}

declare global {
  interface Window {
    cspViolations: string[];
  }
}

export const test = base.extend<{ cspViolations: string[] }>({
  cspViolations: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on("console", (message) => {
        if (/Content.Security.Policy/i.test(message.text())) violations.push(message.text());
      });
      await page.addInitScript(() => {
        window.cspViolations = [];
        document.addEventListener("securitypolicyviolation", (event) => {
          window.cspViolations.push(`${event.violatedDirective} ${event.blockedURI}`);
        });
      });
      await use(violations);
      if (!page.isClosed()) {
        violations.push(...(await page.evaluate(() => window.cspViolations).catch(() => [])));
      }
      expect(violations).toEqual([]);
    },
    { auto: true },
  ],
});

export const banner = (page: Page, s = en) => page.getByRole("dialog", { name: s.title });
export const settings = (page: Page, s = en) => page.getByRole("dialog", { name: s.settingsTitle });

export async function storedConsent(context: BrowserContext): Promise<StoredConsent | null> {
  const cookie = (await context.cookies()).find((c) => c.name === "consent");
  return cookie ? (JSON.parse(decodeURIComponent(cookie.value)) as StoredConsent) : null;
}

/** The `action` of every record the demo's record function has listed, in order. */
export async function recordedActions(page: Page): Promise<string[]> {
  return page
    .locator("#consent-records li")
    .evaluateAll((items) => items.map((li) => (li as HTMLElement).dataset["action"] ?? ""));
}

export async function axe(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
}
