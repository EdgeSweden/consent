import { describe, expect, it } from "vitest";
import { validateConfig, type ValidationResult } from "../src/astro/index.js";

// One test per rule in plan: Validation and decisions #8–#12, positive and negative.

type Json = Record<string, unknown>;

function strings(): Json {
  return {
    title: "Cookies",
    description: "We use cookies. Read the {link:policy}.",
    acceptAll: "Accept all",
    rejectAll: "Reject all",
    settings: "Settings",
    save: "Save",
    close: "Close",
    alwaysActive: "Always active",
    settingsTitle: "Cookie settings",
    links: [{ id: "policy", label: "cookie policy", href: "/cookies" }],
    categories: {
      necessary: { name: "Necessary", description: "Required for the site to work." },
      analytics: { name: "Analytics", description: "Helps us improve the site." },
    },
    services: { stats: { name: "Statistics" } },
  };
}

function base(): Json {
  return {
    schemaVersion: 1,
    policyVersion: "2026-10",
    defaultLocale: "en",
    categories: [
      { id: "necessary", required: true },
      { id: "analytics", services: [{ id: "stats", cookies: ["_stats"] }] },
    ],
    locales: { en: strings(), sv: strings() },
  };
}

/** A valid config with `patch` applied by the caller. */
function withConfig(patch: (config: Json) => void): ValidationResult {
  const config = base();
  patch(config);
  return validateConfig(config);
}

const paths = (result: ValidationResult) => result.errors.map((e) => e.path);
const at = <T>(value: unknown, key: string | number): T => (value as Record<string, T>)[key] as T;
const locale = (config: Json, name = "en") => at<Json>(config["locales"], name);

function expectValid(result: ValidationResult): void {
  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
}

function expectError(result: ValidationResult, path: string): void {
  expect(result.ok).toBe(false);
  expect(paths(result)).toContain(path);
}

