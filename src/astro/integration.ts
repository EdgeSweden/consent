// The Astro integration (plan: Astro integration). Loads the site's config module at build time,
// fails the build when validateConfig rejects it, exposes the module through a virtual module and
// injects one page script that calls `mount` and installs the adapters the config asks for. The stylesheet is imported from every page's
// frontmatter (decision #29), the only stage at which Astro bundles an injected CSS import.

import { createRequire } from "node:module";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AstroIntegration } from "astro";
import type { ConsentConfig } from "./schema.js";
import { validateConfig, type ValidationIssue } from "./validate.js";

export interface ConsentIntegrationOptions {
  /** Path to the config module, relative to the Astro project root. Its default export is the config. */
  config: string;
}

export const VIRTUAL_CONFIG = "virtual:@edgesweden/consent/config";
const RESOLVED_CONFIG = `\0${VIRTUAL_CONFIG}`;

/**
 * The injected page script; Astro bundles and hashes it like any other page script (plan: CSP).
 * An adapter is imported only when the config uses it, so a site that uses neither ships neither
 * (plan: Astro integration). Consent Mode installs before gating, so its `default` command is
 * queued before a required gated script can run.
 */
export function pageScript(config: ConsentConfig): string {
  const gate = config.gateScripts === true;
  const gtag = config.consentMode !== undefined;
  return [
    `import { mount } from "@edgesweden/consent";`,
    ...(gtag ? [`import { installConsentMode } from "@edgesweden/consent/gtag";`] : []),
    ...(gate ? [`import { installScriptGating } from "@edgesweden/consent/gate";`] : []),
    `import config from "${VIRTUAL_CONFIG}";`,
    `mount(config);`,
    ...(gtag ? [`installConsentMode(config);`] : []),
    ...(gate ? [`installScriptGating(config);`] : []),
  ].join("\n");
}

/** Emitted as a `<link rel="stylesheet">` to a bundled file, which `style-src 'self'` allows. */
export const STYLE_IMPORT = `import "@edgesweden/consent/styles.css";`;

type RunnerImport = (
  path: string,
  config: { root: string; configFile: false; logLevel: "silent" },
) => Promise<{ module: Record<string, unknown>; dependencies: string[] }>;

// Vite is Astro's dependency, not ours: resolve the copy the site's Astro uses. `runnerImport`
// arrives in Vite 6.1; Astro 5.4 is the first release that requires it (decision #37).
async function loadRunnerImport(root: string): Promise<RunnerImport> {
  const astro = createRequire(join(root, "package.json")).resolve("astro");
  const vite = (await import(pathToFileURL(createRequire(astro).resolve("vite")).href)) as {
    runnerImport?: RunnerImport;
  };
  if (typeof vite.runnerImport !== "function") {
    throw new Error("@edgesweden/consent/astro needs Astro >= 5.4.");
  }
  return vite.runnerImport;
}

function list(issues: ValidationIssue[]): string {
  return issues.map((i) => `  ${i.path}: ${i.message}`).join("\n");
}

export default function consent(options: ConsentIntegrationOptions): AstroIntegration {
  if (typeof options?.config !== "string" || options.config === "") {
    throw new Error(
      '@edgesweden/consent/astro: pass the config module path, e.g. consent({ config: "./src/consent.config.ts" }).',
    );
  }
  return {
    name: "@edgesweden/consent",
    hooks: {
      "astro:config:setup": async ({
        config,
        logger,
        addWatchFile,
        injectScript,
        updateConfig,
      }) => {
        const root = fileURLToPath(config.root);
        const file = isAbsolute(options.config) ? options.config : resolve(root, options.config);

        const runnerImport = await loadRunnerImport(root);
        let loaded: Awaited<ReturnType<RunnerImport>>;
        try {
          loaded = await runnerImport(file, { root, configFile: false, logLevel: "silent" });
        } catch (cause) {
          throw new Error(`@edgesweden/consent: cannot load ${options.config}.`, { cause });
        }
        // A change to the config or anything it imports restarts the dev server, which revalidates.
        for (const dep of new Set([file, ...loaded.dependencies])) addWatchFile(dep);

        if (!("default" in loaded.module)) {
          throw new Error(`@edgesweden/consent: ${options.config} has no default export.`);
        }
        const result = validateConfig(loaded.module.default);
        if (result.warnings.length > 0) {
          logger.warn(`${options.config}:\n${list(result.warnings)}`);
        }
        if (!result.ok) {
          throw new Error(
            `@edgesweden/consent: ${options.config} is invalid.\n${list(result.errors)}`,
          );
        }

        updateConfig({
          vite: {
            plugins: [
              {
                name: "@edgesweden/consent:config",
                resolveId: (id) => (id === VIRTUAL_CONFIG ? RESOLVED_CONFIG : undefined),
                // Re-exported rather than serialised, so a `record` function reaches the browser.
                load: (id) =>
                  id === RESOLVED_CONFIG
                    ? `export { default } from ${JSON.stringify(file)};`
                    : undefined,
              },
            ],
          },
        });
        injectScript("page-ssr", STYLE_IMPORT);
        injectScript("page", pageScript(result.config));
      },
    },
  };
}
