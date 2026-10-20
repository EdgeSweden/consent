import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pkg from "../package.json" with { type: "json" };
import type { ConsentConfig } from "../src/astro/index.js";
import { encodeChoice } from "../src/core/cookie.js";
import type { ConsentRecord } from "../src/core/types.js";
import { clearCookies, testConfig } from "./support/config.js";

// Plan: Record, Action semantics, Principles 1; decision #33.

type Entry = typeof import("../src/index.js");
type State = typeof import("../src/core/state.js");

const NOW = 1_790_000_000;
let core: State;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
  core = await import("../src/core/state.js");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "sendBeacon");
  clearCookies();
  document.body.replaceChildren();
});

function store(c: Record<string, boolean>): void {
  document.cookie = `consent=${encodeChoice({ p: "2026-10", t: NOW - 100, c })}; Path=/`;
}

function mounted(record: ConsentConfig["record"], patch: Partial<ConsentConfig> = {}): State {
  core.mount(testConfig({ record, locale: "sv", ...patch }), document);
  return core;
}

function beacon(impl: (url: string, body: string) => boolean = () => true) {
  const fn = vi.fn(impl);
  Object.defineProperty(navigator, "sendBeacon", { value: fn, configurable: true });
  return fn;
}

const stubFetch = (impl: () => Promise<Response> = () => Promise.resolve(new Response())) => {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
};

const expected = (
  action: ConsentRecord["action"],
  analytics: boolean,
  marketing: boolean,
): ConsentRecord => ({
  action,
  categories: { necessary: true, analytics, marketing },
  policyVersion: "2026-10",
  packageVersion: pkg.version,
  locale: "sv",
  at: NOW,
});

describe("function recorder", () => {
  it.each<[string, (s: State) => unknown, ConsentRecord]>([
    ["acceptAll", (s) => s.acceptAll(), expected("accept_all", true, true)],
    ["rejectAll", (s) => s.rejectAll(), expected("reject_all", false, false)],
    ["a mix", (s) => s.choose({ analytics: true }), expected("custom", true, false)],
    ["untouched Save on a first visit", (s) => s.choose({}), expected("reject_all", false, false)],
    ["withdraw() on a first visit", (s) => s.withdraw(), expected("reject_all", false, false)],
  ])("records %s with the full payload", (_, act, record) => {
    const recorder = vi.fn();
    act(mounted(recorder));
    expect(recorder).toHaveBeenCalledTimes(1);
    expect(recorder).toHaveBeenCalledWith(record);
  });

  it("records withdraw() after a grant as withdraw", () => {
    store({ necessary: true, analytics: true, marketing: false });
    const recorder = vi.fn();
    mounted(recorder).withdraw();
    expect(recorder).toHaveBeenCalledWith(expected("withdraw", false, false));
  });

  it("records nothing on an identical Save", () => {
    store({ necessary: true, analytics: true, marketing: false });
    const recorder = vi.fn();
    mounted(recorder).choose({ analytics: true });
    expect(recorder).not.toHaveBeenCalled();
  });

  it("records nothing on withdraw() with nothing granted", () => {
    store({ necessary: true, analytics: false, marketing: false });
    const recorder = vi.fn();
    mounted(recorder).withdraw();
    expect(recorder).not.toHaveBeenCalled();
  });

  it("is called after the cookie, the event and the subscribers", () => {
    const order: string[] = [];
    const recorder = vi.fn(() => {
      order.push(document.cookie.includes("consent=") ? "record after cookie" : "record");
    });
    const s = mounted(recorder);
    s.onConsent((state) => {
      if (state.at !== null) order.push("subscriber");
    });
    document.addEventListener("consent:change", () => order.push("event"), { once: true });
    s.acceptAll();
    expect(order).toEqual(["event", "subscriber", "record after cookie"]);
  });

  it("records nested changes in the order they were made", () => {
    const recorder = vi.fn();
    const s = mounted(recorder);
    let nested = false;
    s.onConsent((state) => {
      if (state.categories["analytics"] === true && !nested) {
        nested = true;
        s.withdraw();
      }
    });
    s.acceptAll();
    expect(recorder.mock.calls.map(([r]) => r.action)).toEqual(["accept_all", "withdraw"]);
  });

  it("gets its own copy of the categories", () => {
    const s = mounted((r) => {
      r.categories["analytics"] = false;
    });
    s.acceptAll();
    expect(s.getConsent()?.categories["analytics"]).toBe(true);
  });

  it("swallows a throwing recorder without undoing the choice", () => {
    const seen: boolean[] = [];
    const s = mounted(() => {
      throw new Error("recorder failed");
    });
    s.onConsent((state) => seen.push(state.categories["analytics"] === true));
    expect(() => s.acceptAll()).not.toThrow();
    expect(s.getConsent()?.categories["analytics"]).toBe(true);
    expect(seen).toEqual([false, true]);
    expect(s.needsChoice()).toBe(false);
  });

  it("swallows a rejected promise", async () => {
    const recorder = vi.fn(() => Promise.reject(new Error("offline")));
    mounted(recorder).acceptAll();
    // An unhandled rejection would fail the run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(recorder).toHaveBeenCalledTimes(1);
  });
});

