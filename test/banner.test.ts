import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsentConfig, LocaleStrings } from "../src/astro/index.js";
import { DEFAULT_COLORS, THEME_COLORS, colorProperty } from "../src/astro/defaults.js";
import { encodeChoice, readChoice } from "../src/core/cookie.js";
import { clearCookies, testConfig } from "./support/config.js";

// Plan: Choice, Accessibility, Runtime behaviour; decisions #19–#25.

type Core = typeof import("../src/core/state.js") &
  typeof import("../src/core/ui.js") & {
    mount: typeof import("../src/core/mount.js").mount;
  };

const NOW = 1_790_000_000;
let core: Core;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
  core = {
    ...(await import("../src/core/state.js")),
    ...(await import("../src/core/ui.js")),
    ...(await import("../src/core/mount.js")),
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  clearCookies();
  document.body.replaceChildren();
  for (const name of document.documentElement.getAttributeNames()) {
    if (name.startsWith("data-consent-")) document.documentElement.removeAttribute(name);
  }
});

function store(c: Record<string, boolean>): void {
  document.cookie = `consent=${encodeChoice({ p: "2026-10", t: NOW - 100, c })}; Path=/`;
}

const stored = () => readChoice(document, "consent");
const q = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector);
const banner = () => q(".consent-banner") as HTMLElement;
const settings = () => q(".consent-settings") as HTMLElement;
const backdrop = () => q(".consent-backdrop") as HTMLElement;
const click = (selector: string, within: HTMLElement) =>
  (within.querySelector(selector) as HTMLElement).click();
const toggle = (id: string) =>
  q<HTMLInputElement>(`.consent-root input[id$="-category-${id}"]`) as HTMLInputElement;
const texts = (within: HTMLElement) =>
  Array.from(within.querySelectorAll(".consent-actions > button")).map((b) => b.textContent);

function key(key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true });
  (document.activeElement ?? document.body).dispatchEvent(event);
  return event;
}

/** Page content outside the banner, with a focusable opener. */
function page(): { main: HTMLElement; opener: HTMLButtonElement } {
  const main = document.createElement("main");
  const opener = document.createElement("button");
  opener.textContent = "Page button";
  main.append(opener);
  document.body.append(main);
  return { main, opener };
}

function mounted(config: ConsentConfig = testConfig()): Core {
  core.mount(config, document);
  return core;
}

const EN = testConfig().locales["en"] as LocaleStrings;
const attr = (node: Element, name: string) => node.getAttribute(name) ?? "";

const nonBlocking = (patch: Partial<ConsentConfig> = {}) =>
  testConfig({ layout: { blocking: false }, ...patch });

