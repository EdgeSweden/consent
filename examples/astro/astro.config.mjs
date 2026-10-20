// Demo site for @edgesweden/consent (plan: Demo). `DEMO_VARIANT=non-blocking` builds the same pages
// with a non-blocking banner into its own directory, so e2e can cover both modes.
import { defineConfig } from "astro/config";
import consent from "@edgesweden/consent/astro";

const nonBlocking = process.env["DEMO_VARIANT"] === "non-blocking";

export default defineConfig({
  outDir: nonBlocking ? "./dist/non-blocking" : "./dist/blocking",
  trailingSlash: "always",
  // A strict policy: hashed scripts and styles plus 'self', nothing inline (plan: CSP).
  experimental: { csp: true },
  integrations: [
    consent({
      config: nonBlocking ? "./src/consent.non-blocking.config.ts" : "./src/consent.config.ts",
    }),
  ],
});
