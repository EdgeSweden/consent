# @edgesweden/consent

A config-driven cookie-consent banner for static and server-rendered sites: a vanilla TypeScript
core, an Astro integration and two optional adapters. No backend. Published to npm from this
public repository under the MIT licence. `docs/plan.md` describes what is being built.

This file is the operating contract for anyone, human or agent, working in this repository.

## Core principle

Work lands in small, reviewable packages. A package is not done when the code is written. It is
done when the checks have run, the evidence is in the pull request and an independent review has
passed.

## Authority order

When instructions conflict:

1. Hard invariants in this file.
2. The latest applicable entry in `docs/decisions.md`.
3. `docs/plan.md`.
4. Existing repository conventions.
5. Implementer preference.

If two authorities conflict, stop the affected work, name the conflict and propose the smallest
documentation fix. Do not pick one silently.

## Checks

Checks are referred to by name here, in CI and in review. The names are fixed; the commands are
`package.json` scripts, wired in Phase 0.

| Name | Command | Runs |
|---|---|---|
| `check:types` | `pnpm type-check` | `tsc --noEmit` over `src`, `test` and `examples` |
| `check:lint` | `pnpm lint` | eslint, including rules that ban the DOM and style APIs listed under CSP in the plan |
| `check:format` | `pnpm format:check` | `prettier --check .` |
| `check:test` | `pnpm test` | `vitest run` |
| `check:deps` | `pnpm audit --prod --audit-level=high` | known vulnerabilities in runtime dependencies |
| `check:build` | `pnpm build` | `tsup`, emits `dist/` |
| `check:size` | `pnpm size` | `size-limit` against the budgets in the plan |
| `check:e2e` | `pnpm test:e2e` | Playwright + axe against the built demo |

Run the relevant subset while working. Run everything before asking for review and list the
results in the pull request. If a check could not be run locally, say so in the pull request; CI
is the fallback, not a substitute for saying so.

## Tiers

Every package has a tier. The tier decides how much process it gets.

**Tier A: load-bearing.** Anything that touches:

- what happens before the visitor has chosen: cookie writes, storage, network, activating an
  optional script (plan: Principles, 1);
- the first layer's Accept all / Reject all parity and blocking-mode non-dismissability (plan:
  Principles, 2);
- CSP cleanliness of the browser bundles: any style, script or HTML-string API in `src/core`,
  `src/gate` or `src/gtag` (plan: CSP);
- a public contract: config schema and validation rules, cookie format, state API and DOM mirror,
  record payload, package `exports`, size budgets;
- action semantics: what is stored and recorded for each transition;
- dependencies: adding one, or moving zod or Astro out of their build-time-only position;
- releasing: `release.yml`, versioning, the CHANGELOG gate.

Tier A packages are vertical and independently testable. Never ship a partial privacy or
security mechanism that looks complete from the outside. Before implementing a Tier A package,
confirm the plan settles its contract; if something is unsettled, write it down (a draft pull
request description is enough) and get the maintainer's go-ahead first.

**Tier B: ordinary capability.** Integration plumbing, the demo, docs tooling, CI; nothing on the
Tier A list.

**Tier C: local and reversible.** Copy, styling, small refactors. Acceptance criteria in the
task, implement, run the relevant checks, self-review. Still lands through a pull request.

When unsure, pick the higher tier only if the change actually touches a Tier A surface. If a
review finds Tier A risk in a Tier B package, reclassify and apply the stronger protocol.

## Board

`docs/progress.md` is the board: one line per package, nothing else.

```text
[ ] not started   [~] in progress; annotate the state   [x] reviewed and accepted
```

Row: `- [ ] (A) P1.1 - Config schema + validateConfig (plan: Config, Validation)`

One `[~]` at a time. Do not start the next package before the current one is accepted unless the
maintainer says so.

## Roles

Keep these separate even when one person supervises everything.

- **Maintainer** (the repository owner): approves Tier A plans, resolves durable decisions,
  merges and tags.
- **Implementer**: builds one package, runs the checks, writes the pull request. Does not declare
  the package done and does not approve the review.
- **Reviewer**: reviews from a code-review stance and performs the handoff below.

## Review

Review is required before any package merges.

**Hard invariant: the review runs in a session, agent or person that did not write the code.**
An implementer reviewing their own work is not a review.

Findings lead the review, ordered by severity:

- **P1** blocks merge: privacy leakage, any optional I/O before a choice, a CSP violation, a
  broken acceptance criterion, a hard invariant violation, data loss.
- **P2** normally blocks merge: a concrete correctness, reliability or error-handling defect
  with a realistic failure scenario.
