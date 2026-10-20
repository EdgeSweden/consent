import { afterEach, describe, expect, it } from "vitest";
import type { LocaleStrings } from "../src/astro/index.js";
import { resolveLocale } from "../src/core/locale.js";
import { testConfig } from "./support/config.js";

// Plan: Locale resolution. config.locale → <html lang> → lang without region → defaultLocale.

afterEach(() => {
  document.documentElement.lang = "";
});

describe("locale resolution", () => {
  it("prefers config.locale over <html lang>", () => {
    document.documentElement.lang = "en";
    expect(resolveLocale(testConfig({ locale: "sv" }), document)).toBe("sv");
  });

  it("uses <html lang> when it matches a locale", () => {
    document.documentElement.lang = "sv";
    expect(resolveLocale(testConfig(), document)).toBe("sv");
  });

  it("drops the region when the full tag matches nothing", () => {
    document.documentElement.lang = "sv-SE";
    expect(resolveLocale(testConfig(), document)).toBe("sv");
  });

  it("prefers an exact regional match", () => {
    document.documentElement.lang = "sv-FI";
    const base = testConfig();
    const config = testConfig({
      locales: { ...base.locales, "sv-FI": base.locales["en"] as LocaleStrings },
    });
    expect(resolveLocale(config, document)).toBe("sv-FI");
  });

  it("matches case-insensitively and reports the config's spelling", () => {
    document.documentElement.lang = "SV-se";
    expect(resolveLocale(testConfig(), document)).toBe("sv");
  });

  it("falls back to defaultLocale when nothing matches", () => {
    document.documentElement.lang = "de-DE";
    expect(resolveLocale(testConfig(), document)).toBe("en");
  });

  it("falls back to defaultLocale when <html lang> is empty", () => {
    expect(resolveLocale(testConfig(), document)).toBe("en");
  });

  it("falls back through the region when config.locale is unknown", () => {
    document.documentElement.lang = "sv";
    expect(resolveLocale(testConfig({ locale: "de-AT" }), document)).toBe("en");
    expect(resolveLocale(testConfig({ locale: "sv-AX" }), document)).toBe("sv");
  });
});
