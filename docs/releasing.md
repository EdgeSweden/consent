# Releasing

Releases are published by `.github/workflows/release.yml` from a `vX.Y.Z` tag on `main`
(plan: Releases). Nothing is published from a machine, apart from the one-off bootstrap below.

## Every release

1. A release pull request sets `version` in `package.json` and moves the `Unreleased` entries in
   `CHANGELOG.md` under `## [X.Y.Z] - YYYY-MM-DD`, with a fresh empty `Unreleased` above it. It is
   reviewed and squash-merged like any other package.
2. The maintainer tags the merge commit and pushes the tag:

   ```sh
   git switch main && git pull --ff-only
   git tag -a vX.Y.Z -m vX.Y.Z
   git push origin vX.Y.Z
   ```

3. The workflow runs the full CI job and then refuses to publish unless:
   - the tagged commit is on `main`;
   - the tag is `vX.Y.Z` and equals the `package.json` version;
   - `CHANGELOG.md` has a `## [X.Y.Z] - YYYY-MM-DD` heading with at least one entry.

   It then builds and runs `npm stage publish --provenance --access public` through trusted
   publishing. The version is staged, not yet installable.

4. The maintainer reviews and approves the staged version with 2FA, either under the package's
   staged versions on npmjs.com or from the CLI (npm 11.15 or later):

   ```sh
   npm stage list @edgesweden/consent
   npm stage view <stage-id>
   npm stage approve <stage-id>
   ```

   Reject it with `npm stage reject <stage-id>` if anything looks wrong, then fix forward. npm may
   run an automated review before the approved version becomes installable.

A failed or wrong release is fixed forward with a new patch version. Published versions are never
unpublished. If the workflow fails before publishing, delete the tag, fix the cause through a pull
request and tag again.

## One-off bootstrap (before the first release)

npm can only attach a trusted publisher to a package that already exists, so the name is claimed
once with an empty placeholder (decision #39). The maintainer does this once, by hand:

1. Make sure the npm organisation `edgesweden` exists and you are an owner with two-factor
   authentication enabled.
2. In an empty directory outside this repository, create a `package.json` with only
   `{ "name": "@edgesweden/consent", "version": "0.0.0", "license": "MIT" }` and a `README.md`
   that says it is a placeholder. Publish it with `npm publish --access public`.
3. Deprecate it straight away:
   `npm deprecate @edgesweden/consent@0.0.0 "Placeholder; install 0.1.0 or later."`
4. On npmjs.com, under the package's settings, add a trusted publisher: GitHub Actions,
   organisation `EdgeSweden`, repository `consent`, workflow `release.yml`, no environment. Leave
   "Allow npm publish" and "Allow npm dist-tag" unticked, so the workflow can only stage.
5. In the same settings, set publishing access to require two-factor authentication and disallow
   tokens, so only the workflow can stage and only a maintainer with 2FA can approve.
6. Revoke any token created for step 2 and log out of npm on that machine.
