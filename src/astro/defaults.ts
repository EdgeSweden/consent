// Default colour tokens (decision #9). The stylesheet must declare the same values; the contrast
// check merges config colours over these.

export const THEME_COLORS = [
  "background",
  "text",
  "muted",
  "link",
  "border",
  "backdrop",
  "focus",
  "acceptBackground",
  "acceptText",
  "rejectBackground",
  "rejectText",
  "settingsBackground",
  "settingsText",
  "saveBackground",
  "saveText",
  "toggleOn",
  "toggleOff",
  "toggleKnob",
] as const;

export type ThemeColor = (typeof THEME_COLORS)[number];

// Accept and reject share a style by default: equal prominence (plan: Principles, 2).
export const DEFAULT_COLORS: Record<ThemeColor, string> = {
  background: "#ffffff",
  text: "#1a1a1a",
  muted: "#595959",
  link: "#0b57d0",
  border: "#d0d0d0",
  backdrop: "rgba(0, 0, 0, 0.5)",
  focus: "#0b57d0",
  acceptBackground: "#1a1a1a",
  acceptText: "#ffffff",
  rejectBackground: "#1a1a1a",
  rejectText: "#ffffff",
  settingsBackground: "#ffffff",
  settingsText: "#1a1a1a",
  saveBackground: "#1a1a1a",
  saveText: "#ffffff",
  toggleOn: "#1a1a1a",
  toggleOff: "#767676",
  toggleKnob: "#ffffff",
};

/** Foreground/background pairs that must reach 4.5:1 (plan: Validation). */
export const CONTRAST_PAIRS: ReadonlyArray<readonly [ThemeColor, ThemeColor]> = [
  ["text", "background"],
  ["acceptText", "acceptBackground"],
  ["rejectText", "rejectBackground"],
  ["settingsText", "settingsBackground"],
  ["saveText", "saveBackground"],
];

export const MIN_CONTRAST = 4.5;

/** The CSS custom property of a colour token: `acceptText` → `--consent-accept-text`. */
export function colorProperty(token: ThemeColor): string {
  return `--consent-${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}
