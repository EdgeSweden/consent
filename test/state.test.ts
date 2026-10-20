import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsentConfig } from "../src/astro/index.js";
import { encodeChoice, readChoice } from "../src/core/cookie.js";
import type { ConsentState } from "../src/core/types.js";
import { clearCookies, testConfig } from "./support/config.js";

// Plan: Mount, Required categories, Cookie, Action semantics, State API; decisions #15–#18.

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
  clearCookies();
  for (const name of document.documentElement.getAttributeNames()) {
    if (name.startsWith("data-consent-")) document.documentElement.removeAttribute(name);
  }
});

function store(c: Record<string, boolean>, p = "2026-10", t = NOW - 100): void {
  document.cookie = `consent=${encodeChoice({ p, t, c })}; Path=/`;
}

const stored = () => readChoice(document, "consent");
const cookieWrites = () => vi.spyOn(document, "cookie", "set");

function mounted(config: ConsentConfig = testConfig()): State {
  core.mount(config, document);
  return core;
}

describe("re-prompt matrix", () => {
  const optionalDenied = { necessary: true, analytics: false, marketing: false };

  it.each<[string, () => void]>([
    ["no cookie", () => {}],
    [
      "a changed policyVersion",
      () => store({ necessary: true, analytics: true, marketing: true }, "2026-01"),
    ],
    ["an added category", () => store({ necessary: true, analytics: true })],
    [
      "a removed category",
      () => store({ necessary: true, analytics: true, marketing: true, social: true }),
    ],
    ["a renamed category", () => store({ necessary: true, analytics: true, social: true })],
    ["an unparseable cookie", () => (document.cookie = "consent=%7Bnope; Path=/")],
  ])("prompts on %s and reports every optional category denied", (_, setup) => {
    setup();
    const { needsChoice, getConsent } = mounted();
    expect(needsChoice()).toBe(true);
    expect(getConsent()).toEqual({
      categories: optionalDenied,
      policyVersion: "2026-10",
      locale: "en",
      at: null,
    });
  });

  it("does not prompt on a valid cookie and reports the stored state", () => {
    store({ necessary: true, analytics: true, marketing: false });
    const { needsChoice, getConsent } = mounted();
    expect(needsChoice()).toBe(false);
    expect(getConsent()).toEqual({
      categories: { necessary: true, analytics: true, marketing: false },
      policyVersion: "2026-10",
      locale: "en",
      at: NOW - 100,
    });
  });

  it("reads the configured cookie name", () => {
    document.cookie = `site_consent=${encodeChoice({ p: "2026-10", t: 1, c: { necessary: true, analytics: true, marketing: true } })}; Path=/`;
    const { needsChoice } = mounted(testConfig({ cookie: { name: "site_consent" } }));
    expect(needsChoice()).toBe(false);
  });
});

describe("required categories", () => {
  it("are granted before any choice", () => {
    expect(mounted().getConsent()?.categories["necessary"]).toBe(true);
  });

  it("are granted after Reject all and stored as true", () => {
    const { rejectAll, getConsent } = mounted();
    rejectAll();
    expect(getConsent()?.categories["necessary"]).toBe(true);
    expect(stored()?.c["necessary"]).toBe(true);
  });

  it("are granted after withdraw()", () => {
    store({ necessary: true, analytics: true, marketing: true });
    const { withdraw, getConsent } = mounted();
    withdraw();
    expect(getConsent()?.categories).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
    expect(stored()?.c["necessary"]).toBe(true);
  });

  it("are granted on a stale cookie that stored them as false", () => {
    store({ necessary: false, analytics: true, marketing: true }, "2026-01");
    expect(mounted().getConsent()?.categories["necessary"]).toBe(true);
  });

  it("are granted, and the cookie stays valid, when a current cookie stored them as false", () => {
    store({ necessary: false, analytics: true, marketing: false });
    const { needsChoice, getConsent } = mounted();
    expect(needsChoice()).toBe(false);
    expect(getConsent()?.categories).toEqual({
      necessary: true,
      analytics: true,
      marketing: false,
    });
  });

  it("are not changed by a choice that names them", () => {
    const { choose, getConsent } = mounted();
    choose({ necessary: false, analytics: true });
    expect(getConsent()?.categories["necessary"]).toBe(true);
  });
});

