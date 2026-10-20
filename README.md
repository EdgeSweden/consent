# @edgesweden/consent

A config-driven cookie-consent banner for static and server-rendered websites.

- Framework-agnostic core in vanilla TypeScript with one stylesheet, exposed as `mount(config)`
- Thin Astro integration that validates the config at build time and injects one script
- Optional adapters as separate entry points: declarative script gating and Google Consent Mode v2
- Optional, identifier-free consent record hook
- No backend; everything is a per-site config file
- Works under a strict Content Security Policy without policy changes
- Nothing optional happens before the visitor chooses, and Reject all is as easy as Accept all

**Status: in development, not yet published.** The design is in [`docs/plan.md`](docs/plan.md)
and progress is tracked in [`docs/progress.md`](docs/progress.md).

## Contributing

[`AGENTS.md`](AGENTS.md) is the operating contract: checks, the review requirement, branch and
commit conventions. For security issues see [`SECURITY.md`](SECURITY.md).

## Licence

MIT, see [`LICENSE`](LICENSE).
