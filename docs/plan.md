# @edgesweden/consent — implementation plan

> **Status: DRAFT (2026-10-20).** Planning document for the first releases of `@edgesweden/consent`.
> No code exists yet; this plan is the contract the first implementation is reviewed against.

## What this is

A reusable, config-driven cookie-consent banner for static and server-rendered websites:

- a **framework-agnostic core** (vanilla TypeScript + one stylesheet) exposed as `mount(config)`;
- a **thin Astro integration** that validates the config at build time and injects one script;
- two optional **adapters**, each a separate entry point: declarative script gating and a
  Google Consent Mode v2 bridge;
- an optional, identifier-free **consent record** hook (a site-supplied function or URL);
- **no backend** of any kind. Everything is a per-site config file.

Published as a public npm package from the public repository `EdgeSweden/consent`, MIT licence.
Default cookie name `consent`.

## Principles

1. **Nothing optional before a choice.** The package sets no cookie, touches no storage and makes
   no request of its own until the visitor presses a button; reading the existing consent cookie is
   the only pre-choice I/O. Services in a _required_ category are the one exception by definition:
   they are granted from mount, so a gated required script runs and a required Consent Mode key
   starts `granted` before any choice. Optional services never do.
2. **Reject is as easy as accept.** The first layer always shows Accept all and Reject all with equal
   prominence; it cannot be configured away. Closing without a choice is never consent. In blocking
   mode there is no way to dismiss the banner: no close control, Escape is ignored, clicks on the
   backdrop are ignored, and the rest of the page is inert. In non-blocking mode a close control means
   "decide later" (nothing stored, banner returns on the next page), never reject.
3. **Strict-CSP clean.** No authored `style=""` attributes, no `setAttribute("style", …)`, no
   `style.cssText`, no `<style>` injection, no `eval`, no HTML in strings. Theme values become CSS
   custom properties applied one at a time through `element.style.setProperty`; the browser
   serialises these into the element's style attribute, but property-level CSSOM mutation is not
   governed by `style-src`. The stylesheet ships as a bundled asset. Works under Astro's hashed
   per-page CSP with no policy change.
4. **Config is the contract.** A versioned, validated config object. Unknown keys fail the build. New
   keys are additive within a major version. No runtime fetch of config.
5. **No framework in the core.** `mount(config)` on a `Document`; the Astro integration only bundles
   the config and injects one script.
