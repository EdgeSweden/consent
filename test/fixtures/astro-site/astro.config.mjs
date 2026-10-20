// Built by test/astro-build.test.ts in a temporary copy whose node_modules hold the Astro version
// under test and the package as built by tsup.
import { defineConfig } from "astro/config";
import consent from "@edgesweden/consent/astro";

export default defineConfig({ integrations: [consent({ config: "./src/consent.config.ts" })] });
