// Plan: Config (theme, layout.width), CSP. Each value is one custom property set through
// style.setProperty on the root; nothing else touches style. Decision #32.

import type { ConsentConfig } from "../astro/schema.js";
import { THEME_COLORS, colorProperty } from "../astro/defaults.js";

const COLOR_PROPERTIES = new Set<string>(THEME_COLORS.map(colorProperty));

export function applyTheme(config: ConsentConfig, root: HTMLElement): void {
  const theme = config.theme ?? {};
  const set = (name: string, value: string | number | undefined) => {
    if (value !== undefined) root.style.setProperty(name, String(value));
  };
  // vars first, so a named key wins; only --consent-* and never a colour token, as validation.
  for (const [name, value] of Object.entries(theme.vars ?? {})) {
    if (name.startsWith("--consent-") && !COLOR_PROPERTIES.has(name)) set(name, value);
  }
  for (const token of THEME_COLORS) set(colorProperty(token), theme.colors?.[token]);
  set("--consent-radius-box", theme.radius?.box);
  set("--consent-radius-button", theme.radius?.button);
  set("--consent-radius-control", theme.radius?.control);
  set("--consent-font", theme.font);
  set("--consent-z-index", theme.zIndex);
  set("--consent-width", config.layout?.width);
}