describe("action semantics", () => {
  const all = { analytics: true, marketing: true };
  const none = { analytics: false, marketing: false };
  const some = { analytics: true, marketing: false };
  const full = (optional: Record<string, boolean>) => ({ necessary: true, ...optional });

  describe("with no valid stored choice, every choice is written and recorded", () => {
    it.each<[string, (s: State) => ReturnType<State["choose"]>, string, Record<string, boolean>]>([
      ["Accept all", (s) => s.acceptAll(), "accept_all", all],
      ["Reject all", (s) => s.rejectAll(), "reject_all", none],
      ["Save with untouched switches", (s) => s.choose({}), "reject_all", none],
      ["Save with every switch on", (s) => s.choose(all), "accept_all", all],
      ["Save with a mix", (s) => s.choose(some), "custom", some],
      ["withdraw()", (s) => (s.withdraw(), null), "", none],
    ])("first visit: %s", (_, act, action, optional) => {
      const s = mounted();
      const result = act(s);
      if (action) expect(result?.action).toBe(action);
      expect(stored()).toEqual({ p: "2026-10", t: NOW, c: full(optional) });
      expect(s.getConsent()).toMatchObject({ categories: full(optional), at: NOW });
      expect(s.needsChoice()).toBe(false);
    });

    it("stale policy with a prior grant: all off is reject_all, not withdraw", () => {
      store(full(all), "2026-01");
      expect(mounted().choose(none)?.action).toBe("reject_all");
      expect(stored()?.p).toBe("2026-10");
    });

    it("changed category set with a prior grant: all off is reject_all", () => {
      store({ necessary: true, analytics: true });
      expect(mounted().choose(none)?.action).toBe("reject_all");
    });
  });

  describe("with a valid stored choice", () => {
    it.each<[string, Record<string, boolean>, Record<string, boolean>, string]>([
      ["accepted → reopen → all off → Save", all, none, "withdraw"],
      ["custom → all off", some, none, "withdraw"],
      ["rejected → Accept all", none, all, "accept_all"],
      ["rejected → mix", none, some, "custom"],
      ["accepted → mix", all, some, "custom"],
      ["custom → Accept all", some, all, "accept_all"],
      ["custom → other mix", some, { analytics: false, marketing: true }, "custom"],
    ])("%s is %s", (_, before, after, action) => {
      store(full(before));
      const s = mounted();
      expect(s.choose(after)?.action).toBe(action);
      expect(stored()).toEqual({ p: "2026-10", t: NOW, c: full(after) });
    });

    it.each<[string, Record<string, boolean>, (s: State) => unknown]>([
      ["Accept all when accepted", all, (s) => s.acceptAll()],
      ["Reject all when rejected", none, (s) => s.rejectAll()],
      ["Save unchanged switches", some, (s) => s.choose(some)],
      ["withdraw() with nothing granted", none, (s) => s.withdraw()],
    ])("no-op: %s writes and dispatches nothing", (_, before, act) => {
      store(full(before));
      const s = mounted();
      const writes = cookieWrites();
      const events = vi.fn();
      document.addEventListener("consent:change", events);
      const subscriber = vi.fn();
      s.onConsent(subscriber);
      subscriber.mockClear();

      expect(act(s) ?? null).toBeNull();
      expect(writes).not.toHaveBeenCalled();
      expect(events).not.toHaveBeenCalled();
      expect(subscriber).not.toHaveBeenCalled();
      expect(s.getConsent()?.at).toBe(NOW - 100);
      document.removeEventListener("consent:change", events);
    });

    it("withdraw() with a prior grant denies every optional category", () => {
      store(full(some));
      const s = mounted();
      s.withdraw();
      expect(stored()?.c).toEqual(full(none));
    });

    it("a choice after a choice compares against the new choice", () => {
      const s = mounted();
      expect(s.acceptAll()?.action).toBe("accept_all");
      expect(s.acceptAll()).toBeNull();
      expect(s.rejectAll()?.action).toBe("withdraw");
      expect(s.rejectAll()).toBeNull();
    });
  });
});

