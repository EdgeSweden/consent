# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Script gating at `@edgesweden/consent/gate`: `installScriptGating(config)` activates
  `<script type="text/plain" data-consent="<category>">` elements once their category is granted,
  or at mount for a required category. Each runs at most once. The `gateScripts` config key
  (default `false`) is now accepted. Budget: 1 KB gzipped.
- Google Consent Mode v2 at `@edgesweden/consent/gtag`: `installConsentMode(config)` pushes a
  `default` consent command through `window.dataLayer`, with required categories' keys granted and
  optional ones denied, and an `update` whenever the mapped values change. The `consentMode` config
  key (`mapping` and `extra`) is now accepted and validated. Budget: 1 KB gzipped.

## [0.1.0] - 2026-10-20

First release.

### Added

- Config schema version 1 and `validateConfig`, exported from `@edgesweden/consent/astro`. It
  collects every error with the offending key and reports contrast warnings.
- `getConsent`, `onConsent` and `withdraw` on the browser entry, the consent cookie and the
  `consent:change` event and `data-consent-<id>` attributes.
- `mount` and `openSettings` on the browser entry: the banner and settings dialog.
- Theme support: `theme.colors`, `radius`, `font`, `zIndex`, `vars` and `layout.width` become
  `--consent-*` custom properties set one at a time through `style.setProperty`, so the banner stays
  clean under a strict CSP.
- `{link:<id>}` tokens in `description` and `settingsDescription` render as links to the locale's
  `links` entries.
- `record`: a function receives each choice's record; a URL receives it as a JSON string through
  `sendBeacon`, falling back to a keepalive `fetch`. The body is sent as
  `text/plain;charset=UTF-8`, so the endpoint must parse it whatever the content type. Failures
  are swallowed.
- The Astro integration, the default export of `@edgesweden/consent/astro`:
  `consent({ config: "./src/consent.config.ts" })` loads the config module's default export at
  build time, fails the build on any validation error, logs warnings, and adds the stylesheet and
  one page script that calls `mount` to every page. Astro >= 5.4 is an optional peer dependency.
- A size budget of 7 KB gzipped for the browser core including the stylesheet, counting every file
  the entry loads, enforced in CI.
- Releases are published from a version tag with npm provenance.

[Unreleased]: https://github.com/EdgeSweden/consent/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/EdgeSweden/consent/releases/tag/v0.1.0
