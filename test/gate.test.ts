// @vitest-environment-options {"settings":{"enableJavaScriptEvaluation":true,"disableJavaScriptFileLoading":true,"handleDisabledFileLoadingAsSuccess":true}}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeChoice } from "../src/core/cookie.js";
import { clearCookies, testConfig } from "./support/config.js";

// Plan: Script gating, Principles 1; decisions #42–#45. The options above let happy-dom run the
// inline scripts this file activates, so "runs once" is observed rather than inferred; external
// files are never fetched.

type State = typeof import("../src/core/state.js");
type Gate = typeof import("../src/gate/index.js");

let core: State;
let gate: Gate;
const runs: string[] = [];

declare global {
  var gateRuns: string[] | undefined;
}

beforeEach(async () => {
  vi.resetModules();
  runs.length = 0;
  globalThis.gateRuns = runs;
  core = await import("../src/core/state.js");
  gate = await import("../src/gate/index.js");
});

afterEach(() => {
  vi.restoreAllMocks();
  clearCookies();
  document.head.replaceChildren();
  document.body.replaceChildren();
  globalThis.gateRuns = undefined;
  for (const name of document.documentElement.getAttributeNames()) {
    if (name.startsWith("data-consent-")) document.documentElement.removeAttribute(name);
  }
});

/** A gated inline script that logs its category to `gateRuns` when it runs. */
function gated(category: string, attributes: Record<string, string> = {}): HTMLScriptElement {
  const script = document.createElement("script");
  script.type = "text/plain";
  script.setAttribute("data-consent", category);
  for (const [name, value] of Object.entries(attributes)) script.setAttribute(name, value);
  script.text = `globalThis.gateRuns.push(${JSON.stringify(category)});`;
  document.body.append(script);
  return script;
}

const live = (category: string) =>
  document.querySelectorAll(`script[data-consent="${category}"]:not([type="text/plain"])`);
const waiting = (category: string) =>
  document.querySelectorAll(`script[type="text/plain"][data-consent="${category}"]`);

function start(): () => void {
  const dispose = gate.installScriptGating(testConfig());
  core.mount(testConfig(), document);
  return dispose;
}