describe("validateConfig", () => {
  it("accepts the minimal valid config and returns it", () => {
    const result = validateConfig(base());
    expectValid(result);
    expect(result.warnings).toEqual([]);
    expect(result.ok && result.config.policyVersion).toBe("2026-10");
  });

  it("rejects a non-object", () => {
    expectError(validateConfig("config"), "(root)");
  });

  it("collects every error rather than stopping at the first", () => {
    const result = withConfig((c) => {
      c["schemaVersion"] = 2;
      c["policyVersion"] = "";
    });
    expect(paths(result)).toEqual(expect.arrayContaining(["schemaVersion", "policyVersion"]));
  });

  describe("schemaVersion and policyVersion", () => {
    it("requires schemaVersion 1", () => {
      expectError(
        withConfig((c) => (c["schemaVersion"] = 2)),
        "schemaVersion",
      );
    });

    it.each([
      ["empty", "", false],
      ["32 characters", "x".repeat(32), true],
      ["33 characters", "x".repeat(33), false],
    ])("policyVersion %s", (_, value, ok) => {
      const result = withConfig((c) => (c["policyVersion"] = value));
      if (ok) expectValid(result);
      else expectError(result, "policyVersion");
    });
  });

  describe("categories", () => {
    it.each([
      ["a", true],
      ["a_b-1", true],
      ["a" + "b".repeat(31), true],
      ["a" + "b".repeat(32), false],
      ["Analytics", false],
      ["1st", false],
      ["", false],
    ])("category id %j", (id, ok) => {
      const result = withConfig((c) => {
        at<Json>(c["categories"], 1)["id"] = id;
        for (const name of ["en", "sv"]) {
          const entries = at<Json>(locale(c, name), "categories");
          entries[id] = entries["analytics"];
          delete entries["analytics"];
        }
      });
      if (ok) expectValid(result);
      else expectError(result, "categories[1].id");
    });

    it("rejects duplicate category ids", () => {
      const result = withConfig((c) => (c["categories"] as Json[]).push({ id: "analytics" }));
      expectError(result, "categories[2].id");
    });

    it("rejects a service id repeated across categories", () => {
      const result = withConfig((c) =>
        (c["categories"] as Json[]).push({ id: "marketing", services: [{ id: "stats" }] }),
      );
      expectError(result, "categories[2].services[0].id");
    });

    it("requires at least one optional category", () => {
      const result = withConfig((c) => (at<Json>(c["categories"], 1)["required"] = true));
      expectError(result, "categories");
    });

    it("accepts a config with no required category", () => {
      const result = withConfig((c) => {
        (c["categories"] as Json[]).shift();
        for (const name of ["en", "sv"])
          delete at<Json>(locale(c, name), "categories")["necessary"];
      });
      expectValid(result);
    });
  });

  describe("locales", () => {
    it("requires defaultLocale to be a key of locales", () => {
      expectError(
        withConfig((c) => (c["defaultLocale"] = "de")),
        "defaultLocale",
      );
    });

    it("rejects an empty locale key", () => {
      const result = withConfig((c) => (at<Json>(c, "locales")[""] = strings()));
      expectError(result, `locales[""]`);
    });

    it("requires strings for every category in every locale", () => {
      const result = withConfig((c) => delete at<Json>(locale(c, "sv"), "categories")["analytics"]);
      expectError(result, "locales.sv.categories");
    });

    it("requires strings for every service in every locale", () => {
      const result = withConfig((c) => delete locale(c, "sv")["services"]);
      expectError(result, "locales.sv.services");
    });

    it("rejects a category string key that matches no category", () => {
      const result = withConfig(
        (c) => (at<Json>(locale(c), "categories")["analytic"] = { name: "x", description: "x" }),
      );
      expectError(result, "locales.en.categories.analytic");
    });

    it("rejects a service string key that matches no service", () => {
      const result = withConfig((c) => (at<Json>(locale(c), "services")["stat"] = { name: "x" }));
      expectError(result, "locales.en.services.stat");
    });
  });

  describe("link tokens", () => {
    it("resolves {link:id} in description and settingsDescription", () => {
      const result = withConfig((c) => (locale(c)["settingsDescription"] = "See {link:policy}."));
      expectValid(result);
    });

    it.each(["description", "settingsDescription"])("rejects an unresolved token in %s", (key) => {
      const result = withConfig((c) => (locale(c)[key] = "See {link:privacy}."));
      expectError(result, `locales.en.${key}`);
    });

    it("does not resolve a token against another locale's links", () => {
      const result = withConfig((c) => delete locale(c, "sv")["links"]);
      expectError(result, "locales.sv.description");
    });
  });

  describe("link hrefs (decision #12)", () => {
    it.each(["/cookies", "https://example.com/cookies", "http://example.org/p", "#cookies"])(
      "accepts %j",
      (href) => {
        expectValid(withConfig((c) => (at<Json>(locale(c)["links"], 0)["href"] = href)));
      },
    );

    it.each([
      "javascript:alert(1)",
      "data:text/html,x",
      "//example.com/cookies",
      "/\\example.com",
      "/\t/example.com",
      "/\n/example.com",
      "/\r/example.com",
      "mailto:privacy@example.com",
      "cookies",
      "",
    ])("rejects %j", (href) => {
      const result = withConfig((c) => (at<Json>(locale(c)["links"], 0)["href"] = href));
      expectError(result, "locales.en.links[0].href");
    });
  });

  describe("buttons.order", () => {
    it.each([
      [{}, true],
      [{ order: ["rejectAll", "settings", "acceptAll"] }, true],
      [{ settings: false, order: ["rejectAll", "acceptAll"] }, true],
      [{ order: ["acceptAll", "rejectAll"] }, false],
      [{ order: ["acceptAll", "acceptAll", "settings"] }, false],
      [{ order: ["acceptAll", "rejectAll", "settings", "settings"] }, false],
      [{ order: ["acceptAll", "settings"] }, false],
      [{ settings: false, order: ["acceptAll", "rejectAll", "settings"] }, false],
      [{ settings: false, order: ["acceptAll"] }, false],
    ])("%j", (buttons, ok) => {
      const result = withConfig((c) => (c["buttons"] = buttons));
      if (ok) expectValid(result);
      else expectError(result, "buttons.order");
    });

    it("rejects an unknown entry", () => {
      const result = withConfig(
        (c) => (c["buttons"] = { order: ["acceptAll", "rejectAll", "settings", "close"] }),
      );
      expectError(result, "buttons.order[3]");
    });
  });

  describe("layout", () => {
    it.each([
      [{ blocking: true, backdrop: "dim" }, true],
      [{ blocking: false, backdrop: "none" }, true],
      [{ blocking: true, backdrop: "none" }, false],
      [{ backdrop: "none" }, false],
    ])("blocking requires the dim backdrop: %j", (layout, ok) => {
      const result = withConfig((c) => (c["layout"] = layout));
      if (ok) expectValid(result);
      else expectError(result, "layout.blocking");
    });

    it("rejects an empty width", () => {
      expectError(
        withConfig((c) => (c["layout"] = { width: "" })),
        "layout.width",
      );
    });
  });

  describe("theme colours", () => {
    it.each(["#fff", "#ffffffcc", "rgb(0 0 0)", "rgba(0, 0, 0, 0.5)", "hsl(210 50% 40%)", "teal"])(
      "accepts %j",
      (value) => {
        expectValid(withConfig((c) => (c["theme"] = { colors: { border: value } })));
      },
    );

    it.each(["not-a-colour", "oklch(60% 0.1 200)", "currentColor", "var(--x)", "#ggg", ""])(
      "rejects %j",
      (value) => {
        const result = withConfig((c) => (c["theme"] = { colors: { border: value } }));
        expectError(result, "theme.colors.border");
      },
    );

    it("rejects an unknown colour token", () => {
      const result = withConfig((c) => (c["theme"] = { colors: { primary: "#000" } }));
      expectError(result, "theme.colors.primary");
    });
  });

  describe("contrast", () => {
    it("passes with the default colours", () => {
      expect(validateConfig(base()).warnings).toEqual([]);
    });

    it("warns on low contrast by default", () => {
      const result = withConfig((c) => (c["theme"] = { colors: { acceptText: "#777777" } }));
      expectValid(result);
      expect(result.warnings.map((w) => w.path)).toEqual(["theme.colors.acceptText"]);
    });

    it("fails on low contrast with strictContrast", () => {
      const result = withConfig((c) => {
        c["theme"] = { colors: { background: "#222222" } };
        c["validation"] = { strictContrast: true };
      });
      expectError(result, "theme.colors.text");
    });

    it.each([
      ["text", "background"],
      ["acceptText", "acceptBackground"],
      ["rejectText", "rejectBackground"],
      ["settingsText", "settingsBackground"],
      ["saveText", "saveBackground"],
    ])("checks %s on %s", (fg, bg) => {
      const result = withConfig(
        (c) => (c["theme"] = { colors: { [fg]: "#888888", [bg]: "#999999" } }),
      );
      expect(result.warnings.map((w) => w.path)).toEqual([`theme.colors.${fg}`]);
    });

    it("warns that a translucent colour cannot be checked, even with strictContrast", () => {
      const result = withConfig((c) => {
        c["theme"] = { colors: { saveBackground: "rgba(0, 0, 0, 0.5)" } };
        c["validation"] = { strictContrast: true };
      });
      expectValid(result);
      expect(result.warnings[0]?.message).toMatch(/cannot check/i);
    });
  });

  describe("theme.vars", () => {
    it("accepts a non-colour custom property", () => {
      expectValid(withConfig((c) => (c["theme"] = { vars: { "--consent-gap": "1rem" } })));
    });

    it("rejects the custom property of a colour token", () => {
      const result = withConfig(
        (c) => (c["theme"] = { vars: { "--consent-accept-background": "#fff" } }),
      );
      expectError(result, "theme.vars.--consent-accept-background");
    });

    it("rejects a property outside the --consent- prefix", () => {
      expectError(
        withConfig((c) => (c["theme"] = { vars: { "--brand": "#fff" } })),
        "theme.vars.--brand",
      );
    });

    it("rejects an empty value", () => {
      const result = withConfig((c) => (c["theme"] = { vars: { "--consent-gap": "" } }));
      expectError(result, "theme.vars.--consent-gap");
    });
  });

  describe("field rules (decision #11)", () => {
    it.each([
      [{ cookie: { maxAgeDays: 1 } }, null],
      [{ cookie: { maxAgeDays: 400 } }, null],
      [{ cookie: { maxAgeDays: 0 } }, "cookie.maxAgeDays"],
      [{ cookie: { maxAgeDays: 401 } }, "cookie.maxAgeDays"],
      [{ cookie: { maxAgeDays: 1.5 } }, "cookie.maxAgeDays"],
      [{ cookie: { name: "site_consent" } }, null],
      [{ cookie: { name: "my consent" } }, "cookie.name"],
      [{ cookie: { name: "a;b" } }, "cookie.name"],
      [{ cookie: { path: "/" } }, null],
      [{ cookie: { path: "docs" } }, "cookie.path"],
      [{ cookie: { domain: "example.com" } }, null],
      [{ cookie: { domain: ".example.com" } }, null],
      [{ cookie: { domain: "example .com" } }, "cookie.domain"],
      [{ cookie: { domain: "https://example.com" } }, "cookie.domain"],
      [{ theme: { zIndex: 10 } }, null],
      [{ theme: { zIndex: 1.5 } }, "theme.zIndex"],
      [{ theme: { font: "" } }, "theme.font"],
      [{ theme: { radius: { box: "" } } }, "theme.radius.box"],
      [{ theme: { radius: { box: "0.5rem", button: "999px", control: "4px" } } }, null],
    ])("%j", (patch, path) => {
      const result = withConfig((c) => Object.assign(c, patch));
      if (path === null) expectValid(result);
      else expectError(result, path);
    });
  });

  describe("record", () => {
    it.each(["/consent", "https://example.com/consent", "http://example.org/c"])(
      "accepts the URL %j",
      (record) => {
        expectValid(withConfig((c) => (c["record"] = record)));
      },
    );

    it("accepts a function", () => {
      expectValid(withConfig((c) => (c["record"] = () => undefined)));
    });

    it.each([
      "//example.com/consent",
      "/\t/example.com",
      "/\n/example.com",
      "/\r/example.com",
      "ftp://example.com/c",
      "javascript:void 0",
      "consent",
      1,
    ])("rejects %j", (record) => {
      expectError(
        withConfig((c) => (c["record"] = record)),
        "record",
      );
    });
  });

  describe("unknown keys fail at every level", () => {
    it.each([
      ["(root)", "extra", (c: Json) => (c["extra"] = 1)],
      ["cookie", "cookie.secure", (c: Json) => (c["cookie"] = { secure: true })],
      [
        "category",
        "categories[0].label",
        (c: Json) => (at<Json>(c["categories"], 0)["label"] = "x"),
      ],
      [
        "service",
        "categories[1].services[0].name",
        (c: Json) => (at<Json>(at<Json>(c["categories"], 1)["services"], 0)["name"] = "x"),
      ],
      ["locale strings", "locales.en.banner", (c: Json) => (locale(c)["banner"] = "x")],
      [
        "link",
        "locales.en.links[0].target",
        (c: Json) => (at<Json>(locale(c)["links"], 0)["target"] = "_blank"),
      ],
      [
        "category strings",
        "locales.en.categories.analytics.label",
        (c: Json) => (at<Json>(at<Json>(locale(c), "categories"), "analytics")["label"] = "x"),
      ],
      ["layout", "layout.animation", (c: Json) => (c["layout"] = { animation: "fade" })],
      ["theme", "theme.shadow", (c: Json) => (c["theme"] = { shadow: "none" })],
      ["radius", "theme.radius.dialog", (c: Json) => (c["theme"] = { radius: { dialog: "0" } })],
      ["validation", "validation.strict", (c: Json) => (c["validation"] = { strict: true })],
      ["buttons", "buttons.close", (c: Json) => (c["buttons"] = { close: true })],
    ])("%s", (_, path, patch) => {
      expectError(withConfig(patch), path);
    });

    it.each(["consentMode", "gateScripts"])("names the version that adds %s", (key) => {
      const result = withConfig((c) => (c[key] = key === "gateScripts" ? true : { mapping: {} }));
      expectError(result, key);
      expect(result.errors.find((e) => e.path === key)?.message).toMatch(/v0\.2\.0/);
    });
  });
});
