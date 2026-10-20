// @vitest-environment node
// The release gate in scripts/release-check.js (plan: Releases).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = join(import.meta.dirname, "..", "scripts", "release-check.js");

const ENTRY = `# Changelog

## [Unreleased]

## [0.1.0] - 2026-10-20

### Added

- The first release.

## [0.0.1] - 2026-10-01

### Added

- Something older.
`;

let root = "";

function check(tag: string, version: string, changelog: string) {
  root = mkdtempSync(join(tmpdir(), "release-check-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ version }));
  writeFileSync(join(root, "CHANGELOG.md"), changelog);
  const run = spawnSync(process.execPath, [SCRIPT, tag, root], { encoding: "utf8" });
  return { status: run.status, output: run.stdout + run.stderr };
}

afterEach(() => {
  if (root !== "") rmSync(root, { recursive: true, force: true });
  root = "";
});

describe("release-check", () => {
  it("passes a tag that matches the version and has a changelog entry", () => {
    expect(check("v0.1.0", "0.1.0", ENTRY).status).toBe(0);
  });

  it.each(["0.1.0", "v0.1", "v0.1.0-beta.1", "release-0.1.0", ""])("rejects tag %j", (tag) => {
    const { status, output } = check(tag, "0.1.0", ENTRY);
    expect(status).toBe(1);
    expect(output).toContain("is not vX.Y.Z");
  });

  it("rejects a tag that does not match package.json", () => {
    const { status, output } = check("v0.1.0", "0.0.0", ENTRY);
    expect(status).toBe(1);
    expect(output).toContain("does not match package.json version 0.0.0");
  });

  it("rejects a version with no changelog heading", () => {
    const { status, output } = check("v0.2.0", "0.2.0", ENTRY);
    expect(status).toBe(1);
    expect(output).toContain('no "## [0.2.0] - YYYY-MM-DD" heading');
  });

  it("rejects a heading without a date", () => {
    const changelog = ENTRY.replace("## [0.1.0] - 2026-10-20", "## [0.1.0]");
    expect(check("v0.1.0", "0.1.0", changelog).status).toBe(1);
  });

  it("does not let a dot in the version match any character", () => {
    const changelog = ENTRY.replace("## [0.1.0]", "## [0x1x0]");
    expect(check("v0.1.0", "0.1.0", changelog).status).toBe(1);
  });

  it("rejects an entry that lists no changes, even when a later entry does", () => {
    const changelog = ENTRY.replace("- The first release.\n", "");
    const { status, output } = check("v0.1.0", "0.1.0", changelog);
    expect(status).toBe(1);
    expect(output).toContain("lists no changes");
  });

  it("accepts the last entry in the file", () => {
    expect(check("v0.0.1", "0.0.1", ENTRY).status).toBe(0);
  });
});
