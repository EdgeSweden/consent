import { describe, expect, it } from "vitest";
import { contrastRatio, parseColor, type Rgba } from "../src/astro/colors.js";
import { DEFAULT_COLORS, colorProperty } from "../src/astro/defaults.js";

function color(value: string): Rgba {
  const c = parseColor(value);
  if (c === null) throw new Error(`unparseable: ${value}`);
  return c;
}

const rgb = (value: string) => {
  const c = parseColor(value);
  return c && [Math.round(c.r), Math.round(c.g), Math.round(c.b), Number(c.a.toFixed(3))];
};

describe("parseColor", () => {
  it.each([
    ["#0b57d0", [11, 87, 208, 1]],
    ["#FFF", [255, 255, 255, 1]],
    ["#0008", [0, 0, 0, 0.533]],
    ["#00000080", [0, 0, 0, 0.502]],
    ["rgb(255, 0, 0)", [255, 0, 0, 1]],
    ["rgba(0, 0, 255, 0.5)", [0, 0, 255, 0.5]],
    ["rgb(0 128 0 / 50%)", [0, 128, 0, 0.5]],
    ["rgb(100% 0% 0%)", [255, 0, 0, 1]],
    ["hsl(0, 100%, 50%)", [255, 0, 0, 1]],
    ["hsl(120deg 100% 25%)", [0, 128, 0, 1]],
    ["hsla(240, 100%, 50%, 0.25)", [0, 0, 255, 0.25]],
    ["hsl(0.5turn 100% 50%)", [0, 255, 255, 1]],
    ["rgba(0, 0, 0, 50%)", [0, 0, 0, 0.5]],
    ["rgb(100% 0 0%)", [255, 0, 0, 1]],
    ["hsl(0 100 50)", [255, 0, 0, 1]],
    ["RebeccaPurple", [102, 51, 153, 1]],
    [" white ", [255, 255, 255, 1]],
    ["transparent", [0, 0, 0, 0]],
  ])("%s", (value, expected) => {
    expect(rgb(value)).toEqual(expected);
  });

  it.each([
    "",
    "#12345",
    "#ggg",
    "rgb(0, 0)",
    "rgb(0 0 0 0)",
    "rgb(0, 0, 0 / 1)",
    "rgb(a, b, c)",
    "rgb(0%, 1, 2%)",
    "rgba(255, 0, 0%, 1)",
    "hsl(0, 50%, 50)",
    "hsl(0, 50, 50%)",
    "hsl(0 100% 50% / )",
    "oklch(60% 0.1 200)",
    "color-mix(in srgb, red, blue)",
    "currentcolor",
    "var(--x)",
    "notacolour",
  ])("rejects %j", (value) => {
    expect(parseColor(value)).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and symmetric", () => {
    const black = color("#000");
    const white = color("#fff");
    expect(contrastRatio(black, white)).toBeCloseTo(21);
    expect(contrastRatio(white, black)).toBeCloseTo(21);
  });

  it("matches the WCAG reference for #767676 on white", () => {
    expect(contrastRatio(color("#767676"), color("#fff"))).toBeCloseTo(4.54, 2);
  });
});

describe("defaults", () => {
  it("every default colour parses", () => {
    for (const value of Object.values(DEFAULT_COLORS)) expect(parseColor(value)).not.toBeNull();
  });

  it("maps a token to its custom property", () => {
    expect(colorProperty("acceptBackground")).toBe("--consent-accept-background");
    expect(colorProperty("text")).toBe("--consent-text");
  });
});
