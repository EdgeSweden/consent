# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Config schema version 1 and `validateConfig`, exported from `@edgesweden/consent/astro`. It
  collects every error with the offending key and reports contrast warnings.
- `getConsent`, `onConsent` and `withdraw` on the browser entry, the consent cookie and the
  `consent:change` event and `data-consent-<id>` attributes. They take effect once `mount` ships
  with the banner.
- Theme support: `theme.colors`, `radius`, `font`, `zIndex`, `vars` and `layout.width` become
  `--consent-*` custom properties set one at a time through `style.setProperty`, so the banner stays
  clean under a strict CSP.
- `{link:<id>}` tokens in `description` and `settingsDescription` render as links to the locale's
  `links` entries.