describe("script gating", () => {
  it("activates nothing optional before a choice", () => {
    gated("analytics");
    gated("marketing");
    start();
    expect(waiting("analytics")).toHaveLength(1);
    expect(waiting("marketing")).toHaveLength(1);
    expect(runs).not.toContain("analytics");
    expect(runs).not.toContain("marketing");
  });

  it("activates a required category's scripts at mount, before any choice", () => {
    gated("necessary");
    start();
    expect(core.getConsent()?.at).toBeNull();
    expect(waiting("necessary")).toHaveLength(0);
    expect(live("necessary")).toHaveLength(1);
    expect(runs).toEqual(["necessary"]);
  });

  it("activates a granted category on a choice and leaves a denied one untouched", () => {
    gated("analytics");
    const marketing = gated("marketing");
    start();
    core.choose({ analytics: true });
    expect(live("analytics")).toHaveLength(1);
    expect(runs).toEqual(["analytics"]);
    expect(waiting("marketing")[0]).toBe(marketing);
  });

  it("activates the categories of a valid stored choice at mount", () => {
    document.cookie = `consent=${encodeChoice({
      p: "2026-10",
      t: 1,
      c: { necessary: true, analytics: true, marketing: false },
    })}; Path=/`;
    gated("analytics");
    gated("marketing");
    start();
    expect(runs).toEqual(["analytics"]);
  });

  it("runs each script once across later changes", () => {
    gated("analytics");
    start();
    core.choose({ analytics: true });
    core.choose({ analytics: true, marketing: true });
    core.withdraw();
    core.acceptAll();
    expect(runs).toEqual(["analytics"]);
    expect(live("analytics")).toHaveLength(1);
  });

  it("keeps a script that ran after a withdrawal", () => {
    gated("analytics");
    start();
    core.acceptAll();
    core.withdraw();
    expect(live("analytics")).toHaveLength(1);
  });

  it("never activates a script whose category is not configured", () => {
    gated("unknown");
    gated("toString");
    gated("");
    start();
    core.acceptAll();
    expect(document.querySelectorAll('script[type="text/plain"]')).toHaveLength(3);
    expect(runs).toEqual([]);
  });

  it("preserves attributes and text, drops type and keeps document order", () => {
    const original = gated("analytics", {
      id: "a",
      class: "tracker",
      "data-site": "x",
      src: "/analytics.js",
      crossorigin: "anonymous",
      referrerpolicy: "no-referrer",
    });
    const text = original.text;
    start();
    core.acceptAll();
    const [script] = live("analytics") as NodeListOf<HTMLScriptElement>;
    expect(script).toBeDefined();
    expect(script).not.toBe(original);
    expect(script?.hasAttribute("type")).toBe(false);
    expect(script?.getAttribute("id")).toBe("a");
    expect(script?.getAttribute("class")).toBe("tracker");
    expect(script?.getAttribute("data-site")).toBe("x");
    expect(script?.getAttribute("data-consent")).toBe("analytics");
    expect(script?.getAttribute("src")).toBe("/analytics.js");
    expect(script?.getAttribute("crossorigin")).toBe("anonymous");
    expect(script?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(script?.text).toBe(text);
    expect(script?.async).toBe(false);
  });

  it("keeps async when the gated script asked for it", () => {
    gated("analytics", { src: "/analytics.js", async: "" });
    start();
    core.acceptAll();
    const [script] = live("analytics") as NodeListOf<HTMLScriptElement>;
    expect(script?.hasAttribute("async")).toBe(true);
    expect(script?.async).toBe(true);
  });

  it("uses data-consent-type as the live type", () => {
    gated("analytics", { "data-consent-type": "module" });
    start();
    core.acceptAll();
    const [script] = live("analytics") as NodeListOf<HTMLScriptElement>;
    expect(script?.type).toBe("module");
    expect(script?.hasAttribute("data-consent-type")).toBe(false);
  });

  it("copies the nonce from the property", () => {
    const original = gated("analytics");
    original.nonce = "abc123";
    original.setAttribute("nonce", "");
    start();
    core.acceptAll();
    const [script] = live("analytics") as NodeListOf<HTMLScriptElement>;
    expect(script?.nonce).toBe("abc123");
  });

  it("scans again on DOMContentLoaded when installed while loading", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    start();
    gated("necessary");
    expect(runs).toEqual([]);
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(runs).toEqual(["necessary"]);
  });

  it("does not scan on DOMContentLoaded before mount", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    gate.installScriptGating(testConfig());
    gated("necessary");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(runs).toEqual([]);
  });

  it("works when installed after mount", () => {
    gated("necessary");
    gated("analytics");
    core.mount(testConfig(), document);
    gate.installScriptGating(testConfig());
    expect(runs).toEqual(["necessary"]);
    core.acceptAll();
    expect(runs).toEqual(["necessary", "analytics"]);
  });

  describe("order (decision #44)", () => {
    const liveOf = (category: string) => live(category)[0] as HTMLScriptElement | undefined;

    it("holds later scripts until an external script loads", () => {
      gated("necessary", { src: "/first.js", id: "first" });
      gated("analytics");
      start();
      core.acceptAll();
      expect(waiting("analytics")).toHaveLength(1);
      expect(runs).toEqual([]);
      liveOf("necessary")?.dispatchEvent(new Event("load"));
      expect(runs).toEqual(["analytics"]);
    });

    it("continues after an external script fails, once", () => {
      gated("necessary", { src: "/first.js" });
      gated("analytics");
      start();
      core.acceptAll();
      liveOf("necessary")?.dispatchEvent(new Event("error"));
      liveOf("necessary")?.dispatchEvent(new Event("load"));
      expect(runs).toEqual(["analytics"]);
    });

    it("holds later scripts behind a module script", () => {
      gated("necessary", { "data-consent-type": "module" });
      gated("analytics");
      start();
      core.acceptAll();
      expect(waiting("analytics")).toHaveLength(1);
      liveOf("necessary")?.dispatchEvent(new Event("load"));
      expect(runs).toContain("analytics");
    });

    it.each([
      ["async", { src: "/first.js", async: "" }],
      ["a non-script type", { src: "/first.tpl", "data-consent-type": "text/x-template" }],
      ["text/typescript", { src: "/first.ts", "data-consent-type": "text/typescript" }],
      ["an untrimmed module type", { src: "/first.js", "data-consent-type": " module" }],
      ["an inline classic script", {}],
    ])("does not hold later scripts behind %s", (_, attributes) => {
      gated("necessary", attributes);
      gated("analytics");
      start();
      core.acceptAll();
      expect(runs).toContain("analytics");
    });

    it("holds external classic scripts of every JavaScript MIME type", () => {
      gated("necessary", { src: "/first.js", "data-consent-type": " Text/JavaScript " });
      gated("analytics");
      start();
      core.acceptAll();
      expect(waiting("analytics")).toHaveLength(1);
    });

    it("runs a newly granted script before a later one that was already waiting", () => {
      gated("necessary", { src: "/first.js" });
      gated("analytics");
      gated("necessary");
      start();
      expect(runs).toEqual([]);
      core.acceptAll();
      liveOf("necessary")?.dispatchEvent(new Event("load"));
      expect(runs).toEqual(["analytics", "necessary"]);
    });

    it("does not activate a queued script whose category was withdrawn while it waited", () => {
      gated("necessary", { src: "/first.js" });
      gated("analytics");
      start();
      core.acceptAll();
      core.withdraw();
      liveOf("necessary")?.dispatchEvent(new Event("load"));
      expect(runs).toEqual([]);
      expect(waiting("analytics")).toHaveLength(1);
      core.acceptAll();
      expect(runs).toEqual(["analytics"]);
    });

    it("queues a script once across changes and installations while it waits", () => {
      gated("necessary", { src: "/first.js" });
      gated("analytics");
      start();
      gate.installScriptGating(testConfig());
      core.acceptAll();
      core.choose({ analytics: true });
      liveOf("necessary")?.dispatchEvent(new Event("load"));
      expect(runs).toEqual(["analytics"]);
      expect(live("analytics")).toHaveLength(1);
    });

    it("stops the queue on dispose", () => {
      gated("necessary", { src: "/first.js" });
      gated("analytics");
      const dispose = start();
      core.acceptAll();
      dispose();
      liveOf("necessary")?.dispatchEvent(new Event("load"));
      expect(runs).toEqual([]);
      expect(waiting("analytics")).toHaveLength(1);
    });
  });

  it("stops after dispose", () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    gated("analytics");
    const dispose = start();
    dispose();
    core.acceptAll();
    gated("necessary");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(runs).toEqual([]);
    expect(waiting("analytics")).toHaveLength(1);
  });
});
