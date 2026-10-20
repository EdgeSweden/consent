// The release gate (plan: Releases). Run by release.yml before publishing: fails unless the tag is
// `vX.Y.Z`, equals the `package.json` version and `CHANGELOG.md` has a non-empty
// `## [X.Y.Z] - YYYY-MM-DD` section. Usage: node scripts/release-check.js <tag> [root]

import { readFileSync } from "node:fs";
import { join } from "node:path";

const [tag = "", root = "."] = process.argv.slice(2);

function fail(message) {
  console.error(`release-check: ${message}`);
  process.exit(1);
}

const version = /^v(\d+\.\d+\.\d+)$/.exec(tag)?.[1];
if (version === undefined) fail(`tag "${tag}" is not vX.Y.Z.`);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.version !== version) {
  fail(`tag ${tag} does not match package.json version ${pkg.version}.`);
}

const lines = readFileSync(join(root, "CHANGELOG.md"), "utf8").split("\n");
const heading = lines.findIndex((line) =>
  new RegExp(`^## \\[${version.replaceAll(".", "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`).test(line),
);
if (heading === -1) fail(`CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" heading.`);

const next = lines.findIndex((line, i) => i > heading && /^## /.test(line));
const body = lines.slice(heading + 1, next === -1 ? undefined : next);
if (!body.some((line) => /^\s*- \S/.test(line))) {
  fail(`the CHANGELOG.md entry for ${version} lists no changes.`);
}

console.log(`release-check: ${tag} is ready to publish.`);
