// @vitest-environment node
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build as tsup } from "tsup";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import tsupConfig from "../tsup.config.js";

// A real `astro build` at the lowest supported Astro (decision #37) and at the current one.

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = join(repo, "test/fixtures");
const require = createRequire(import.meta.url);
const dirs: string[] = [];
let pkg = "";

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "consent-astro-"));
  dirs.push(dir);
  return dir;
}

// The package as published: package.json plus a fresh dist, so `pnpm build` need not run first.
beforeAll(async () => {
  pkg = await tempDir();
  await cp(join(repo, "package.json"), join(pkg, "package.json"));
  await symlink(join(repo, "node_modules"), join(pkg, "node_modules"));
  await tsup({ ...tsupConfig, dts: false, silent: true, outDir: join(pkg, "dist") });
}, 60_000);

afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

async function site(astroPackage: string, config: string): Promise<string> {
  const dir = await tempDir();
  await cp(join(fixtures, "astro-site"), dir, { recursive: true });
  await writeFile(join(dir, "package.json"), '{ "name": "site", "type": "module" }\n');
  for (const file of ["strings.ts", "valid.config.ts"]) {
    await cp(join(fixtures, "astro", file), join(dir, "src", file));
  }
  await cp(join(fixtures, "astro", config), join(dir, "src/consent.config.ts"));
  await mkdir(join(dir, "node_modules/@edgesweden"), { recursive: true });
  await symlink(pkg, join(dir, "node_modules/@edgesweden/consent"));
  await symlink(
    dirname(require.resolve(`${astroPackage}/package.json`)),
    join(dir, "node_modules/astro"),
  );
  return dir;
}

function build(dir: string) {
  return promisify(execFile)(
    process.execPath,
    [join(dir, "node_modules/astro/astro.js"), "build"],
    {
      cwd: dir,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    },
  );
}

function versions(astroPackage: string): { astro: string; vite: string } {
  const astro = require.resolve(`${astroPackage}/package.json`);
  const vite = createRequire(astro).resolve("vite/package.json");
  return { astro: require(astro).version, vite: require(vite).version };
}

it("pins astro-min to the lowest supported Astro and Vite", () => {
  expect(versions("astro-min")).toEqual({ astro: "5.4.0", vite: "6.2.0" });
});

describe.each(["astro-min", "astro"])("astro build with %s", (astroPackage) => {
  it("links the stylesheet and one page script that mounts the banner", async () => {
    const dir = await site(astroPackage, "valid.config.ts");
    await build(dir);
    const html = await readFile(join(dir, "dist/index.html"), "utf8");
    expect(html).toMatch(/<link rel="stylesheet" href="\/_astro\/[^"]+\.css">/);
    const scripts = [
      ...html.matchAll(/<script type="module" src="(\/_astro\/[^"]+\.js)"><\/script>/g),
    ];
    expect(scripts).toHaveLength(1);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/);
    const js = await readFile(join(dir, "dist", scripts[0]?.[1] ?? ""), "utf8");
    expect(js).toContain("consent-root");
    expect(js).toContain("Accept all");
    // Neither adapter ships when the config uses neither.
    expect(js).not.toContain("dataLayer");
    expect(js).not.toContain("data-consent-type");
    const css = await readdir(join(dir, "dist/_astro"));
    expect(css.some((f) => f.endsWith(".css"))).toBe(true);
  }, 60_000);

  it("bundles and installs the adapters the config asks for", async () => {
    const dir = await site(astroPackage, "adapters.config.ts");
    await build(dir);
    const html = await readFile(join(dir, "dist/index.html"), "utf8");
    const scripts = [
      ...html.matchAll(/<script type="module" src="(\/_astro\/[^"]+\.js)"><\/script>/g),
    ];
    expect(scripts).toHaveLength(1);
    const js = await readFile(join(dir, "dist", scripts[0]?.[1] ?? ""), "utf8");
    expect(js).toContain("consent-root");
    expect(js).toContain("dataLayer");
    expect(js).toContain("data-consent-type");
  }, 60_000);

  it("fails on an invalid config", async () => {
    const dir = await site(astroPackage, "invalid.config.ts");
    const error = await build(dir).then(
      () => undefined,
      (e: { stdout: string; stderr: string }) => e.stdout + e.stderr,
    );
    expect(error).toMatch(/consent\.config\.ts is invalid[\s\S]*gpc: /);
    await expect(readdir(join(dir, "dist"))).rejects.toThrow();
  }, 60_000);
});
