# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Changed

- The size budget of the browser core including the stylesheet is 7 KB gzipped (was 6 KB), and it
  now counts every file the entry loads.