describe("mount", () => {
  it("shows the banner when no valid choice exists", () => {
    mounted();
    expect(banner().hidden).toBe(false);
    expect(settings().hidden).toBe(true);
  });

  it("keeps the banner hidden when a valid choice is stored", () => {
    store({ necessary: true, analytics: true, marketing: false });
    mounted();
    expect(banner().hidden).toBe(true);
    expect(backdrop().hidden).toBe(true);
  });

  it("writes nothing at mount", () => {
    const writes = vi.spyOn(document, "cookie", "set");
    mounted();
    expect(writes).not.toHaveBeenCalled();
  });

  it("builds the dialogs once on a second mount", () => {
    mounted();
    core.mount(testConfig(), document);
    expect(document.querySelectorAll(".consent-root")).toHaveLength(1);
  });

  it("builds the dialogs on DOMContentLoaded when body is missing (decision #24)", () => {
    const doc = document.implementation.createHTMLDocument("");
    doc.documentElement.removeChild(doc.body);
    core.mount(testConfig(), doc);
    expect(core.getConsent()).not.toBeNull();
    expect(doc.querySelector(".consent-root")).toBeNull();
    doc.documentElement.append(doc.createElement("body"));
    doc.dispatchEvent(new Event("DOMContentLoaded"));
    expect(doc.querySelector(".consent-banner")?.hasAttribute("hidden")).toBe(false);
  });

  it("opens settings requested between mount and DOMContentLoaded", () => {
    const doc = document.implementation.createHTMLDocument("");
    doc.documentElement.removeChild(doc.body);
    core.mount(testConfig(), doc);
    core.openSettings();
    doc.documentElement.append(doc.createElement("body"));
    doc.dispatchEvent(new Event("DOMContentLoaded"));
    expect(doc.querySelector(".consent-settings")?.hasAttribute("hidden")).toBe(false);
    expect(doc.querySelector(".consent-banner")?.hasAttribute("hidden")).toBe(true);
    (doc.querySelector(".consent-settings .consent-close") as HTMLElement).click();
    expect(doc.querySelector(".consent-banner")?.hasAttribute("hidden")).toBe(false);
  });

  it("keeps ARIA and label references inside the root when ids collide", () => {
    const host = document.createElement("div");
    for (const id of ["consent-title", "consent0-title", "consent-category-analytics"]) {
      const node = document.createElement("input");
      node.id = id;
      host.append(node);
    }
    document.body.append(host);
    mounted();
    const root = q(".consent-root") as HTMLElement;
    const references = Array.from(
      root.querySelectorAll("[aria-labelledby], [aria-describedby], label[for]"),
    ).flatMap((node) =>
      [attr(node, "aria-labelledby"), attr(node, "aria-describedby"), attr(node, "for")]
        .join(" ")
        .split(" ")
        .filter(Boolean),
    );
    expect(references.length).toBeGreaterThan(5);
    for (const id of references) {
      expect(root.contains(document.getElementById(id)), id).toBe(true);
    }
  });

  it("renders in the resolved locale and marks it on the root", () => {
    const sv = { ...EN, title: "Kakor", acceptAll: "Godkänn alla" };
    mounted(testConfig({ locale: "sv", locales: { en: EN, sv } }));
    expect(q(".consent-root")?.getAttribute("lang")).toBe("sv");
    expect(q(".consent-banner .consent-title")?.textContent).toBe("Kakor");
    expect(texts(banner())[0]).toBe("Godkänn alla");
  });

  it("sets no style attribute anywhere (plan: CSP)", () => {
    mounted();
    expect(document.querySelectorAll("[style]")).toHaveLength(0);
  });
});

describe("first layer", () => {
  it("defaults to Accept all, Reject all, Settings", () => {
    mounted();
    expect(texts(banner())).toEqual(["Accept all", "Reject all", "Settings"]);
  });

  it("follows buttons.order", () => {
    mounted(testConfig({ buttons: { order: ["settings", "rejectAll", "acceptAll"] } }));
    expect(texts(banner())).toEqual(["Settings", "Reject all", "Accept all"]);
  });

  it("defaults to the center position (decision #27)", () => {
    mounted(testConfig({ layout: { blocking: true } }));
    expect(q(".consent-root")?.getAttribute("data-position")).toBe("center");
  });

  it("drops Settings when disabled", () => {
    mounted(testConfig({ buttons: { settings: false } }));
    expect(texts(banner())).toEqual(["Accept all", "Reject all"]);
  });

  it.each([
    "bottom-left",
    "bottom-right",
    "bottom-center",
    "top-left",
    "top-right",
    "top-center",
    "center",
  ] as const)("exposes position %s to the stylesheet", (position) => {
    mounted(testConfig({ layout: { position } }));
    expect(q(".consent-root")?.getAttribute("data-position")).toBe(position);
  });

  it("Accept all stores every category granted and closes", () => {
    mounted();
    click(".consent-accept", banner());
    expect(stored()?.c).toEqual({ necessary: true, analytics: true, marketing: true });
    expect(banner().hidden).toBe(true);
    expect(backdrop().hidden).toBe(true);
  });

  it("Reject all stores every optional category denied and closes", () => {
    mounted();
    click(".consent-reject", banner());
    expect(stored()?.c).toEqual({ necessary: true, analytics: false, marketing: false });
    expect(banner().hidden).toBe(true);
  });
});

