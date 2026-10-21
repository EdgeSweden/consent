import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsentConfig } from "../src/astro/index.js";
import { encodeChoice } from "../src/core/cookie.js";
import { clearCookies, testConfig } from "./support/config.js";

// Plan: Google Consent Mode v2, Principles 1; decisions #48–#50.

type State = typeof import("../src/core/state.js");
type Gtag = typeof import("../src/gtag/index.js");
type Host = Window & { dataLayer?: unknown[] };

let core: State;
let gtag: Gtag;
const host = window as Host;

beforeEach(async () => {
  vi.resetModules();
  core = await import("../src/core/state.js");
  gtag = await import("../src/gtag/index.js");
});

afterEach(() => {
  clearCookies();
  delete host.dataLayer;
  document.body.replaceChildren();
  for (const name of document.documentElement.getAttributeNames()) {
    if (name.startsWith("data-consent-")) document.documentElement.removeAttribute(name);
  }
});

const consentMode: ConsentConfig["consentMode"] = {
  mapping: {
    necessary: ["security_storage"],
    analytics: ["analytics_storage"],
    marketing: ["ad_storage", "ad_user_data", "ad_personalization"],
  },
  extra: { functionality_storage: "granted", personalization_storage: "denied" },
};

const config = (patch: Partial<ConsentConfig> = {}) => testConfig({ consentMode, ...patch });

/** The `dataLayer` entries as plain arrays. */
const commands = () =>
  (host.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
const updates = () => commands().filter((c) => c[1] === "update");

function start(c: ConsentConfig = config()): () => void {
  const dispose = gtag.installConsentMode(c);
  core.mount(c, document);
  return dispose;
}

const DEFAULT = {
  security_storage: "granted",
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  functionality_storage: "granted",
  personalization_storage: "denied",
};

describe("consent mode", () => {
  it("pushes only the default before a choice, with every optional key denied", () => {
    start();
    expect(core.getConsent()?.at).toBeNull();
    expect(commands()).toEqual([["consent", "default", DEFAULT]]);
  });

  it("grants a required category's keys in the default, before any choice", () => {
    start();
    const [, , values] = commands()[0] as [string, string, Record<string, string>];
    expect(values["security_storage"]).toBe("granted");
  });

  it("pushes Arguments objects, which gtag.js requires", () => {
    start();
    expect(Object.prototype.toString.call(host.dataLayer?.[0])).toBe("[object Arguments]");
  });

  it("keeps an existing dataLayer and its entries", () => {
    const existing: unknown[] = [{ event: "page" }];
    host.dataLayer = existing;
    start();
    expect(host.dataLayer).toBe(existing);
    expect(existing).toHaveLength(2);
  });

  it("updates every mapped key on each change, never the extra keys", () => {
    start();
    core.choose({ analytics: true });
    core.acceptAll();
    core.withdraw();
    const mapped = (analytics: string, ads: string) => ({
      security_storage: "granted",
      analytics_storage: analytics,
      ad_storage: ads,
      ad_user_data: ads,
      ad_personalization: ads,
    });
    expect(updates()).toEqual([
      ["consent", "update", mapped("granted", "denied")],
      ["consent", "update", mapped("granted", "granted")],
      ["consent", "update", mapped("denied", "denied")],
    ]);
  });

  it("pushes no update when the mapped values do not change", () => {
    start(config({ consentMode: { mapping: { analytics: ["analytics_storage"] } } }));
    core.rejectAll();
    core.choose({ marketing: true });
    expect(updates()).toEqual([]);
  });

  it("updates at mount from a valid stored choice", () => {
    document.cookie = `consent=${encodeChoice({
      p: "2026-10",
      t: 1,
      c: { necessary: true, analytics: true, marketing: false },
    })}; Path=/`;
    start();
    expect(commands().map((c) => c[1])).toEqual(["default", "update"]);
    expect(updates()[0]?.[2]).toMatchObject({ analytics_storage: "granted", ad_storage: "denied" });
  });

  it("works when installed after mount", () => {
    core.mount(config(), document);
    gtag.installConsentMode(config());
    core.acceptAll();
    expect(commands().map((c) => c[1])).toEqual(["default", "update"]);
  });

  it("does nothing without consentMode", () => {
    gtag.installConsentMode(testConfig());
    core.mount(testConfig(), document);
    core.acceptAll();
    expect(host.dataLayer).toBeUndefined();
  });

  it("pushes the default once per window", () => {
    start();
    gtag.installConsentMode(config());
    core.acceptAll();
    expect(commands().map((c) => c[1])).toEqual(["default", "update"]);
  });

  it("stops updating once disposed", () => {
    const dispose = start();
    dispose();
    core.acceptAll();
    expect(updates()).toEqual([]);
  });
});
