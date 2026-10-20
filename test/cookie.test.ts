import { afterEach, describe, expect, it } from "vitest";
import {
  decodeChoice,
  encodeChoice,
  readChoice,
  serializeCookie,
  writeChoice,
  type StoredChoice,
} from "../src/core/cookie.js";
import { clearCookies, testConfig } from "./support/config.js";

// Plan: Cookie; decision #15.

const choice: StoredChoice = {
  p: "2026-10",
  t: 1_790_000_000,
  c: { necessary: true, analytics: false, marketing: true },
};

const encode = (value: unknown) => encodeURIComponent(JSON.stringify(value));

afterEach(() => clearCookies());

describe("cookie codec", () => {
  it("encodes URL-encoded JSON in the plan's shape", () => {
    expect(JSON.parse(decodeURIComponent(encodeChoice(choice)))).toEqual({ v: 1, ...choice });
    expect(encodeChoice(choice)).not.toMatch(/[;,\s"]/);
  });

  it("round-trips", () => {
    expect(decodeChoice(encodeChoice(choice))).toEqual(choice);
  });

  it.each([
    ["not URL-encoded", "%E0%A4%A"],
    ["not JSON", "hello"],
    ["JSON null", encode(null)],
    ["an array", encode([1])],
    ["wrong version", encode({ v: 2, p: "x", t: 1, c: {} })],
    ["missing version", encode({ p: "x", t: 1, c: {} })],
    ["non-string policy", encode({ v: 1, p: 1, t: 1, c: {} })],
    ["non-number time", encode({ v: 1, p: "x", t: "1", c: {} })],
    ["missing categories", encode({ v: 1, p: "x", t: 1 })],
    ["array categories", encode({ v: 1, p: "x", t: 1, c: [] })],
    ["non-boolean category", encode({ v: 1, p: "x", t: 1, c: { a: 1 } })],
  ])("treats %s as absent", (_, value) => {
    expect(decodeChoice(value)).toBeNull();
  });

  it("reads the first cookie with the configured name and ignores foreign cookies", () => {
    document.cookie = "other=1; Path=/";
    document.cookie = "consentx=junk; Path=/";
    document.cookie = `consent=${encodeChoice(choice)}; Path=/`;
    expect(readChoice(document, "consent")).toEqual(choice);
    expect(readChoice(document, "missing")).toBeNull();
  });

  it("takes the first match when two cookies share the name", () => {
    const doc = { cookie: `consent=${encodeChoice(choice)}; consent=junk` } as Document;
    expect(readChoice(doc, "consent")).toEqual(choice);
    const junkFirst = { cookie: `consent=junk; consent=${encodeChoice(choice)}` } as Document;
    expect(readChoice(junkFirst, "consent")).toBeNull();
  });
});

describe("cookie attributes", () => {
  it("uses the defaults: name consent, 365 days, Path=/, host-only, Lax", () => {
    expect(serializeCookie(testConfig(), choice, false)).toBe(
      `consent=${encodeChoice(choice)}; Max-Age=31536000; Path=/; SameSite=Lax`,
    );
  });

  it("propagates name, max age, path and domain", () => {
    const config = testConfig({
      cookie: { name: "site_consent", maxAgeDays: 30, path: "/app", domain: "example.com" },
    });
    expect(serializeCookie(config, choice, false)).toBe(
      `site_consent=${encodeChoice(choice)}; Max-Age=2592000; Path=/app; Domain=example.com; SameSite=Lax`,
    );
  });

  it("adds Secure only when served over https", () => {
    expect(serializeCookie(testConfig(), choice, true)).toMatch(/; Secure$/);
    expect(serializeCookie(testConfig(), choice, false)).not.toContain("Secure");

    const written: string[] = [];
    const fake = (protocol: string) =>
      ({
        location: { protocol },
        set cookie(value: string) {
          written.push(value);
        },
      }) as unknown as Document;
    writeChoice(fake("https:"), testConfig(), choice);
    writeChoice(fake("http:"), testConfig(), choice);
    expect(written[0]).toMatch(/; Secure$/);
    expect(written[1]).not.toContain("Secure");
  });

  it("writes a cookie the reader accepts", () => {
    writeChoice(document, testConfig(), choice);
    expect(readChoice(document, "consent")).toEqual(choice);
  });
});