describe("URL recorder", () => {
  it("posts the bare object as a JSON string through sendBeacon", () => {
    const send = beacon();
    const fetch = stubFetch();
    mounted("/consent-log").acceptAll();
    expect(send).toHaveBeenCalledTimes(1);
    const [url, body] = send.mock.calls[0] ?? [];
    expect(url).toBe("/consent-log");
    expect(typeof body).toBe("string");
    expect(JSON.parse(body ?? "")).toEqual(expected("accept_all", true, true));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("carries no identifier, user agent or page in the payload", () => {
    const send = beacon();
    mounted("https://example.com/consent").rejectAll();
    const body = JSON.parse(send.mock.calls[0]?.[1] ?? "") as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["action", "at", "categories", "locale", "packageVersion", "policyVersion"].sort(),
    );
  });

  it.each<[string, () => void]>([
    [
      "sendBeacon is missing",
      () =>
        Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true }),
    ],
    ["sendBeacon refuses the payload", () => void beacon(() => false)],
    [
      "sendBeacon throws",
      () =>
        void beacon(() => {
          throw new TypeError("blocked");
        }),
    ],
  ])("falls back to a keepalive fetch when %s", (_, setup) => {
    setup();
    const fetch = stubFetch();
    mounted("https://example.com/consent").choose({ marketing: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch.mock.calls[0] ?? []) as unknown as [string, RequestInit];
    expect(url).toBe("https://example.com/consent");
    expect(init).toEqual({ method: "POST", keepalive: true, body: expect.any(String) });
    expect(JSON.parse(init.body as string)).toEqual(expected("custom", false, true));
  });

  it("swallows a rejected fetch", async () => {
    beacon(() => false);
    const fetch = stubFetch(() => Promise.reject(new TypeError("offline")));
    mounted("/consent-log").acceptAll();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("swallows a missing transport", () => {
    beacon(() => false);
    vi.stubGlobal("fetch", undefined);
    expect(() => mounted("/consent-log").acceptAll()).not.toThrow();
  });

  it.each(["javascript:alert(1)", "//example.org/log", "/\\example.org", "consent-log"])(
    "sends nothing to %s, which validation would reject",
    (url) => {
      const send = beacon();
      const fetch = stubFetch();
      mounted(url).acceptAll();
      expect(send).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("sends nothing on a no-op", () => {
    store({ necessary: true, analytics: false, marketing: false });
    const send = beacon();
    mounted("/consent-log").withdraw();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("nothing optional before a choice", () => {
  it("mount with a recorder configured records and sends nothing", () => {
    const send = beacon();
    const fetch = stubFetch();
    const recorder = vi.fn();
    mounted(recorder).getConsent();
    expect(recorder).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("mount with a URL configured sends nothing", () => {
    const send = beacon();
    const fetch = stubFetch();
    mounted("/consent-log");
    expect(send).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("public entry", () => {
  it("exports mount and openSettings with the state API (decision #26)", async () => {
    const entry = await import("../src/index.js");
    expect(Object.keys(entry).sort()).toEqual([
      "getConsent",
      "mount",
      "onConsent",
      "openSettings",
      "withdraw",
    ]);
  });

  it("records a banner click through the public mount", async () => {
    const entry: Entry = await import("../src/index.js");
    const recorder = vi.fn();
    entry.mount(testConfig({ record: recorder, locale: "sv" }));
    document.querySelector<HTMLButtonElement>(".consent-accept")?.click();
    expect(recorder).toHaveBeenCalledWith(expected("accept_all", true, true));
  });
});
