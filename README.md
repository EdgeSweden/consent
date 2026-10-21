# @edgesweden/consent

A config-driven cookie-consent banner for static and server-rendered websites.

- Framework-agnostic core in vanilla TypeScript with one stylesheet, exposed as `mount(config)`
- Thin Astro integration that validates the config at build time and injects one script
- Optional, identifier-free consent record hook
- No backend; everything is a per-site config file
- Works under a strict Content Security Policy without policy changes
- Nothing optional happens before the visitor chooses, and Reject all is as easy as Accept all

The core and stylesheet are under 7 KB gzipped and have no runtime dependencies. Script gating
and the Google Consent Mode v2 adapter are separate entries, each under 1 KB, that the Astro
integration bundles only when the config uses them.

## Install

```sh
npm install @edgesweden/consent
```

Node 22 or later. The Astro integration needs Astro 5.4 or later.

## Astro

```ts
// astro.config.mjs
import { defineConfig } from "astro/config";
import consent from "@edgesweden/consent/astro";

export default defineConfig({
  integrations: [consent({ config: "./src/consent.config.ts" })],
});
```

`config` is a path, relative to the Astro root, to a module whose default export is the config.
At build time the integration loads it, runs `validateConfig`, fails the build on any error, logs
warnings and adds the stylesheet and one page script that calls `mount` to every page. The script
also installs [script gating](#script-gating) when the config sets `gateScripts: true` and
[Consent Mode](#google-consent-mode) when it has `consentMode`; an adapter the config does not use
is not bundled. Nothing is added to your layouts. The config module is bundled for the browser, so a `record` function
works; keep it free of anything you would not ship to visitors.

```ts
// src/consent.config.ts
import type { ConsentConfig } from "@edgesweden/consent/astro";

const config: ConsentConfig = {
  schemaVersion: 1,
  policyVersion: "2026-10",
  defaultLocale: "en",
  categories: [
    { id: "necessary", required: true },
    { id: "analytics", services: [{ id: "stats", cookies: ["_stats"] }] },
  ],
  locales: {
    en: {
      title: "Cookies",
      description: "We use cookies for statistics. Read our {link:privacy}.",
      acceptAll: "Accept all",
      rejectAll: "Reject all",
      settings: "Settings",
      save: "Save",
      close: "Close",
      alwaysActive: "Always active",
      settingsTitle: "Cookie settings",
      links: [{ id: "privacy", label: "privacy policy", href: "/privacy/" }],
      categories: {
        necessary: { name: "Necessary", description: "Needed for the site to work." },
        analytics: { name: "Statistics", description: "Helps us understand how the site is used." },
      },
      services: { stats: { name: "Site statistics" } },
    },
  },
};

export default config;
```

## Other hosts

Validate the config in your build, import the stylesheet through your bundler and call `mount`
once per page:

```ts
// build step (Node)
import { validateConfig } from "@edgesweden/consent/astro";

const result = validateConfig(config);
for (const w of result.warnings) console.warn(`${w.path}: ${w.message}`);
if (!result.ok) throw new Error(result.errors.map((e) => `${e.path}: ${e.message}`).join("\n"));
```

```ts
// browser
import "@edgesweden/consent/styles.css";
import { mount } from "@edgesweden/consent";
import config from "./consent.config.js";

mount(config);
```

`validateConfig` returns `{ ok, config?, errors, warnings }` and collects every error, each as
`{ path, message }`. `mount` does not validate; an invalid config is the build's problem. Serve
the stylesheet from your own origin; the package never fetches or injects it.

## Behaviour

- **Nothing optional before a choice.** Until the visitor presses a button the package sets no
  cookie, touches no storage and makes no request. Reading the consent cookie is the only I/O.
- **Required categories** (`required: true`) are always granted, locked on in the settings
  dialog and labelled `alwaysActive`. Nothing is implied: a category is required only if you say
  so.
- **Reject is as easy as accept.** The first layer always shows Accept all and Reject all with
  the same styling; neither can be configured away.
- **Blocking mode** (the default) cannot be dismissed: no close control, Escape and backdrop
  clicks do nothing, and the rest of the page is `inert`. **Non-blocking mode**
  (`layout.blocking: false`) has a close control that stores nothing; the banner returns on the
  next page.
- **Re-prompt.** The banner is shown when there is no valid cookie, when `policyVersion` changed
  or when a category was added or removed. Until a new choice every optional category is denied.
  Bump `policyVersion` to ask everyone again.
- **The cookie** is URL-encoded JSON, `{"v":1,"p":"<policyVersion>","t":<unix seconds>,"c":{"<id>":true|false}}`,
  with `SameSite=Lax`, `Secure` over https and `Max-Age` from `cookie.maxAgeDays`. A rejection is
  stored too, so the visitor is not asked again.
- **The settings dialog** is modal, has one checkbox per category, and Accept all, Reject all
  and Save. Focus moves into each dialog on open and returns on close.

## State API

From `@edgesweden/consent`:

| Export           | Behaviour                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mount(config)`  | Reads the cookie, establishes the state and shows the banner if a choice is needed. A second call is a no-op.                                                                              |
| `getConsent()`   | The current `ConsentState`, or `null` before mount.                                                                                                                                        |
| `onConsent(cb)`  | Calls `cb` with the state: once during mount if registered before it, immediately if registered after, then on every change. Never from the cookie alone. Returns an unsubscribe function. |
| `openSettings()` | Opens the settings dialog. A no-op before mount.                                                                                                                                           |
| `withdraw()`     | Denies every optional category and stores that. A no-op before mount.                                                                                                                      |

```ts
interface ConsentState {
  categories: Record<string, boolean>;
  policyVersion: string;
  locale: string;
  at: number | null; // unix seconds of the stored choice; null when there is none
}
```

Without a bundler, use the DOM mirror:

- `data-consent-<id>="granted|denied"` on `<html>`, set at mount and on every change, for CSS;
- a `consent:change` event on `document` with the state in `detail`, fired on a change, never at
  mount;
- any element with `data-consent="open"` opens the settings dialog when clicked, so
  `<a href="#" data-consent="open">Cookie settings</a>` works as a reopen link.

```ts
import { onConsent } from "@edgesweden/consent";

onConsent((state) => {
  if (state.categories["analytics"]) loadStatistics();
});
```

## Config reference

Schema version 1. Every key is validated and unknown keys fail at every level.

| Key                                     | Default                                  | Rule                                                                                            |
| --------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `schemaVersion`                         | required                                 | `1`                                                                                             |
| `policyVersion`                         | required                                 | 1–32 characters; change it to re-prompt everyone                                                |
| `cookie.name`                           | `"consent"`                              | an RFC 6265 cookie name                                                                         |
| `cookie.maxAgeDays`                     | `365`                                    | integer 1–400; applies to accept and reject alike                                               |
| `cookie.domain`                         | host-only                                | a hostname                                                                                      |
| `cookie.path`                           | `"/"`                                    | starts with `/`                                                                                 |
| `defaultLocale`                         | required                                 | a key of `locales`                                                                              |
| `locale`                                | `<html lang>`                            | non-empty; forces a locale                                                                      |
| `categories[].id`                       | required                                 | `^[a-z][a-z0-9_-]{0,31}$`, unique                                                               |
| `categories[].required`                 | `false`                                  | always granted, locked on                                                                       |
| `categories[].services[]`               | none                                     | `{ id, cookies? }`; ids unique across all categories; cookie names are not shown to visitors    |
| `locales`                               | required                                 | one `LocaleStrings` per locale key, see below                                                   |
| `layout.position`                       | `"center"`                               | `bottom-left`, `bottom-right`, `bottom-center`, `top-left`, `top-right`, `top-center`, `center` |
| `layout.backdrop`                       | `"dim"`                                  | `dim` or `none`                                                                                 |
| `layout.blocking`                       | `true`                                   | requires `backdrop: "dim"`                                                                      |
| `layout.width`                          | `min(28rem, calc(100vw - 2rem))`         | a CSS length                                                                                    |
| `layout.settingsPosition`               | `"center"`                               | `center` is the only value                                                                      |
| `theme.colors.<token>`                  | built-in palette                         | a hex, `rgb()`, `rgba()`, `hsl()`, `hsla()`, named colour or `transparent`; see Theming         |
| `theme.radius.box`, `button`, `control` | stylesheet                               | a CSS length                                                                                    |
| `theme.font`                            | inherited                                | a CSS `font-family`                                                                             |
| `theme.zIndex`                          | `2147483000`                             | an integer                                                                                      |
| `theme.vars`                            | none                                     | `--consent-*` custom properties; may not name a colour token                                    |
| `validation.strictContrast`             | `false`                                  | `true` turns contrast warnings into build errors                                                |
| `buttons.settings`                      | `true`                                   | show Settings on the first layer                                                                |
| `buttons.order`                         | `["acceptAll", "rejectAll", "settings"]` | an exact permutation of the shown buttons; `acceptAll` and `rejectAll` can never be left out    |
| `record`                                | none                                     | a function, a root-relative path (`/…`) or an absolute `http(s)` URL; see Record                |
| `consentMode.mapping`                   | none                                     | category id → Consent Mode keys; see Google Consent Mode                                        |
| `consentMode.extra`                     | none                                     | Consent Mode key → `"granted"` or `"denied"`, for keys no category owns                         |
| `gateScripts`                           | `false`                                  | a boolean; turns on script gating, see Script gating                                            |

Across the config:

- at least one category must be optional, or there is nothing to consent to;
- every category and service id needs strings in every locale, and a string key that matches no
  declared id fails, so a typo cannot leave a row unlabelled;
- the text and each button's text must reach 4.5:1 contrast on their background; a failure is a
  warning unless `validation.strictContrast` is `true`, and a translucent colour in a checked pair
  is a "cannot check" warning.

### Locale strings

| Key                                                   | Rule                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `title`                                               | the banner heading                                                                       |
| `description`                                         | plain text; `{link:<id>}` tokens become links                                            |
| `acceptAll`, `rejectAll`, `settings`, `save`, `close` | button labels                                                                            |
| `alwaysActive`                                        | label on required categories                                                             |
| `settingsTitle`                                       | the settings dialog heading                                                              |
| `settingsDescription`                                 | optional; may contain `{link:<id>}` tokens                                               |
| `dialogLabel`                                         | optional `aria-label` when the title is decorative                                       |
| `links[]`                                             | `{ id, label, href }`; `href` is a root-relative path, an absolute `http(s)` URL or `#…` |
| `categories.<id>`                                     | `{ name, description }` for every category                                               |
| `services.<id>`                                       | `{ name, description? }` for every service                                               |

Every `{link:<id>}` must match a `links` entry of the same locale. Links open in the same tab.
The locale is `config.locale`, else `<html lang>`, else `<html lang>` without its region
(`sv-SE` → `sv`), else `defaultLocale`. The package ships no copy of its own.

## Theming

Each `theme.colors` token sets a `--consent-*` custom property on the banner root:

`background`, `text`, `muted`, `link`, `border`, `backdrop`, `focus`, `acceptBackground`,
`acceptText`, `rejectBackground`, `rejectText`, `settingsBackground`, `settingsText`,
`saveBackground`, `saveText`, `toggleOn`, `toggleOff`, `toggleKnob`.

A token's property is its kebab-case name: `acceptText` → `--consent-accept-text`. `radius`,
`font`, `zIndex` and `layout.width` set `--consent-radius-box|button|control`,
`--consent-font`, `--consent-z-index` and `--consent-width`. `theme.vars` sets any other
`--consent-*` property, for example `--consent-gap`, `--consent-duration` or
`--consent-settings-width`; named keys win over `vars`. Accept all and Reject all share one style
by default; keep them equally prominent. Class names (`consent-*`) are not a stable API in 0.x;
the custom properties are.

## Record

`record` is called after every choice that sets or changes the stored state, never on a no-op
and never before a choice:

```ts
interface ConsentRecord {
  action: "accept_all" | "reject_all" | "custom" | "withdraw";
  categories: Record<string, boolean>;
  policyVersion: string;
  packageVersion: string;
  locale: string;
  at: number; // unix seconds
}
```

`action` follows the transition, not the button: `accept_all` when every optional category ends
granted, `reject_all` when every one ends denied and none was granted before, `withdraw` when
every one ends denied after at least one was granted, and `custom` otherwise.

- **A function** gets its own copy of the record and owns the transport and the payload shape.
  Throws and rejections are swallowed.
- **A URL** receives the record as a JSON string through `navigator.sendBeacon`, or a
  `keepalive` `fetch` `POST` where that is missing. The body is `text/plain;charset=UTF-8`, so no
  CORS preflight happens; parse it whatever the content type says. Failures are swallowed.

The payload carries no identifier, user agent or page. The request itself still carries what the
browser attaches (IP address, user agent, referrer, same-origin cookies); what the endpoint does
with that is up to you. A URL on another origin must be in your CSP `connect-src`.

## Script gating

Mark each script that belongs to a category as inert text with the category id:

```html
<script type="text/plain" data-consent="analytics" src="/analytics.js"></script>
<script type="text/plain" data-consent="marketing" data-consent-type="module">
  import "/pixel.js";
</script>
```

With the Astro integration, set `gateScripts: true` in the config. On other hosts, install the
adapter after `mount`:

```ts
import { mount } from "@edgesweden/consent";
import { installScriptGating } from "@edgesweden/consent/gate";

mount(config);
installScriptGating(config);
```

When a category is granted, each of its scripts is replaced by a live `<script>` with the same
attributes, text and nonce, minus `type`; `data-consent-type` becomes the live `type`. Scripts run
one at a time in document order: an external or module script without `async` holds the ones after
it until it loads or fails, so inline code can depend on it. Scripts of a required category run at
mount; an optional category's scripts never run before the visitor grants it, and a `data-consent`
value that names no category never runs. Each script runs at most once. The document is scanned on
every consent change and on `DOMContentLoaded`; a script added later waits for the next change.

A script that has run cannot be unloaded: after a withdrawal it stays active until the page
reloads, so reload or tell the visitor if that matters. `installScriptGating` returns a function
that stops further activation.

## Google Consent Mode

Map each category to the Consent Mode v2 keys it controls, and set any key no category owns in
`extra`:

```ts
consentMode: {
  mapping: {
    necessary: ["security_storage"],
    analytics: ["analytics_storage"],
    marketing: ["ad_storage", "ad_user_data", "ad_personalization"],
  },
  extra: { functionality_storage: "granted", personalization_storage: "denied" },
},
```

The keys are `ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`,
`functionality_storage`, `personalization_storage` and `security_storage`. Each key belongs to at
most one category and may not also be in `extra`; a mapping key must name a declared category.

The Astro integration installs the adapter whenever the config has `consentMode`. On other hosts,
install it after `mount`, and before script gating if you use both, so that the `default` command
is queued before a required gated script runs:

```ts
import { mount } from "@edgesweden/consent";
import { installConsentMode } from "@edgesweden/consent/gtag";

mount(config);
installConsentMode(config);
```

On install the adapter pushes `gtag("consent", "default", …)` onto `window.dataLayer`, with the keys
of a required category `granted`, those of an optional category `denied` and `extra` as given. It
pushes `gtag("consent", "update", …)` with every mapped key whenever those values change, including
at mount when a stored choice grants a mapped category. Only the keys you list are ever set, so list
every key your tags read. The adapter does not define `window.gtag`.

Load Google's tag after the consent script, or gate it with `data-consent` so that the `default`
command is already queued when the tag starts:

```html
<script type="text/plain" data-consent="analytics" src="https://example.com/gtag.js"></script>
```

`installConsentMode` returns a function that stops further updates.

## Content Security Policy

The package works under a strict policy such as
`script-src 'self' 'sha256-…'; style-src 'self'` with nothing added:

- the core never writes a `style` attribute, `cssText` or a `<style>` element and never uses
  `innerHTML`, `eval` or `new Function`; theme values are set one at a time with
  `style.setProperty`, which `style-src` does not govern;
- the Astro integration injects a bundled module that Astro's CSP support hashes like any other
  page script, and the stylesheet is a bundled file from your origin;
- the only request the package can make is to your `record` URL, which you allow-list yourself.

Script gating cannot get around your policy. An activated external script runs only when its host
is allowed by `script-src`. Activated inline code needs its own hash or a nonce on the gated
element; without one, it needs `'unsafe-inline'`, which this package never asks for.

## Versioning

Semantic versioning. Within 0.x, a minor release may add config keys but never removes or changes
one; any breaking change to the config, the cookie format or the state API is a major release. A
size-budget increase is a CHANGELOG entry. See [`CHANGELOG.md`](CHANGELOG.md).

## Contributing

[`AGENTS.md`](AGENTS.md) is the operating contract: checks, the review requirement, branch and
commit conventions. [`docs/plan.md`](docs/plan.md) is the design and
[`docs/releasing.md`](docs/releasing.md) the release procedure. For security issues see
[`SECURITY.md`](SECURITY.md).

## Licence

MIT, see [`LICENSE`](LICENSE).
