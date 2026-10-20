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
