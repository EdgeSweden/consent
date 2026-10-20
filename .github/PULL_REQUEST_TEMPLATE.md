<!-- Title = squash-commit subject in Conventional Commits form,
     e.g. `feat(core): add config schema and validateConfig`. See AGENTS.md. -->

## Package

<!-- The docs/progress.md row and tier, e.g. `(A) P1.1 - Config schema + validateConfig`. -->

## Why

<!-- What a reader cannot get from the diff. Becomes the commit body. -->

## Checks

<!-- Every check from AGENTS.md: result, or why it could not run locally. -->

- `check:types` -
- `check:lint` -
- `check:format` -
- `check:test` -
- `check:deps` -
- `check:build` -
- `check:size` -
- `check:e2e` -

## Checklist

- [ ] Tests cover the behaviour this package adds or changes
- [ ] `CHANGELOG.md` updated under Unreleased, or nothing user-visible changed
- [ ] `docs/decisions.md` appended, or nothing durable was decided
- [ ] No real site, brand, domain or endpoint in the demo, tests or docs