6. **Small.** Core + stylesheet ≤ 7 KB gzipped (decision #34); the Consent Mode and gating adapters are separate
   entry points so a site pays only for what it imports.
7. **Accessible by default.** WCAG 2.1 AA: dialog semantics, focus management, keyboard-complete,
   reduced-motion aware, visible focus. Colour contrast is a config responsibility; the integration
   checks it at build time.
8. **Locale-neutral.** All visitor-facing strings are supplied per locale in the config; the package
   ships no default copy. A single-language site, a bilingual site and a multilingual site must all
   work without a package change.

## Config (schema version 1)

```ts
export interface ConsentConfig {
  schemaVersion: 1;
  /** Bump to re-prompt every visitor (policy text, categories or services changed materially). */
  policyVersion: string;                      // ≤ 32 chars, e.g. "2026-10"
  cookie?: {
    name?: string;                            // default "consent"
    maxAgeDays?: number;                      // default 365; applies to accept and reject alike
    domain?: string;                          // default: host-only
    path?: string;                            // default "/"
  };
  defaultLocale: string;                      // used when <html lang> matches no entry
  locale?: string;                            // override; default document.documentElement.lang
  categories: Array<{
    id: string;                               // ^[a-z][a-z0-9_-]{0,31}$ ; nothing is implied
    required?: boolean;                       // shown locked-on; never toggleable
    services?: Array<{ id: string; cookies?: string[] }>;   // ids only; names/descriptions per locale
  }>;
  locales: Record<string, LocaleStrings>;     // see below
  layout?: {
    position?: "bottom-left" | "bottom-right" | "bottom-center" | "top-left" | "top-right" | "top-center" | "center";
    backdrop?: "dim" | "none";                // default "dim"
    blocking?: boolean;                       // default true; requires backdrop "dim"
    width?: string;                           // CSS length, default "min(28rem, calc(100vw - 2rem))"
    settingsPosition?: "center";              // the preferences dialog; v1 has one placement
  };
  theme?: {
    colors?: Partial<Record<ThemeColor, string>>;   // any CSS color
    radius?: { box?: string; button?: string; control?: string };
    font?: string;                            // CSS font-family; default inherits
    zIndex?: number;                          // default 2147483000
    vars?: Record<`--consent-${string}`, string>;   // escape hatch; may not name a `colors` token
  };
  validation?: {
    strictContrast?: boolean;                 // contrast failures fail the build; default false
  };
  buttons?: {
    settings?: boolean;                       // show "Settings" on the first layer; default true
    order?: Array<"acceptAll" | "rejectAll" | "settings">;   // an exact permutation, see validation
  };
  record?: ConsentRecorder | string;          // function, or a URL for the built-in bare-object sender
  // --- adapter keys: added in v0.2.0; rejected as unknown keys by v0.1.x (see Version boundary) ---
  consentMode?: {                             // Google Consent Mode v2 adapter (entry "./gtag")
    mapping: Record<string, GtagConsentKey[]>;   // category id → gtag keys
    extra?: Partial<Record<GtagConsentKey, "granted" | "denied">>;   // keys outside any category
  };
  gateScripts?: boolean;                      // script-gating adapter (entry "./gate"); default false
}

type ThemeColor =
  | "background" | "text" | "muted" | "link" | "border" | "backdrop" | "focus"
  | "acceptBackground" | "acceptText" | "rejectBackground" | "rejectText"
  | "settingsBackground" | "settingsText" | "saveBackground" | "saveText"
  | "toggleOn" | "toggleOff" | "toggleKnob";

interface LocaleStrings {
  title: string;
  description: string;                        // plain text; may contain {link:<id>} tokens
  acceptAll: string; rejectAll: string; settings: string; save: string; close: string;
  alwaysActive: string;                       // label on required categories
  settingsTitle: string; settingsDescription?: string;
  dialogLabel?: string;                       // aria-label fallback when title is decorative
  links?: Array<{ id: string; label: string; href: string }>;   // policy links; hrefs are per locale
  categories: Record<string, { name: string; description: string }>;   // one per category id
  services?: Record<string, { name: string; description?: string }>;
}
```

The config implies nothing: there is no built-in "necessary" row. A site that wants one declares a
category with `required: true`. A config with no required category is valid.

## Validation

Runs at build time in the Astro integration and is exported as `validateConfig` for other hosts.
Every rule below has a test. A failure names the offending key.

- `schemaVersion` is `1`; `policyVersion` is 1–32 characters.
- Category ids match `^[a-z][a-z0-9_-]{0,31}$` and are unique; service ids are unique across all
  categories.
- At least one optional (non-required) category exists. A config with none has nothing to consent
  to and fails.
- `defaultLocale` is a key of `locales`.
- Every category id and every declared service id has strings in every locale. A
  `categories`/`services` string key that matches no declared id fails, so a typo cannot silently
  leave a row unlabelled.
- Every `{link:<id>}` token in `description` and `settingsDescription` resolves to a `links` entry
  of the same locale.
- `buttons.order`, when given, is an exact permutation of the resolved button set: `acceptAll` and
  `rejectAll` exactly once each; `settings` exactly once when the resolved `buttons.settings` is not
  `false` (the default is `true`) and absent when it is `false`. An omission, duplicate or unknown
  entry fails, so the mandatory choices cannot be configured away. When `buttons.order` is omitted
  the order is `["acceptAll", "rejectAll", "settings"]` with `settings` dropped if disabled.
- `layout.blocking: true` requires `layout.backdrop: "dim"`.
- Every `theme.colors` value parses as a CSS colour.
- Contrast of `text` on `background`, and of each button's text on its background, is ≥ 4.5:1.
  A failure is a warning by default; `validation.strictContrast: true` makes it fail the build.
- `theme.vars` is rejected when a key is the custom property of a `colors` token, so the escape
  hatch cannot bypass the contrast check.
- Each gtag key in `consentMode.mapping` belongs to at most one category; a key listed twice, or in
  both `mapping` and `extra`, fails.
- `record`, when a string, is a root-relative path (`/…`) or an absolute `http(s)` URL; any other
  scheme or a scheme-relative URL fails.
- Unknown keys fail at every level.

The schema is written once (zod) and the TypeScript types are derived from it, so the interface
above and the runtime check cannot drift.

## Runtime behaviour

### Mount

`mount(config, document?)` reads the consent cookie. The banner is shown when there is no cookie,
when the stored `policyVersion` differs, or when the stored category set differs from the config
(a category added or removed). Any mismatch means **no consent**: consumers see every optional
category denied until a new choice. Otherwise the banner stays hidden and consumers get the stored
state immediately.

Mount is idempotent: a second call on the same document is a no-op and does not fire a second
initial callback.

### Required categories

Categories with `required: true` are **always granted**: before any choice, after Reject all, after
a withdrawal and on a stale cookie alike. They render locked-on in the settings dialog (labelled with
`alwaysActive`), are stored as `true` in the cookie, are reported as granted by `getConsent()`,
`onConsent`, the `data-consent-<id>` attributes, script gating and the Consent Mode mapping, and are
excluded from the "every optional category" rules in this document.

### Cookie

URL-encoded JSON: `{"v":1,"p":"<policyVersion>","t":<unix seconds>,"c":{"<id>":true|false,…}}`.
Attributes: `Max-Age` from `cookie.maxAgeDays`, `SameSite=Lax`, `Secure` when served over https,
`Path` and `Domain` from config (default `/`, host-only). A rejection is stored the same way so the
visitor is not asked again; storing the refusal is strictly necessary. An unparseable cookie is
treated as absent.

### Choice

Accept all / Reject all on the first layer; the settings dialog has one switch per non-required
category, Save, and Accept all / Reject all. A state-establishing or state-changing choice writes
the cookie, dispatches the change, records (if configured) and closes. A no-op (defined below) only
closes.

### Action semantics

The `action` reported to the recorder is derived from the transition, not from the button pressed:

| Action       | Condition                                                               |
| ------------ | ----------------------------------------------------------------------- |
| `accept_all` | every optional category ends granted                                    |
| `reject_all` | every optional category ends denied and none was granted before         |
| `withdraw`   | every optional category ends denied and at least one was granted before |
| `custom`     | any other mix                                                           |

"Before" means the valid stored choice, if any. With no valid stored choice (first visit, stale
policy or changed category set) every control is a first decision and is always written and
recorded; saving untouched switches on a first visit is a `reject_all`.

A **no-op** is only: a valid stored choice exists and the resulting optional state is identical to
it. Then nothing is written or recorded and the dialog just closes.

`withdraw()` with nothing granted before is a no-op when a valid stored choice exists and a
`reject_all` otherwise. Every transition is tested, including first-visit Save = `reject_all` and
accepted → reopen → all switches off → Save = `withdraw`.

### State API (`@edgesweden/consent`)

- `getConsent(): ConsentState | null` — the current state, or `null` before mount.
- `onConsent(cb)` — subscribes to consent state. A subscriber registered **before** mount is
  called once during mount with the initial state; a subscriber registered **after** mount is
  called immediately with the current state. Either way it is then called on every change. It is
  never called from the cookie alone before mount; this is what lets a consumer arm itself on the
  callback rather than on the cookie. Mount idempotency never suppresses a new subscriber's
  initial call. Returns an unsubscribe function.
- `openSettings()` — opens the preferences dialog.
- `withdraw()` — sets every optional category to denied; what it records, if anything, follows the
  action semantics above.

DOM mirror for non-bundled consumers: a `document` event `consent:change` with the state in
`detail`, and `data-consent-<id>="granted|denied"` attributes on `<html>` for CSS hooks. Any element
with `data-consent="open"` reopens the settings dialog (click delegation; no component needed).

`ConsentState` is `{ categories: Record<string, boolean>; policyVersion: string; locale: string;
at: number | null }` where `at` is the stored timestamp or `null` when no valid choice exists.

### Locale resolution

`config.locale` → `<html lang>` → `lang` without region (`sv-SE` → `sv`) → `defaultLocale`. Strings
are rendered as text nodes; `{link:<id>}` tokens become `<a>` elements. The resolved locale is never
empty and is included in every record.

### No visual flash

The stylesheet is imported by the core bundle; the banner is created on mount and hidden until
layout is applied. There is no server-rendered markup, so nothing can show without the script, and
nothing can be stored without the script.

## Accessibility

- The banner is `role="dialog"` with `aria-labelledby` the title (or `aria-label` from `dialogLabel`
  when the title is decorative), and `aria-modal="true"` in blocking mode.
- Focus moves to the dialog on open and returns to the opener on close. Tab cycles inside the dialog
  while blocking.
- Escape closes the settings dialog (returning to the banner if it was the opener) and does nothing
  on a blocking banner, as do clicks and taps on the backdrop.
- Blocking mode applies `inert` to sibling content while open and removes it on close.
- Switches are native checkboxes styled as toggles; no `role="switch"` is needed.
- Buttons are real `<button>` elements with visible text; the focus ring uses the `focus` theme
  colour and is never removed.
- Animations respect `prefers-reduced-motion`.
- The backdrop is not focusable and is hidden from assistive technology.

## CSP

The package must work under a strict policy such as `script-src 'self' 'sha256-…'; style-src 'self'`
with no additions:

- no authored `style=""` attributes, no `setAttribute("style", …)`, no `cssText`, no `<style>`
  elements; each theme value is applied individually through `style.setProperty` on the banner's
  root element, which CSP permits even though the browser serialises the result into a style
  attribute;
- no inline scripts; the Astro integration injects a bundled module that Astro's own CSP support
  hashes like any other page script;
- no `eval`, `new Function`, `innerHTML` or `insertAdjacentHTML`;
- no fetches except the optional record URL, which the site allow-lists itself.

Documented limit for script gating: under a hashed or strict CSP only external scripts whose host is
allow-listed can run this way; gated inline code needs its own hash or `'unsafe-inline'`.

## Adapters

Both adapters are separate entry points with the same shape: `install(config)` returns a disposer and
subscribes through the core's `onConsent`, so an adapter is just another consumer. Neither is
imported by the core. Script gating ships at `./gate`, Consent Mode at `./gtag`.

### Version boundary

- **v0.1.x:** the schema has no `gateScripts` and no `consentMode` key. Because unknown keys fail,
  a config that names either fails validation with a message pointing at the version that adds it.
  The `./gate` and `./gtag` entries do not exist.
- **v0.2.0:** adds both keys additively to schema version 1 (no bump; a v0.1 config stays valid),
  ships both entries, and teaches the Astro integration to include them conditionally.
  `gateScripts` defaults to `false` so that upgrading cannot activate behaviour a site did not ask
  for.

### Script gating (`@edgesweden/consent/gate`, `gateScripts: true`)

`installScriptGating(config)`: on each grant, every `<script type="text/plain" data-consent="<id>">` whose category is granted is
replaced once by a live script with the same `src`, attributes and text. A script is never run twice,
and a script whose category is denied is left untouched. Required categories are processed at mount.

### Google Consent Mode v2 (`@edgesweden/consent/gtag`)

`installConsentMode(config)` pushes `gtag("consent","default", …)` at mount with every key of an
optional category `denied`, every key of a required category `granted` and `extra` as configured,
then `gtag("consent","update", …)` per the mapping on every change, through `window.dataLayer`.
Each key is owned by one category (validated), so there is no precedence to resolve. The site must
load its tag after the consent script or gate it; documented with an example.

### Record (`record`)

```ts
type ConsentRecorder = (record: ConsentRecord) => void | Promise<void>;
interface ConsentRecord {
  action: "accept_all" | "reject_all" | "custom" | "withdraw";
  categories: Record<string, boolean>;
  policyVersion: string;
  packageVersion: string;
  locale: string;
  at: number;                                 // unix seconds
}
```

Called after each state-establishing or state-changing choice. A function recorder owns its
transport and payload shape, which is how a site adapts the record to an endpoint of its own. The
built-in string form posts the bare object as JSON via `sendBeacon` (fallback `fetch` with
`keepalive`). The **payload** carries no identifier, user agent or page; the HTTP request itself
still carries whatever the browser attaches (IP, user agent, referrer, same-origin cookies), which
is the receiving site's concern and is documented. Failures are swallowed and never surface to the
visitor.

### Astro integration (`@edgesweden/consent/astro`)

```ts
import consent from "@edgesweden/consent/astro";
export default defineConfig({ integrations: [consent({ config: "./src/consent.config.ts" })] });
```

The integration imports the config module at build time, runs `validateConfig`, fails the build on
error, exposes the config through a virtual module, and injects one `page` script that calls
`mount`. From v0.2.0 the injected script is generated per config: it imports `./gate` only when
`gateScripts` is `true` and `./gtag` only when `consentMode` is present, and calls each adapter's
`install` after `mount`. A site that uses neither ships neither byte. Nothing is added to layouts
or pages.

## Repository layout

```
consent/
  package.json            name, exports ("." core, "./astro", "./styles.css"; v0.2 adds "./gate", "./gtag"), sideEffects
  src/core/               mount, state, cookie, banner, settings, record, i18n, theme
  src/astro/              integration (injectScript "page" + virtual module for the config), validateConfig
  src/gate/               script-gating adapter (v0.2)
  src/gtag/               Consent Mode adapter (v0.2)
  src/styles.css          custom-property driven; prefix `consent-`
  test/                   vitest + happy-dom (see Tests)
  examples/astro/         neutral demo site (see Demo)
  .github/workflows/      ci.yml, release.yml
  .github/PULL_REQUEST_TEMPLATE.md
  AGENTS.md               operating contract: checks, tiers, review, branches and commits
  docs/plan.md            this document
  docs/decisions.md       append-only durable decisions
  docs/progress.md        package board
  README.md  CHANGELOG.md  LICENSE  SECURITY.md
```

Build: `tsup` to ESM only, `.d.ts` emitted, CSS copied. `engines.node >= 22`. TypeScript strict +
`noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. Dependency metadata is package-level,
so it is declared with that in mind: Astro is an optional peer dependency (`>= 5`,
`peerDependenciesMeta.optional: true`) that only the `./astro` entry imports at runtime; zod is a
regular dependency, installed for every consumer, but imported only by the `./astro` and
`validateConfig` code paths and never bundled into the `.`, `./gate` or `./gtag` entries. The browser bundles
therefore have zero runtime dependencies, which the size budget verifies.

## Demo (`examples/astro/`)

A neutral Astro site that exists to exercise and document the package, with no reference to any
real site, brand or endpoint:

- two locales (`en`, `sv`) selected by `<html lang>`, with a language switch;
- one required category and two optional categories, each with at least one service;
- a gated `<script type="text/plain" data-consent="…">` per optional category (pointing at a local
  file) and one for the required category;
- the Consent Mode adapter with a stub `dataLayer` rendered on the page so the pushed entries are
  visible;
- a reopen control (`data-consent="open"`) in the footer and a `withdraw()` button;
- a `record` function that appends records to a visible list on the page;
- a strict CSP set through Astro's CSP support, so a violation shows in the console and in e2e.

The demo build is kept as a CI artifact only; no public hosting is required for v0.x.

## Tests

### Unit (vitest + happy-dom, `test/`)

- **Config validation:** one test per rule in the Validation section, positive and negative.
- **Cookie codec:** encode/decode round trip, unparseable and foreign cookies treated as absent,
  `Secure` only on https, domain and path propagation.
- **Re-prompt matrix:** no cookie, same version, changed `policyVersion`, added category, removed
  category, unparseable cookie → shown/hidden and state reported.
- **State machine:** every transition in Action semantics, including first-visit Save =
  `reject_all`, accepted → all off → Save = `withdraw`, `withdraw()` both with and without a prior
  grant, and the no-op path writing nothing.
- **Required categories:** granted before any choice, after Reject all, after `withdraw()` and on a
  stale cookie; stored as `true`; locked in the dialog.
- **Nothing optional before a choice:** zero cookie writes, zero storage access, zero `fetch` and
  `sendBeacon` calls, and no gated optional script activated before a button is pressed.
- **Required services at mount:** a required gated script is activated and a required Consent Mode
  key is `granted` in the `default` push before any choice (a separate test from the one above).
- **Callbacks:** a pre-mount `onConsent` subscriber fires once during mount; a post-mount
  subscriber fires immediately with the current state; each then fires once per change and never
  from the cookie alone before mount; a second `mount` does not double-fire existing subscribers
  and does not block a new subscriber's initial call; unsubscribe works.
- **Script gating:** attributes and text preserved, each script activated once, denied scripts
  untouched.
- **Consent Mode:** `default` and `update` payloads for a mapping with required, optional and
  `extra` keys.
- **Record:** payload shape, `locale` always present, URL mode uses `sendBeacon` then `fetch`,
  failures swallowed, no record on a no-op.
- **Theme:** custom properties set through `style.setProperty` only; `setAttribute("style", …)`
  and `style.cssText` are never used (asserted by spying on both, since browsers serialise
  `setProperty` into the `style` attribute and an empty-attribute check would be wrong); `vars`
  applied, `zIndex` applied. The CSP guarantee itself is held by the zero-violation e2e assertion.
- **A11y attributes:** `role`, `aria-modal`, `aria-labelledby`/`aria-label`, `inert` on siblings
  while blocking, focus target on open and return on close.
- **Locale resolution:** each step of the fallback chain.

### End-to-end (Playwright + axe, run against the demo)

- Keyboard-only path through accept, reject, settings, save and reopen.
- Focus trap in blocking mode; Escape and backdrop click do nothing on a blocking banner; Escape
  closes the settings dialog and returns focus.
- Non-blocking mode: close control stores nothing and the banner returns on the next page.
- No storage and no request for an optional service before a choice (network and cookie assertions).
- The required gated script runs and the required Consent Mode key is `granted` before a choice.
- Cookie contents after each kind of choice; re-prompt after `policyVersion` bump.
- Reopen from the footer control and `withdraw()`; the record list shows the expected `action`.
- Locale switch changes every string; `{link:<id>}` renders as a link.
- Reduced motion: no transitions when `prefers-reduced-motion: reduce`.
- axe with no violations in each state: fresh banner, settings dialog open, after reject, after
  accept. Because axe skips inert content, the page outside the banner is audited after a choice.
- Zero CSP violations in the console across the whole run.

## CI (`.github/workflows/ci.yml`)

On every push and pull request: install (pnpm, lockfile frozen), `type-check`, `test`, `build`,
size budget, build the demo, e2e. Node 22. The size step fails the job when any budget below is
exceeded. The demo build is uploaded as an artifact.

## Size budget

Measured on the built ESM after gzip, enforced in CI with `size-limit`:

| Entry                       | Budget       |
| --------------------------- | ------------ |
| `.` (core incl. stylesheet) | 7 KB         |
| `./gate` (v0.2)             | 1 KB         |
| `./gtag` (v0.2)             | 1 KB         |
| `./astro` (build-time only) | not budgeted |

The budget is part of the public contract: raising it is a CHANGELOG entry.

## Releases (`.github/workflows/release.yml`)

- Semantic versioning. Within `0.x`, minor bumps may change the config schema only additively;
  any breaking change to the config, the cookie format or the state API bumps the major.
- A version tag (`vX.Y.Z`) on `main` runs the full CI job, then publishes to npm with provenance
  (`npm publish --provenance`) using trusted publishing; no long-lived token is stored.
- `CHANGELOG.md` follows Keep a Changelog; the release job refuses a tag whose version has no
  entry.
- `packageVersion` in records is injected at build time from `package.json`.
- A bad release is fixed forward with a new patch; published versions are never unpublished.

## Package slices

Each slice is reviewed and released on its own.

- **P1 — core + Astro integration, v0.1.0.** Config schema and validation, state machine, cookie,
  banner, settings dialog (blocking and non-blocking, every position), theme, locale resolution,
  reduced motion, record hook, the integration, the full unit suite and every non-adapter e2e
  listed above, the demo without adapters, CI, size budget, release workflow, README with the
  config reference and the CSP limits.
- **P2 — adapters, v0.2.0.** Script gating and Consent Mode v2 with their unit tests and e2e,
  demo updated, README sections.

## Out of scope for v0.x

- Per-visitor consent logs or any server component.
- Global Privacy Control handling (reserved config key `gpc`, planned for a later minor).
- TCF / IAB strings; programmatic advertising needs a different tool.
- Server-rendered banner markup.
- Framework integrations other than Astro; the core is usable from any host via `mount`.
- A visual editor or hosted config.

## Open questions

None blocking. Decisions taken so far: package name `@edgesweden/consent`, repository
`EdgeSweden/consent`, MIT licence, default cookie name `consent`, blocking + dimmed as the default
layout, Astro as the only v1 framework integration.
