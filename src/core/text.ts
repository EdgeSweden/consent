// Plan: Locale resolution. Plain text with `{link:<id>}` tokens, rendered as text nodes and <a>
// elements only (plan: CSP). Decisions #30 and #31.

import type { LocaleStrings } from "../astro/schema.js";
import { isLinkHref } from "./urls.js";

/** Shared with validation, so the build accepts exactly the tokens the runtime renders. */
export const LINK_TOKEN = /\{link:([^}]*)\}/g;

type Link = NonNullable<LocaleStrings["links"]>[number];

/**
 * Appends `text` to `parent`. A token whose link is missing stays literal text; a link whose href
 * fails decision #12 renders its label as text. Either only happens without validateConfig.
 */
export function appendText(
  doc: Document,
  parent: HTMLElement,
  text: string,
  links: readonly Link[] = [],
): void {
  let last = 0;
  for (const match of text.matchAll(LINK_TOKEN)) {
    const link = links.find((l) => l.id === match[1]);
    if (link === undefined) continue;
    parent.append(text.slice(last, match.index));
    if (isLinkHref(link.href)) {
      const a = doc.createElement("a");
      a.className = "consent-link";
      a.href = link.href;
      a.textContent = link.label;
      parent.append(a);
    } else {
      parent.append(link.label);
    }
    last = match.index + match[0].length;
  }
  parent.append(text.slice(last));
}
