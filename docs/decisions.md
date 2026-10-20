# Decisions

Append-only. Never rewrite an existing decision; append a superseding one.

Format: `YYYY-MM-DD - <decision, stated as a fact, one sentence> - <why/trigger> (decision #N, plan: <section>)`

---

- 2026-10-20 - The package is published as `@edgesweden/consent` from the public repository `EdgeSweden/consent` under the MIT licence - set in the plan (decision #1, plan: What this is)
- 2026-10-20 - The default cookie name is `consent` - set in the plan (decision #2, plan: What this is)
- 2026-10-20 - The default layout is blocking with a dimmed backdrop - set in the plan (decision #3, plan: Config)
- 2026-10-20 - Astro is the only framework integration in v1; any other host uses `mount()` directly - set in the plan (decision #4, plan: Out of scope for v0.x)
- 2026-10-20 - Work is delivered in review-gated packages tracked in `docs/progress.md`; an independent review is required before merge and verification evidence lives in the pull request, not in a separate log - keeps the review requirement without extra documents to maintain (decision #5)
- 2026-10-20 - Commits follow Conventional Commits; `main` has a linear history of squash-merged pull requests; releases are tags `vX.Y.Z` - readable history for a public repository and a mechanical link between commit type, semver bump and CHANGELOG (decision #6, plan: Releases)
- 2026-10-20 - `zod` ^4 is a regular dependency, imported only by `./astro` and `validateConfig` - the plan's schema-first validation needs it; approved for P1.1 (decision #7, plan: Validation, Repository layout)
- 2026-10-20 - Config colours are validated against a supported subset (hex, `rgb()`/`rgba()`, `hsl()`/`hsla()`, named colours, `transparent`); any other value fails validation - build-time contrast needs sRGB values without a browser or a colour dependency (decision #8, plan: Validation)
- 2026-10-20 - The default colour tokens are a TypeScript constant that the stylesheet must match; contrast is checked on config colours merged over the defaults, a translucent colour in a checked pair is a "cannot check" warning, and the custom property of colour token `fooBar` is `--consent-foo-bar` - the contrast rule needs defaults before the stylesheet exists (decision #9, plan: Validation, Config)
- 2026-10-20 - `validateConfig(input)` returns `{ ok, config?, errors, warnings }` with every error as `{ path, message }`, collects all errors rather than stopping at the first, and is exported from `./astro` - keeps zod out of the browser entry without a new export (decision #10, plan: Validation)
- 2026-10-20 - `cookie.maxAgeDays` is an integer 1–400, `cookie.name` an RFC 6265 token, `cookie.path` starts with `/`, `cookie.domain` is a hostname, `theme.zIndex` an integer, locale keys are non-empty, and `width`, `radius`, `font` and `vars` values are non-empty strings - the plan left these fields unconstrained (decision #11, plan: Validation)
- 2026-10-20 - A locale link `href` is a root-relative path, an absolute `http(s)` URL or a `#fragment`; anything else fails - keeps `javascript:` and `data:` links out of the banner (decision #12, plan: Validation)
- 2026-10-20 - The maintainer starts every review and re-review in a separate session; an implementer never launches or messages a reviewer, and an implementer-initiated review does not count - keeps the review independent of the implementing session (decision #13)
- 2026-10-20 - `locale`, service ids, service cookie names, link ids and link labels are non-empty strings - an empty link label leaves an unnamed link and an empty id cannot be referenced; maintainer delegated the call (decision #14, plan: Validation)
- 2026-10-20 - A stored consent cookie is valid only when `v` is `1`, `p` is a string, `t` a finite number and `c` an object of booleans, otherwise it is treated as absent; when several cookies share the name the first in `document.cookie` is read, and a required category stored as `false` is reported granted without making the cookie stale - the plan said only "unparseable is absent"; approved for P1.2 (decision #15, plan: Cookie, Required categories)
- 2026-10-20 - `consent:change` is dispatched only on a change, never at mount; the `data-consent-<id>` attributes carry the initial state - a mount-time event would look like a choice to a DOM consumer; approved for P1.2 (decision #16, plan: State API)
- 2026-10-20 - Before mount, `getConsent()` returns `null` and `withdraw()` is a no-op - there is no config to act on; approved for P1.2 (decision #17, plan: State API)
- 2026-10-20 - Consent state is a module singleton: `mount` returns `void`, and a second call is a no-op whichever document it is given - one state per page backs the document-free state API; approved for P1.2 (decision #18, plan: Mount)