describe("blocking banner", () => {
  it("is a modal dialog labelled by its title and described by its text", () => {
    mounted();
    const b = banner();
    expect(b.getAttribute("role")).toBe("dialog");
    expect(b.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(attr(b, "aria-labelledby"))?.textContent).toBe("Cookies");
    expect(document.getElementById(attr(b, "aria-describedby"))?.textContent).toBe(
      "We use cookies.",
    );
  });

  it("uses dialogLabel as aria-label when given", () => {
    const en = { ...EN, dialogLabel: "Cookie consent" };
    mounted(testConfig({ locales: { en, sv: en } }));
    expect(banner().getAttribute("aria-label")).toBe("Cookie consent");
    expect(banner().hasAttribute("aria-labelledby")).toBe(false);
  });

  it("has no close control", () => {
    mounted();
    expect(banner().querySelector(".consent-close")).toBeNull();
  });

  it("shows a backdrop hidden from assistive technology", () => {
    mounted();
    expect(backdrop().hidden).toBe(false);
    expect(backdrop().getAttribute("aria-hidden")).toBe("true");
    expect(backdrop().hasAttribute("tabindex")).toBe(false);
  });

  it("makes sibling content inert and restores it after a choice", () => {
    const { main } = page();
    const already = document.createElement("aside");
    already.setAttribute("inert", "");
    document.body.append(already);
    mounted();
    expect(main.hasAttribute("inert")).toBe(true);
    expect(q(".consent-root")?.hasAttribute("inert")).toBe(false);
    click(".consent-reject", banner());
    expect(main.hasAttribute("inert")).toBe(false);
    expect(already.hasAttribute("inert")).toBe(true);
  });

  it("makes content added while open inert and restores it after a choice", async () => {
    mounted();
    const late = document.createElement("main");
    late.append(document.createElement("button"));
    document.body.append(late);
    await Promise.resolve();
    expect(late.hasAttribute("inert")).toBe(true);
    click(".consent-reject", banner());
    expect(late.hasAttribute("inert")).toBe(false);
  });

  it("re-applies inert when the host removes it while open", async () => {
    const { main } = page();
    const hostOwned = document.createElement("aside");
    hostOwned.setAttribute("inert", "");
    document.body.append(hostOwned);
    mounted();
    main.removeAttribute("inert");
    hostOwned.removeAttribute("inert");
    await Promise.resolve();
    expect(main.hasAttribute("inert")).toBe(true);
    expect(hostOwned.hasAttribute("inert")).toBe(true);
    click(".consent-reject", banner());
    expect(main.hasAttribute("inert")).toBe(false);
    expect(hostOwned.hasAttribute("inert")).toBe(false);
  });

  it("frees the page when the host removes the root while open", async () => {
    const { main } = page();
    mounted();
    q(".consent-root")?.remove();
    await Promise.resolve();
    expect(main.hasAttribute("inert")).toBe(false);
  });

  it("moves focus to the dialog, not a button, and returns it after a choice", () => {
    const { opener } = page();
    opener.focus();
    mounted();
    expect(document.activeElement).toBe(banner());
    click(".consent-accept", banner());
    expect(document.activeElement).toBe(opener);
  });

  it("ignores Escape and backdrop clicks", () => {
    const writes = vi.spyOn(document, "cookie", "set");
    mounted();
    expect(key("Escape").defaultPrevented).toBe(false);
    backdrop().click();
    expect(banner().hidden).toBe(false);
    expect(writes).not.toHaveBeenCalled();
  });

  it("cycles Tab inside the dialog", () => {
    mounted();
    const buttons = Array.from(banner().querySelectorAll("button"));
    const [first] = buttons as [HTMLButtonElement];
    const last = buttons.at(-1) as HTMLButtonElement;
    expect(key("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    expect(key("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(key("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    first.focus();
    expect(key("Tab").defaultPrevented).toBe(false);
  });
});

describe("non-blocking banner", () => {
  it("is a non-modal dialog that leaves the page interactive", () => {
    const { main } = page();
    mounted(nonBlocking());
    expect(banner().hasAttribute("aria-modal")).toBe(false);
    expect(main.hasAttribute("inert")).toBe(false);
    expect(q(".consent-root")?.hasAttribute("data-modal")).toBe(false);
    (banner().querySelector("button") as HTMLElement).focus();
    expect(key("Tab").defaultPrevented).toBe(false);
  });

  it("close control stores nothing and returns focus", () => {
    const { opener } = page();
    opener.focus();
    const writes = vi.spyOn(document, "cookie", "set");
    mounted(nonBlocking());
    expect(document.activeElement).toBe(banner());
    click(".consent-close", banner());
    expect(banner().hidden).toBe(true);
    expect(writes).not.toHaveBeenCalled();
    expect(core.getConsent()?.at).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("Escape inside the banner acts as the close control", () => {
    const writes = vi.spyOn(document, "cookie", "set");
    mounted(nonBlocking());
    key("Escape");
    expect(banner().hidden).toBe(true);
    expect(writes).not.toHaveBeenCalled();
  });

  it("Escape elsewhere on the page leaves the banner open", () => {
    const { opener } = page();
    mounted(nonBlocking());
    opener.focus();
    key("Escape");
    expect(banner().hidden).toBe(false);
  });

  it("shows no backdrop with backdrop none", () => {
    mounted(nonBlocking({ layout: { blocking: false, backdrop: "none" } }));
    expect(backdrop().hidden).toBe(true);
  });
});

describe("settings dialog", () => {
  it("is a modal dialog labelled by its title", () => {
    const { main } = page();
    store({ necessary: true, analytics: false, marketing: false });
    mounted(nonBlocking());
    core.openSettings();
    const s = settings();
    expect(s.hidden).toBe(false);
    expect(s.getAttribute("role")).toBe("dialog");
    expect(s.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(attr(s, "aria-labelledby"))?.textContent).toBe(
      "Cookie settings",
    );
    expect(main.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(s);
  });

  it("lists every category with the required one locked on", () => {
    mounted();
    const necessary = toggle("necessary");
    expect(necessary.type).toBe("checkbox");
    expect(necessary.checked).toBe(true);
    expect(necessary.disabled).toBe(true);
    const describedBy = attr(necessary, "aria-describedby").split(" ");
    expect(describedBy.map((id) => document.getElementById(id)?.textContent)).toContain(
      "Always active",
    );
    expect(toggle("analytics").disabled).toBe(false);
    expect(q(`label[for="${toggle("analytics").id}"]`)?.textContent).toBe("Analytics");
  });

  it("lists services by name and description", () => {
    const config = testConfig({
      categories: [
        { id: "necessary", required: true },
        { id: "analytics", services: [{ id: "stats", cookies: ["_s"] }] },
        { id: "marketing" },
      ],
    });
    const en = {
      ...EN,
      services: { stats: { name: "Stats", description: "Counts visits." } },
    };
    mounted({ ...config, locales: { en, sv: en } });
    const service = q(".consent-service") as HTMLElement;
    expect(service.textContent).toBe("StatsCounts visits.");
  });

  it("orders its buttons Accept all, Reject all, Save regardless of buttons.order", () => {
    mounted(testConfig({ buttons: { order: ["settings", "rejectAll", "acceptAll"] } }));
    expect(texts(settings())).toEqual(["Accept all", "Reject all", "Save"]);
  });

  it("reflects the stored choice each time it opens", () => {
    store({ necessary: true, analytics: true, marketing: false });
    mounted();
    core.openSettings();
    expect(toggle("analytics").checked).toBe(true);
    expect(toggle("marketing").checked).toBe(false);
    toggle("marketing").checked = true;
    key("Escape");
    core.openSettings();
    expect(toggle("marketing").checked).toBe(false);
  });

  it("first-visit Save with untouched switches stores a rejection", () => {
    mounted();
    click(".consent-preferences", banner());
    click(".consent-save", settings());
    expect(stored()?.c).toEqual({ necessary: true, analytics: false, marketing: false });
    expect(banner().hidden).toBe(true);
    expect(settings().hidden).toBe(true);
  });

  it("Save stores the switch states", () => {
    mounted();
    click(".consent-preferences", banner());
    toggle("analytics").checked = true;
    click(".consent-save", settings());
    expect(stored()?.c).toEqual({ necessary: true, analytics: true, marketing: false });
  });

  it("a no-op Save only closes", () => {
    store({ necessary: true, analytics: true, marketing: false });
    mounted();
    const writes = vi.spyOn(document, "cookie", "set");
    core.openSettings();
    click(".consent-save", settings());
    expect(writes).not.toHaveBeenCalled();
    expect(settings().hidden).toBe(true);
  });

  it.each([
    ["Escape", () => key("Escape")],
    ["the close control", () => click(".consent-close", settings())],
  ])("%s returns to the banner and its Settings button", (_, close) => {
    const writes = vi.spyOn(document, "cookie", "set");
    mounted();
    const button = banner().querySelector(".consent-preferences") as HTMLElement;
    button.focus();
    button.click();
    expect(banner().hidden).toBe(true);
    close();
    expect(settings().hidden).toBe(true);
    expect(banner().hidden).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(writes).not.toHaveBeenCalled();
  });

  it("a choice made from the banner's settings returns focus to the page", () => {
    const { opener, main } = page();
    opener.focus();
    mounted();
    click(".consent-preferences", banner());
    click(".consent-accept", settings());
    expect(document.activeElement).toBe(opener);
    expect(main.hasAttribute("inert")).toBe(false);
  });

  it("ignores backdrop clicks", () => {
    store({ necessary: true, analytics: false, marketing: false });
    mounted();
    core.openSettings();
    backdrop().click();
    expect(settings().hidden).toBe(false);
  });

  it("cycles Tab inside the dialog, skipping the locked switch", () => {
    store({ necessary: true, analytics: false, marketing: false });
    mounted();
    core.openSettings();
    const focusable = Array.from(
      settings().querySelectorAll<HTMLElement>("button, input:not([disabled])"),
    );
    expect(focusable).not.toContain(toggle("necessary"));
    key("Tab", true);
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
    key("Tab");
    expect(document.activeElement).toBe(focusable[0]);
  });

  it("closing after a choice-less reopen leaves the page interactive", () => {
    const { main, opener } = page();
    store({ necessary: true, analytics: false, marketing: false });
    mounted();
    opener.focus();
    core.openSettings();
    key("Escape");
    expect(main.hasAttribute("inert")).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(backdrop().hidden).toBe(true);
  });
});

describe("reopen control and openSettings", () => {
  it("openSettings before mount is a no-op (decision #23)", () => {
    expect(() => core.openSettings()).not.toThrow();
    expect(q(".consent-root")).toBeNull();
  });

  it('opens from any [data-consent="open"] and returns focus to it', () => {
    store({ necessary: true, analytics: false, marketing: false });
    const link = document.createElement("a");
    link.href = "#privacy";
    link.setAttribute("data-consent", "open");
    const inner = document.createElement("span");
    inner.textContent = "Cookie settings";
    link.append(inner);
    document.body.append(link);
    mounted();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    inner.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(settings().hidden).toBe(false);
    key("Escape");
    expect(document.activeElement).toBe(link);
  });

  it("openSettings after the host removed the root leaves the page interactive", async () => {
    store({ necessary: true, analytics: false, marketing: false });
    const { main } = page();
    mounted();
    q(".consent-root")?.remove();
    core.openSettings();
    await Promise.resolve();
    expect(main.hasAttribute("inert")).toBe(false);
    expect(q(".consent-settings")).toBeNull();
  });

  it("ignores other clicks", () => {
    store({ necessary: true, analytics: false, marketing: false });
    const { opener } = page();
    mounted();
    opener.click();
    expect(settings().hidden).toBe(true);
  });

  it("withdraw from the settings dialog after accepting is recorded as denied", () => {
    store({ necessary: true, analytics: true, marketing: true });
    mounted();
    core.openSettings();
    toggle("analytics").checked = false;
    toggle("marketing").checked = false;
    click(".consent-save", settings());
    expect(stored()?.c).toEqual({ necessary: true, analytics: false, marketing: false });
    expect(document.documentElement.getAttribute("data-consent-analytics")).toBe("denied");
  });
});

describe("stylesheet", () => {
  const css = readFileSync("src/styles.css", "utf8");

  it.each(THEME_COLORS)("declares the default for %s (decision #9)", (token) => {
    const match = new RegExp(`${colorProperty(token)}:\\s*([^;]+);`).exec(css);
    expect(match?.[1]?.trim()).toBe(DEFAULT_COLORS[token]);
  });

  it("disables animation and transition under reduced motion", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[^@]*animation: none !important;\s*transition: none !important;/,
    );
  });

  it("styles focus with the focus token", () => {
    expect(css).toMatch(/:focus-visible[^}]*outline: 2px solid var\(--consent-focus\)/);
  });
});