describe("nothing optional before a choice", () => {
  it("mount makes no cookie write, storage access or request", () => {
    const writes = cookieWrites();
    const local = vi.spyOn(window, "localStorage", "get");
    const session = vi.spyOn(window, "sessionStorage", "get");
    const fetch = vi.spyOn(globalThis, "fetch");
    const beacon = vi.fn();
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });

    const s = mounted();
    s.onConsent(() => {});
    s.getConsent();

    expect(writes).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled();
    expect(session).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });
});

describe("before mount", () => {
  it("getConsent() is null", () => {
    expect(core.getConsent()).toBeNull();
  });

  it("withdraw() and choices are no-ops", () => {
    const writes = cookieWrites();
    core.withdraw();
    expect(core.acceptAll()).toBeNull();
    expect(writes).not.toHaveBeenCalled();
    expect(core.getConsent()).toBeNull();
  });
});

describe("mount", () => {
  it("is idempotent, also on a different document", () => {
    const s = mounted();
    s.acceptAll();
    const other = document.implementation.createHTMLDocument("other");
    s.mount(testConfig({ policyVersion: "2027-01" }), other);
    s.mount(testConfig(), document);
    expect(s.getConsent()).toMatchObject({ policyVersion: "2026-10", at: NOW });
    expect(other.documentElement.hasAttribute("data-consent-analytics")).toBe(false);
  });

  it("reports the resolved locale", () => {
    document.documentElement.lang = "sv-SE";
    expect(mounted().getConsent()?.locale).toBe("sv");
    document.documentElement.lang = "";
  });

  it("returns copies, so a consumer cannot mutate the state", () => {
    const s = mounted();
    const state = s.getConsent();
    if (state) state.categories["analytics"] = true;
    s.onConsent((received) => (received.categories["marketing"] = true));
    expect(s.getConsent()?.categories).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });
});

describe("onConsent", () => {
  it("calls a pre-mount subscriber once during mount, never from the cookie alone", () => {
    store({ necessary: true, analytics: true, marketing: true });
    const subscriber = vi.fn();
    core.onConsent(subscriber);
    expect(subscriber).not.toHaveBeenCalled();
    mounted();
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber.mock.calls[0]?.[0].categories["analytics"]).toBe(true);
  });

  it("calls a post-mount subscriber immediately with the current state", () => {
    const s = mounted();
    s.acceptAll();
    const subscriber = vi.fn();
    s.onConsent(subscriber);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber.mock.calls[0]?.[0]).toMatchObject({ at: NOW });
  });

  it("calls once per change", () => {
    const subscriber = vi.fn();
    core.onConsent(subscriber);
    const s = mounted();
    s.acceptAll();
    s.choose({ analytics: true });
    expect(subscriber.mock.calls.map(([state]) => (state as ConsentState).categories)).toEqual([
      { necessary: true, analytics: false, marketing: false },
      { necessary: true, analytics: true, marketing: true },
      { necessary: true, analytics: true, marketing: false },
    ]);
  });

  it("a second mount does not double-fire and does not block a new subscriber", () => {
    const early = vi.fn();
    core.onConsent(early);
    const s = mounted();
    s.mount(testConfig(), document);
    expect(early).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    s.onConsent(late);
    expect(late).toHaveBeenCalledTimes(1);
    expect(early).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes", () => {
    const subscriber = vi.fn();
    const off = core.onConsent(subscriber);
    const s = mounted();
    off();
    s.acceptAll();
    expect(subscriber).toHaveBeenCalledTimes(1);
  });

  it("does not call a subscriber unsubscribed by an earlier one in the same round", () => {
    const s = mounted();
    let offSecond = () => {};
    s.onConsent(() => offSecond());
    const second = vi.fn();
    offSecond = s.onConsent(second);
    second.mockClear();
    s.acceptAll();
    expect(second).not.toHaveBeenCalled();
  });

  it("a throwing subscriber does not stop the others or the stored choice", () => {
    const rethrown: VoidFunction[] = [];
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((task) => rethrown.push(task));
    const s = mounted();
    s.onConsent((state) => {
      if (state.at !== null) throw new Error("boom");
    });
    const after = vi.fn();
    s.onConsent(after);
    expect(s.acceptAll()?.action).toBe("accept_all");
    expect(after).toHaveBeenCalledTimes(2);
    expect(stored()?.c["analytics"]).toBe(true);
    // The error is reported asynchronously rather than swallowed.
    expect(rethrown).toHaveLength(1);
    expect(() => rethrown[0]?.()).toThrow("boom");
  });
});

