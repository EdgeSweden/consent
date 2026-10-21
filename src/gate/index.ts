// Script-gating adapter (plan: Script gating; decisions #42–#45). Another consumer of the core: it
// imports the package entry, not a relative path, so it shares the page's one consent state.

import { onConsent } from "@edgesweden/consent";
import type { ConsentConfig } from "../astro/schema.js";

const GATED = 'script[type="text/plain"][data-consent]';
const NOT_COPIED = new Set(["type", "data-consent-type", "nonce"]);

/** Gated scripts queued for activation by any installation, so none is activated twice. */
const claimed = new WeakSet<HTMLScriptElement>();

const isGranted = (granted: Record<string, boolean>, id: string) =>
  Object.hasOwn(granted, id) && granted[id] === true;

/** Replaces a gated script with a live copy and returns it. */
function activate(doc: Document, gated: HTMLScriptElement): HTMLScriptElement {
  const live = doc.createElement("script");
  for (const { name, value } of gated.attributes) {
    if (!NOT_COPIED.has(name)) live.setAttribute(name, value);
  }
  const type = gated.getAttribute("data-consent-type");
  if (type !== null) live.type = type;
  // Browsers hide a parsed nonce from getAttribute; the property keeps it.
  if (gated.nonce) live.nonce = gated.nonce;
  // Inserted scripts are async by default; keep document order unless the page asked otherwise.
  if (gated.hasAttribute("src") && !gated.hasAttribute("async")) live.async = false;
  live.text = gated.text;
  gated.replaceWith(live);
  return live;
}

// The JavaScript MIME type essences a browser executes (HTML: "JavaScript MIME type").
const CLASSIC = new Set(
  [
    "application/ecmascript application/javascript application/x-ecmascript",
    "application/x-javascript text/ecmascript text/javascript text/javascript1.0",
    "text/javascript1.1 text/javascript1.2 text/javascript1.3 text/javascript1.4",
    "text/javascript1.5 text/jscript text/livescript text/x-ecmascript text/x-javascript",
  ]
    .join(" ")
    .split(" ")
    .concat(""),
);

/**
 * True when the scripts after `live` must wait for its load or error event, as they would in
 * parsed HTML: an external classic or a module script without `async`. Inline classic scripts run
 * on insertion; any other `type` never loads, so it must not hold the queue.
 */
function blocks(live: HTMLScriptElement): boolean {
  if (live.hasAttribute("async")) return false;
  // The browser trims a classic type but not "module".
  if (live.type.toLowerCase() === "module") return true;
  return CLASSIC.has(live.type.trim().toLowerCase()) && live.hasAttribute("src");
}

/** Sorts in document order; the browser would run them in that order had they been live. */
const inDocumentOrder = (a: Node, b: Node) =>
  a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;

/**
 * Activates `<script type="text/plain" data-consent="<category>">` elements as their category is
 * granted, required categories from mount, one at a time in document order. Returns a disposer;
 * scripts that already ran stay.
 */
export function installScriptGating(_config: ConsentConfig, doc: Document = document): () => void {
  let granted: Record<string, boolean> | null = null;
  let disposed = false;
  let waiting = false;
  const queue: HTMLScriptElement[] = [];

  const drain = (): void => {
    while (!waiting && !disposed) {
      const gated = queue.shift();
      if (gated === undefined) return;
      claimed.delete(gated);
      // Consent may have been withdrawn, or the element removed, while it waited.
      const id = gated.getAttribute("data-consent") ?? "";
      if (!gated.isConnected || granted === null || !isGranted(granted, id)) continue;
      const live = activate(doc, gated);
      if (blocks(live)) {
        waiting = true;
        let settled = false;
        const next = () => {
          if (settled) return;
          settled = true;
          waiting = false;
          drain();
        };
        live.addEventListener("load", next, { once: true });
        live.addEventListener("error", next, { once: true });
      }
    }
  };

  const scan = (): void => {
    if (granted === null || disposed) return;
    for (const gated of doc.querySelectorAll<HTMLScriptElement>(GATED)) {
      const id = gated.getAttribute("data-consent") ?? "";
      if (claimed.has(gated) || !isGranted(granted, id)) continue;
      claimed.add(gated);
      queue.push(gated);
    }
    // A newly granted script may come before one that is already waiting.
    queue.sort(inDocumentOrder);
    drain();
  };

  const unsubscribe = onConsent((state) => {
    granted = state.categories;
    scan();
  });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", scan, { once: true });
  return () => {
    disposed = true;
    unsubscribe();
    doc.removeEventListener("DOMContentLoaded", scan);
    for (const gated of queue.splice(0)) claimed.delete(gated);
  };
}