- **P3** advisory: simplification, naming, docs.

Every P1/P2 states the location, the violated requirement, a concrete failure scenario, the
smallest safe fix and the regression test needed. Uncertain concerns go under `Questions`, not
findings. Do not report what `check:lint` or `check:format` already enforce.

Re-review is targeted: the previous P1/P2 findings, the code changed for them and the directly
affected regression surfaces. A full re-review is only warranted when the fix changed
architecture, a data shape or a public contract.

### Handoff when the review passes

The reviewer, not the implementer:

1. marks the row `[x]` in `docs/progress.md`;
2. proposes the exact squash-commit subject in the format below;
3. leaves the merge to the maintainer.

Any substantive change after this point needs targeted review again before merge.

## Branches and commits

`main` is always releasable and has a linear history. Work happens on short-lived branches named
`<type>/<slug>` (`feat/config-schema`, `fix/focus-return`), lands through a pull request and is
squash-merged, so `main` holds one commit per package. Rebase a branch on `main` rather than
merging `main` into it. Releases are tags `vX.Y.Z` on `main`.

Agents treat git as read-only by default: status, diff, log and blame are fine; commit, branch,
push, tag, stage and stash only when explicitly asked.

Commits follow Conventional Commits:

```text
<type>(<scope>): <summary>

<body: why this change, what a reader cannot get from the diff>

<footer>
```

- **type**: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `revert`.
- **scope**: `core`, `astro`, `gate`, `gtag`, `demo`, `release`; omit for repository-wide changes.
- **summary**: imperative mood, lower case, no trailing period, 72 characters or fewer.
- **body**: optional; wrapped at 72; explains why, never restates the diff. Cite the plan by
  section heading when it helps (`Plan: Action semantics`).
- **footer**: `BREAKING CHANGE: <what breaks and how to migrate>` together with `!` after the
  scope for any break of the config, cookie format or state API; `Closes #<n>` for issues.
- `feat` is a minor bump, `fix` a patch, `!` a major; `CHANGELOG.md` and the version tag follow.
- The committer is accountable for every commit regardless of what tools helped write it.
  Tool-emitted trailers such as `Co-Authored-By` are allowed, not required. The independent
  review above is what guarantees quality, not the absence or presence of a trailer.

```text
chore: add project tooling and CI gate
feat(core): add config schema and validateConfig
feat(core): implement cookie codec and consent state machine
fix(core): return focus to the opener when the settings dialog closes
feat(gtag): add Consent Mode v2 adapter
docs: describe the CSP limit for gated inline scripts
feat(core)!: store the category list as an array in the cookie
```

The pull request title is the squash-commit subject; its description is the body and the
evidence. A durable "why" belongs in `docs/decisions.md`; the detail belongs in the pull request.

## Durable decisions

Append to `docs/decisions.md` only when the maintainer explicitly resolves something or the plan
already determines it. Never edit an existing entry; append a superseding one.

```md
YYYY-MM-DD - <decision as a fact, one sentence> - <why/trigger> (decision #N, plan: <section>)
```

## Safety

- The browser entries (`.`, `./gate`, `./gtag`) have zero runtime dependencies. zod is imported
  only by `./astro` and `validateConfig`; Astro only by `./astro`.
- Never weaken the demo's CSP or add `'unsafe-inline'` to make something pass.
- Never publish to npm from a machine; releases go through the tag workflow with trusted
  publishing. Nothing is ever unpublished; a bad release is fixed forward.
- Do not add or upgrade dependencies without the maintainer's approval.
- Do not change a public contract as an incidental fix.
- Secrets never enter the repository. There are no long-lived tokens to store.

## Public repository

Everything here is public and written for a stranger.

- The demo, tests, fixtures and docs use neutral names only: no real site, brand, customer,
  domain or endpoint. Example hosts are `example.com` and `example.org`.
- No internal links, ticket ids, private hostnames or references to other projects.
- Visitor-facing strings exist only in the demo's locale config; the package ships no copy.

## Package flow

1. Pick the next `docs/progress.md` row, confirm its tier, mark it `[~]`.
2. Tier A: confirm the plan settles the contract, or write the gap down and get a go-ahead.
3. Branch from `main`; implement only that package, with its tests.
4. Run the relevant checks while working; run all of them before review.
5. Open the pull request from the template with the evidence filled in. Update `CHANGELOG.md`
   under `Unreleased` for anything user-visible.
6. Independent review. Fix P1/P2 findings; get targeted re-review.
7. The reviewer marks `[x]` and proposes the commit subject.
8. The maintainer squash-merges with that subject.