describe("re-entrant changes", () => {
  const optional = (state: ConsentState) => [state.categories["analytics"], state.at];

  it("a pre-mount subscriber that withdraws does not reorder another subscriber's states", () => {
    store({ necessary: true, analytics: true, marketing: true });
    core.onConsent(() => core.withdraw());
    const seen: ConsentState[] = [];
    core.onConsent((state) => seen.push(state));
    mounted();
    expect(seen.map(optional)).toEqual([
      [true, NOW - 100],
      [false, NOW],
    ]);
    expect(core.getConsent()?.categories["analytics"]).toBe(false);
  });

  it("a consent:change listener that withdraws during acceptance keeps the acceptance intact", () => {
    const s = mounted();
    let once = true;
    const listener = () => {
      if (once) {
        once = false;
        s.withdraw();
      }
    };
    document.addEventListener("consent:change", listener);
    const seen: ConsentState[] = [];
    s.onConsent((state) => seen.push(state));
    const events: boolean[] = [];
    const eventLog = (event: Event) =>
      events.push((event as CustomEvent<ConsentState>).detail.categories["analytics"] === true);
    document.addEventListener("consent:change", eventLog);

    const transition = s.acceptAll();

    expect(transition?.action).toBe("accept_all");
    expect(transition?.state.categories).toEqual({
      necessary: true,
      analytics: true,
      marketing: true,
    });
    expect(seen.map((state) => state.categories["analytics"])).toEqual([false, true, false]);
    expect(events).toEqual([true, false]);
    expect(s.getConsent()?.categories["analytics"]).toBe(false);
    expect(stored()?.c["analytics"]).toBe(false);
    expect(document.documentElement.getAttribute("data-consent-analytics")).toBe("denied");
    document.removeEventListener("consent:change", listener);
    document.removeEventListener("consent:change", eventLog);
  });

  it("a subscriber added during a delivery gets the current state, then later changes", () => {
    const s = mounted();
    const late: ConsentState[] = [];
    let once = true;
    s.onConsent((state) => {
      if (state.at !== null && once) {
        once = false;
        s.onConsent((received) => late.push(received));
        expect(late).toHaveLength(1);
        s.withdraw();
      }
    });
    s.acceptAll();
    expect(late.map((state) => state.categories["analytics"])).toEqual([true, false]);
  });
  it("a subscriber added and removed during a delivery still gets its initial call", () => {
    const s = mounted();
    const late = vi.fn();
    let once = true;
    s.onConsent((state) => {
      if (state.at !== null && once) {
        once = false;
        s.onConsent(late)();
      }
    });
    s.acceptAll();
    expect(late).toHaveBeenCalledTimes(1);
    expect(late.mock.calls[0]?.[0]).toMatchObject({ at: NOW });
  });
});

describe("DOM mirror", () => {
  const attrs = () =>
    Object.fromEntries(
      ["necessary", "analytics", "marketing"].map((id) => [
        id,
        document.documentElement.getAttribute(`data-consent-${id}`),
      ]),
    );

  it("sets data-consent-<id> at mount and on every change", () => {
    const s = mounted();
    expect(attrs()).toEqual({ necessary: "granted", analytics: "denied", marketing: "denied" });
    s.choose({ marketing: true });
    expect(attrs()).toEqual({ necessary: "granted", analytics: "denied", marketing: "granted" });
  });

  it("dispatches consent:change on a change, not at mount (decision #16)", () => {
    const events: ConsentState[] = [];
    const listener = (event: Event) => events.push((event as CustomEvent<ConsentState>).detail);
    document.addEventListener("consent:change", listener);
    const s = mounted();
    expect(events).toEqual([]);
    s.acceptAll();
    expect(events).toEqual([s.getConsent()]);
    document.removeEventListener("consent:change", listener);
  });
});
