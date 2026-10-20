// Build-time CSS colour parsing and WCAG contrast. Supports the subset in decision #8: hex,
// rgb()/rgba(), hsl()/hsla(), named colours and `transparent`. Anything else is unparseable.

export interface Rgba {
  /** 0–255 */
  r: number;
  /** 0–255 */
  g: number;
  /** 0–255 */
  b: number;
  /** 0–1 */
  a: number;
}

// CSS Color 4 named colours.
const NAMED: Record<string, string> = {
  aliceblue: "f0f8ff",
  antiquewhite: "faebd7",
  aqua: "00ffff",
  aquamarine: "7fffd4",
  azure: "f0ffff",
  beige: "f5f5dc",
  bisque: "ffe4c4",
  black: "000000",
  blanchedalmond: "ffebcd",
  blue: "0000ff",
  blueviolet: "8a2be2",
  brown: "a52a2a",
  burlywood: "deb887",
  cadetblue: "5f9ea0",
  chartreuse: "7fff00",
  chocolate: "d2691e",
  coral: "ff7f50",
  cornflowerblue: "6495ed",
  cornsilk: "fff8dc",
  crimson: "dc143c",
  cyan: "00ffff",
  darkblue: "00008b",
  darkcyan: "008b8b",
  darkgoldenrod: "b8860b",
  darkgray: "a9a9a9",
  darkgreen: "006400",
  darkgrey: "a9a9a9",
  darkkhaki: "bdb76b",
  darkmagenta: "8b008b",
  darkolivegreen: "556b2f",
  darkorange: "ff8c00",
  darkorchid: "9932cc",
  darkred: "8b0000",
  darksalmon: "e9967a",
  darkseagreen: "8fbc8f",
  darkslateblue: "483d8b",
  darkslategray: "2f4f4f",
  darkslategrey: "2f4f4f",
  darkturquoise: "00ced1",
  darkviolet: "9400d3",
  deeppink: "ff1493",
  deepskyblue: "00bfff",
  dimgray: "696969",
  dimgrey: "696969",
  dodgerblue: "1e90ff",
  firebrick: "b22222",
  floralwhite: "fffaf0",
  forestgreen: "228b22",
  fuchsia: "ff00ff",
  gainsboro: "dcdcdc",
  ghostwhite: "f8f8ff",
  gold: "ffd700",
  goldenrod: "daa520",
  gray: "808080",
  green: "008000",
  greenyellow: "adff2f",
  grey: "808080",
  honeydew: "f0fff0",
  hotpink: "ff69b4",
  indianred: "cd5c5c",
  indigo: "4b0082",
  ivory: "fffff0",
  khaki: "f0e68c",
  lavender: "e6e6fa",
  lavenderblush: "fff0f5",
  lawngreen: "7cfc00",
  lemonchiffon: "fffacd",
  lightblue: "add8e6",
  lightcoral: "f08080",
  lightcyan: "e0ffff",
  lightgoldenrodyellow: "fafad2",
  lightgray: "d3d3d3",
  lightgreen: "90ee90",
  lightgrey: "d3d3d3",
  lightpink: "ffb6c1",
  lightsalmon: "ffa07a",
  lightseagreen: "20b2aa",
  lightskyblue: "87cefa",
  lightslategray: "778899",
  lightslategrey: "778899",
  lightsteelblue: "b0c4de",
  lightyellow: "ffffe0",
  lime: "00ff00",
  limegreen: "32cd32",
  linen: "faf0e6",
  magenta: "ff00ff",
  maroon: "800000",
  mediumaquamarine: "66cdaa",
  mediumblue: "0000cd",
  mediumorchid: "ba55d3",
  mediumpurple: "9370db",
  mediumseagreen: "3cb371",
  mediumslateblue: "7b68ee",
  mediumspringgreen: "00fa9a",
  mediumturquoise: "48d1cc",
  mediumvioletred: "c71585",
  midnightblue: "191970",
  mintcream: "f5fffa",
  mistyrose: "ffe4e1",
  moccasin: "ffe4b5",
  navajowhite: "ffdead",
  navy: "000080",
  oldlace: "fdf5e6",
  olive: "808000",
  olivedrab: "6b8e23",
  orange: "ffa500",
  orangered: "ff4500",
  orchid: "da70d6",
  palegoldenrod: "eee8aa",
  palegreen: "98fb98",
  paleturquoise: "afeeee",
  palevioletred: "db7093",
  papayawhip: "ffefd5",
  peachpuff: "ffdab9",
  peru: "cd853f",
  pink: "ffc0cb",
  plum: "dda0dd",
  powderblue: "b0e0e6",
  purple: "800080",
  rebeccapurple: "663399",
  red: "ff0000",
  rosybrown: "bc8f8f",
  royalblue: "4169e1",
  saddlebrown: "8b4513",
  salmon: "fa8072",
  sandybrown: "f4a460",
  seagreen: "2e8b57",
  seashell: "fff5ee",
  sienna: "a0522d",
  silver: "c0c0c0",
  skyblue: "87ceeb",
  slateblue: "6a5acd",
  slategray: "708090",
  slategrey: "708090",
  snow: "fffafa",
  springgreen: "00ff7f",
  steelblue: "4682b4",
  tan: "d2b48c",
  teal: "008080",
  thistle: "d8bfd8",
  tomato: "ff6347",
  turquoise: "40e0d0",
  violet: "ee82ee",
  wheat: "f5deb3",
  white: "ffffff",
  whitesmoke: "f5f5f5",
  yellow: "ffff00",
  yellowgreen: "9acd32",
};

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/;
const HUE_UNITS: Record<string, number> = { deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function num(s: string): number | null {
  return NUMBER.test(s) ? Number(s) : null;
}

/** A number, or a percentage scaled so that 100% is `full`. */
function numOrPercent(s: string, full: number): number | null {
  if (!s.endsWith("%")) return num(s);
  const n = num(s.slice(0, -1));
  return n === null ? null : (n / 100) * full;
}

function hue(s: string): number | null {
  const match = /^(.*?)(deg|grad|rad|turn)?$/.exec(s);
  const n = num(match?.[1] ?? "");
  return n === null ? null : n * (HUE_UNITS[match?.[2] ?? "deg"] ?? 1);
}

function hexColor(hex: string): Rgba | null {
  if (!/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(hex)) return null;
  const full = hex.length <= 4 ? [...hex].map((c) => c + c).join("") : hex;
  const byte = (i: number) => parseInt(full.slice(i * 2, i * 2 + 2), 16);
  return { r: byte(0), g: byte(1), b: byte(2), a: full.length === 8 ? byte(3) / 255 : 1 };
}

interface Args {
  channels: string[];
  alpha: string | undefined;
  /** Comma-separated syntax, which has a stricter grammar than the space-separated one. */
  legacy: boolean;
}

/** Splits functional arguments in legacy (comma) or modern (space, `/ alpha`) syntax. */
function splitArgs(body: string): Args | null {
  if (body.includes(",")) {
    const parts = body.split(",").map((p) => p.trim());
    if (parts.length !== 3 && parts.length !== 4) return null;
    return { channels: parts.slice(0, 3), alpha: parts[3], legacy: true };
  }
  const [main = "", alpha, ...rest] = body.split("/").map((p) => p.trim());
  if (rest.length > 0 || alpha === "") return null;
  const channels = main.split(/\s+/).filter(Boolean);
  return channels.length === 3 ? { channels, alpha, legacy: false } : null;
}

const isPercent = (s: string) => s.endsWith("%");

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sector = (((h % 360) + 360) % 360) / 30;
  const k = (n: number) => (n + sector) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Parses a CSS colour in the supported subset, or returns null. */
export function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const named = NAMED[value];
  if (named !== undefined) return hexColor(named);
  if (value.startsWith("#")) return hexColor(value.slice(1));

  const fn = /^(rgba?|hsla?)\((.*)\)$/.exec(value);
  if (fn === null) return null;
  const args = splitArgs(fn[2] ?? "");
  if (args === null) return null;
  const a = args.alpha === undefined ? 1 : numOrPercent(args.alpha, 1);
  if (a === null) return null;
  const [c1 = "", c2 = "", c3 = ""] = args.channels;

  if (fn[1]?.startsWith("rgb")) {
    // Legacy rgb() takes all numbers or all percentages; browsers reject a mix.
    if (args.legacy && new Set(args.channels.map(isPercent)).size > 1) return null;
    const r = numOrPercent(c1, 255);
    const g = numOrPercent(c2, 255);
    const b = numOrPercent(c3, 255);
    if (r === null || g === null || b === null) return null;
    return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), a: clamp(a, 0, 1) };
  }
  // Legacy hsl() requires percentages for saturation and lightness.
  if (args.legacy && !(isPercent(c2) && isPercent(c3))) return null;
  const h = hue(c1);
  const s = numOrPercent(c2, 100);
  const l = numOrPercent(c3, 100);
  if (h === null || s === null || l === null) return null;
  const [r, g, b] = hslToRgb(h, clamp(s, 0, 100) / 100, clamp(l, 0, 100) / 100);
  return { r, g, b, a: clamp(a, 0, 1) };
}

function luminance({ r, g, b }: Rgba): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.1 contrast ratio of two opaque colours, 1–21. */
export function contrastRatio(x: Rgba, y: Rgba): number {
  const [lx, ly] = [luminance(x), luminance(y)];
  return (Math.max(lx, ly) + 0.05) / (Math.min(lx, ly) + 0.05);
}
