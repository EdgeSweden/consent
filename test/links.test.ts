import { describe, expect, it } from "vitest";
import { appendText } from "../src/core/text.js";

// Plan: Locale resolution (link tokens), CSP; decisions #30 and #31.

const links = [
  { id: "policy", label: "privacy policy", href: "/privacy" },
  { id: "terms", label: "terms", href: "https://example.com/terms" },
  { id: "top", label: "top", href: "#top" },
];

function render(text: string, list = links): HTMLElement {
  const p = document.createElement("p");
  appendText(document, p, text, list);
  return p;
}

describe("link tokens", () => {
  it("renders plain text as a single text node", () => {
    const p = render("We use cookies.");
    expect(p.childNodes.length).toBe(1);
    expect(p.textContent).toBe("We use cookies.");
  });

  it("turns each token into an <a> with the label as text and no target or rel", () => {
    const p = render("Read the {link:policy} and {link:terms}, or go to {link:top}.");
    expect(p.textContent).toBe("Read the privacy policy and terms, or go to top.");
    const anchors = Array.from(p.querySelectorAll("a"));
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      "/privacy",
      "https://example.com/terms",
      "#top",
    ]);
    expect(anchors.map((a) => a.className)).toEqual([
      "consent-link",
      "consent-link",
      "consent-link",
    ]);
    for (const a of anchors) {
      expect(a.hasAttribute("target")).toBe(false);
      expect(a.hasAttribute("rel")).toBe(false);
    }
  });

  it("handles adjacent tokens, a token at either end and a repeated token", () => {
    const p = render("{link:policy}{link:terms} {link:policy}");
    expect(p.textContent).toBe("privacy policyterms privacy policy");
    expect(p.querySelectorAll("a").length).toBe(3);
  });

  it("keeps a label containing markup as text", () => {
    const p = render("{link:x}", [{ id: "x", label: "<b>bold</b>", href: "/x" }]);
    expect(p.querySelector("b")).toBeNull();
    expect(p.querySelector("a")?.textContent).toBe("<b>bold</b>");
  });

  it("keeps an unresolved token as literal text", () => {
    const p = render("See {link:missing} or {link:policy}.");
    expect(p.textContent).toBe("See {link:missing} or privacy policy.");
    expect(p.querySelectorAll("a").length).toBe(1);
  });

  it("keeps tokens literal when the locale has no links", () => {
    const p = render("See {link:policy}.", []);
    expect(p.textContent).toBe("See {link:policy}.");
    expect(p.querySelector("a")).toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "//example.org/x",
    "/\\example.org",
    "/\t/example.org",
    "privacy",
  ])("renders the label as text when the href %j fails decision #12", (href) => {
    const p = render("See {link:x}.", [{ id: "x", label: "policy", href }]);
    expect(p.textContent).toBe("See policy.");
    expect(p.querySelector("a")).toBeNull();
  });
});
