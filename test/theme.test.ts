import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsentConfig } from "../src/astro/index.js";
import { colorProperty } from "../src/astro/defaults.js";
import { clearCookies, testConfig } from "./support/config.js";

// Plan: Config (theme), CSP, Tests (Theme); decision #32.

let mount: typeof import("../src/core/mount.js").mount;

beforeEach(async () => {
  vi.resetModules();
  ({ mount } = await import("../src/core/mount.js"));
});

afterEach(() => {
  vi.restoreAllMocks();
  clearCookies();
  document.body.replaceChildren();
});

const root = () => document.querySelector(".consent-root") as HTMLElement;
const prop = (name: string) => root().style.getPropertyValue(name);

function mountWith(theme: ConsentConfig["theme"], layout?: ConsentConfig["layout"]) {
  mount(testConfig({ theme, ...(layout && { layout }) }), document);
}

describe("theme", () => {
  it("applies every theme value as a custom property on the root", () => {
    mountWith(
      {
        colors: { background: "#000000", acceptText: "rgb(1, 2, 3)" },
        radius: { box: "0", button: "2px", control: "4px" },
        font: "serif",
        zIndex: 10,
      },
      { width: "30rem" },
    );
    expect(prop(colorProperty("background"))).toBe("#000000");
    expect(prop("--consent-accept-text")).toBe("rgb(1, 2, 3)");
    expect(prop("--consent-radius-box")).toBe("0");
    expect(prop("--consent-radius-button")).toBe("2px");
    expect(prop("--consent-radius-control")).toBe("4px");
    expect(prop("--consent-font")).toBe("serif");
    expect(prop("--consent-z-index")).toBe("10");
    expect(prop("--consent-width")).toBe("30rem");
  });

  it("sets nothing that is not configured, leaving the stylesheet defaults", () => {
    mountWith(undefined);
    expect(root().style.length).toBe(0);
  });

  it("applies vars", () => {
    mountWith({ vars: { "--consent-gap": "2rem", "--consent-duration": "0ms" } });
    expect(prop("--consent-gap")).toBe("2rem");
    expect(prop("--consent-duration")).toBe("0ms");
  });

  it("lets a named key win over vars naming the same property", () => {
    mountWith({ zIndex: 5, vars: { "--consent-z-index": "9" } }, { width: "20rem" });
    expect(prop("--consent-z-index")).toBe("5");
  });

  it("lets layout.width win over vars", () => {
    mountWith({ vars: { "--consent-width": "1rem" } }, { width: "20rem" });
    expect(prop("--consent-width")).toBe("20rem");
  });

  it("skips vars that validation rejects: colour tokens and other properties", () => {
    const vars = { "--consent-text": "red", display: "none", "--other": "1" };
    mountWith({ vars } as unknown as ConsentConfig["theme"]);
    expect(prop("--consent-text")).toBe("");
    expect(prop("display")).toBe("");
    expect(prop("--other")).toBe("");
  });

  it("is applied before the root joins the document", () => {
    const append = vi.spyOn(HTMLElement.prototype, "append");
    let applied: string | undefined;
    append.mockImplementation(function (this: HTMLElement, ...nodes) {
      if (this === document.body) {
        applied = (nodes[0] as HTMLElement).style.getPropertyValue("--consent-font");
      }
      return Element.prototype.append.apply(this, nodes);
    });
    mountWith({ font: "serif" });
    expect(applied).toBe("serif");
  });

  it("uses style.setProperty only, never a style attribute or cssText", () => {
    // The DOM serialises setProperty into the style attribute itself; only calls made outside
    // setProperty would be the package's own (plan: Tests, Theme).
    let inSetProperty = 0;
    const own: string[] = [];
    const setProperty = CSSStyleDeclaration.prototype.setProperty;
    const spy = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty").mockImplementation(function (
      this: CSSStyleDeclaration,
      ...args
    ) {
      inSetProperty++;
      try {
        return setProperty.apply(this, args);
      } finally {
        inSetProperty--;
      }
    });
    const setAttribute = Element.prototype.setAttribute;
    vi.spyOn(Element.prototype, "setAttribute").mockImplementation(function (
      this: Element,
      name,
      value,
    ) {
      if (inSetProperty === 0 && name.toLowerCase() === "style") own.push(value);
      return setAttribute.call(this, name, value);
    });
    const cssText = vi.spyOn(CSSStyleDeclaration.prototype, "cssText", "set");
    mountWith({ colors: { text: "#111111" }, font: "serif", vars: { "--consent-gap": "1px" } });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(own).toEqual([]);
    expect(cssText).not.toHaveBeenCalled();
  });
});
