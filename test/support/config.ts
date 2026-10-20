import type { ConsentConfig, LocaleStrings } from "../../src/astro/index.js";

const strings: LocaleStrings = {
  title: "Cookies",
  description: "We use cookies.",
  acceptAll: "Accept all",
  rejectAll: "Reject all",
  settings: "Settings",
  save: "Save",
  close: "Close",
  alwaysActive: "Always active",
  settingsTitle: "Cookie settings",
  categories: {
    necessary: { name: "Necessary", description: "Required for the site to work." },
    analytics: { name: "Analytics", description: "Helps us improve the site." },
    marketing: { name: "Marketing", description: "Personalised offers." },
  },
};

/** One required and two optional categories, locales `en` and `sv`. */
export function testConfig(patch: Partial<ConsentConfig> = {}): ConsentConfig {
  return {
    schemaVersion: 1,
    policyVersion: "2026-10",
    defaultLocale: "en",
    categories: [{ id: "necessary", required: true }, { id: "analytics" }, { id: "marketing" }],
    locales: { en: strings, sv: strings },
    ...patch,
  };
}

/** Removes every cookie visible to the test document. */
export function clearCookies(doc: Document = document): void {
  for (const pair of doc.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (name) doc.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}
