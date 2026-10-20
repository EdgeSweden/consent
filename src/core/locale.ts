// Plan: Locale resolution. config.locale → <html lang> → lang without region → defaultLocale.

import type { ConsentConfig } from "../astro/schema.js";

export function resolveLocale(config: ConsentConfig, doc: Document): string {
  const keys = Object.keys(config.locales);
  // BCP 47 tags are case-insensitive; the config's own spelling is what is reported.
  const find = (tag: string) => keys.find((key) => key.toLowerCase() === tag.toLowerCase());
  const requested = config.locale ?? doc.documentElement.lang;
  if (requested) {
    const match = find(requested) ?? find(requested.split("-")[0] ?? "");
    if (match !== undefined) return match;
  }
  return config.defaultLocale;
}
