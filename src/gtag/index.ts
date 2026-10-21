// Google Consent Mode v2 adapter (plan: Google Consent Mode v2; decisions #48–#50). Another
// consumer of the core: it imports the package entry, so it shares the page's one consent state.

import { onConsent } from "@edgesweden/consent";
import type { ConsentConfig } from "../astro/schema.js";

type Values = Record<string, "granted" | "denied">;

/** Windows that already got a `default` command, so it is never pushed twice. */
const installed = new WeakSet<Window>();

/**
 * Pushes `gtag("consent", "default", …)` now and `gtag("consent", "update", …)` whenever the
 * mapped values change, through `window.dataLayer`. Does nothing without `consentMode`. Returns a
 * disposer that stops further updates.
 */
export function installConsentMode(config: ConsentConfig, win: Window = window): () => void {
  const mode = config.consentMode;
  if (mode === undefined || installed.has(win)) return () => {};
  installed.add(win);

  const host = win as Window & { dataLayer?: unknown[] };
  // gtag.js reads a command only as an Arguments object, never as an array, so the parameters are
  // read through `arguments`.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function gtag(_command: "consent", _action: "default" | "update", _values: Values): void {
    // eslint-disable-next-line prefer-rest-params
    (host.dataLayer ??= []).push(arguments);
  }

  const values = (granted: (id: string) => boolean): Values => {
    const out: Values = {};
    for (const [id, keys] of Object.entries(mode.mapping)) {
      for (const key of keys) out[key] = granted(id) ? "granted" : "denied";
    }
    return out;
  };

  const required = new Set(config.categories.filter((c) => c.required === true).map((c) => c.id));
  let last = values((id) => required.has(id));
  gtag("consent", "default", { ...last, ...mode.extra });

  return onConsent((state) => {
    const next = values(
      (id) => Object.hasOwn(state.categories, id) && state.categories[id] === true,
    );
    if (Object.keys(next).some((key) => next[key] !== last[key])) gtag("consent", "update", next);
    last = next;
  });
}
