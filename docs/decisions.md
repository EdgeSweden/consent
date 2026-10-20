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
