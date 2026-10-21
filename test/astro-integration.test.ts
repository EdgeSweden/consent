// @vitest-environment node
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import consent from "../src/astro/index.js";
import { PAGE_SCRIPT, STYLE_IMPORT, VIRTUAL_CONFIG } from "../src/astro/integration.js";

// Plan: Astro integration. The hook runs against Astro's own Vite, with the Astro API stubbed.

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures/astro");

interface VitePlugin {
  name: string;
  resolveId: (id: string) => string | undefined;
  load: (id: string) => string | undefined;
}

async function setup(config: string) {
  const api = {
    config: { root: pathToFileURL(`${fixtures}/`) },
    logger: { warn: vi.fn() },
    addWatchFile: vi.fn(),
    injectScript: vi.fn(),
    updateConfig: vi.fn(),
  };
  const hook = consent({ config }).hooks["astro:config:setup"] as unknown as (
    a: typeof api,
  ) => Promise<void>;
  const error = await hook(api).then(
    () => undefined,
    (e: unknown) => e as Error,
  );
  const plugins = (api.updateConfig.mock.calls[0]?.[0]?.vite?.plugins ?? []) as VitePlugin[];
  return { api, error, plugin: plugins[0] };
}

function only<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}

describe("consent() Astro integration", () => {
  it("requires a config path", () => {
    expect(() => consent({ config: "" })).toThrow(/pass the config module path/);
    expect(() => consent(undefined as never)).toThrow(/pass the config module path/);
  });

  it("injects one page script that mounts the virtual config, and the stylesheet", async () => {
    const { api, error } = await setup("./valid.config.ts");
    expect(error).toBeUndefined();
    expect(api.injectScript.mock.calls).toEqual([
      ["page-ssr", STYLE_IMPORT],
      ["page", PAGE_SCRIPT],
    ]);
    expect(STYLE_IMPORT).toBe(`import "@edgesweden/consent/styles.css";`);
    expect(PAGE_SCRIPT).toBe(
      [
        `import { mount } from "@edgesweden/consent";`,
        `import config from "virtual:@edgesweden/consent/config";`,
        `mount(config);`,
      ].join("\n"),
    );
    expect(api.logger.warn).not.toHaveBeenCalled();
  });

  it("exposes the config module itself through the virtual module", async () => {
    const plugin = only((await setup("./valid.config.ts")).plugin);
    const resolved = only(plugin.resolveId(VIRTUAL_CONFIG));
    expect(resolved).toBe(`\0${VIRTUAL_CONFIG}`);
    expect(plugin.resolveId("./other.js")).toBeUndefined();
    expect(plugin.load(resolved)).toBe(
      `export { default } from ${JSON.stringify(join(fixtures, "valid.config.ts"))};`,
    );
    expect(plugin.load(join(fixtures, "valid.config.ts"))).toBeUndefined();
  });

  it("resolves an absolute config path as is", async () => {
    const { error, plugin } = await setup(join(fixtures, "valid.config.ts"));
    expect(error).toBeUndefined();
    expect(only(plugin).load(`\0${VIRTUAL_CONFIG}`)).toContain(
      JSON.stringify(join(fixtures, "valid.config.ts")),
    );
  });

  it("watches the config module and the files it imports", async () => {
    const { api } = await setup("./valid.config.ts");
    const watched = api.addWatchFile.mock.calls.map(([f]) => String(f));
    expect(watched).toContain(join(fixtures, "valid.config.ts"));
    expect(watched.some((f) => f.endsWith("strings.ts"))).toBe(true);
  });

  it("fails the build with every validation error and injects nothing", async () => {
    const { api, error } = await setup("./invalid.config.ts");
    expect(error?.message).toMatch(/invalid\.config\.ts is invalid/);
    expect(error?.message).toMatch(/schemaVersion: /);
    expect(error?.message).toMatch(/consentMode: .*v0\.2\.0/);
    expect(api.injectScript).not.toHaveBeenCalled();
    expect(api.updateConfig).not.toHaveBeenCalled();
    // Warnings are still reported when the config is invalid.
    expect(api.logger.warn).toHaveBeenCalledOnce();
  });

  it("logs warnings without failing the build", async () => {
    const { api, error } = await setup("./warning.config.ts");
    expect(error).toBeUndefined();
    expect(api.logger.warn).toHaveBeenCalledOnce();
    expect(api.logger.warn.mock.calls[0]?.[0]).toMatch(/theme\.colors/);
    expect(api.injectScript).toHaveBeenCalledTimes(2);
  });

  it("fails the build when the module has no default export", async () => {
    const { api, error } = await setup("./no-default.config.ts");
    expect(error?.message).toMatch(/has no default export/);
    expect(api.injectScript).not.toHaveBeenCalled();
  });

  it("fails the build when the module cannot be loaded", async () => {
    const missing = await setup("./missing.config.ts");
    expect(missing.error?.message).toMatch(/cannot load \.\/missing\.config\.ts/);
    const broken = await setup("./broken.config.ts");
    expect(broken.error?.message).toMatch(/cannot load/);
    expect(String((broken.error?.cause as Error | undefined)?.message)).toMatch(
      /broken on purpose/,
    );
    expect(broken.api.injectScript).not.toHaveBeenCalled();
  });
});
