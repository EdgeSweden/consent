# Progress

One line per package. No scope, no build notes, no decisions; those live in `plan.md`, the pull
request and `decisions.md`.

```text
[ ] not started   [~] in progress; annotate the state   [x] reviewed and accepted
```

Tier in parentheses. One `[~]` at a time.

---

## Phase 0

- [x] (A) P0 - Repository tooling: package.json, tsup, vitest, eslint, prettier, size-limit, Playwright; CI green on an empty package (plan: Repository layout, CI)

## Phase 1: core + Astro integration, v0.1.0

- [x] (A) P1.1 - Config schema + validateConfig, one test per rule (plan: Config, Validation)
- [ ] (A) P1.2 - Cookie codec + state machine + state API + DOM mirror (plan: Cookie, Action semantics, State API)
- [ ] (A) P1.3 - Banner + settings dialog: DOM, focus, blocking and non-blocking, positions (plan: Runtime behaviour, Accessibility)
- [ ] (A) P1.4 - Theme + locale resolution + link tokens, CSP-clean (plan: Config, Locale resolution, CSP)
- [ ] (A) P1.5 - Record hook: function and URL forms (plan: Record)
- [ ] (B) P1.6 - Astro integration: build-time validation, virtual module, injected script (plan: Astro integration)
- [ ] (B) P1.7 - Demo site + e2e suite with axe and CSP assertions (plan: Demo, Tests)
- [ ] (A) P1.8 - Size budget, release workflow, README, CHANGELOG, tag v0.1.0 (plan: Size budget, Releases)

## Phase 2: adapters, v0.2.0

- [ ] (A) P2.1 - Script-gating adapter + `gateScripts` key (plan: Script gating, Version boundary)
- [ ] (A) P2.2 - Consent Mode v2 adapter + `consentMode` key (plan: Google Consent Mode v2)
- [ ] (B) P2.3 - Conditional adapter imports in the integration, demo and README updates, tag v0.2.0 (plan: Astro integration, Demo)
